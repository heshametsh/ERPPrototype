Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AITeamSha256Text {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Test-AITeamCommitSha {
    param([AllowNull()][object]$Value, [switch]$AllowNull)
    if ($null -eq $Value) { return [bool]$AllowNull }
    return ([string]$Value) -match '^[0-9a-fA-F]{7,40}$'
}

function Invoke-AITeamGit {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    $output = & git -C $RepoRoot @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join "`n")
}

function Get-AITeamRepoState {
    param([Parameter(Mandatory)][string]$RepoRoot)

    $root = [System.IO.Path]::GetFullPath($RepoRoot)
    $head = (Invoke-AITeamGit -RepoRoot $root -Arguments @('rev-parse','HEAD')).Trim()
    $branch = (Invoke-AITeamGit -RepoRoot $root -Arguments @('branch','--show-current')).Trim()
    $status = Invoke-AITeamGit -RepoRoot $root -Arguments @('status','--porcelain=v1','--untracked-files=all')
    $trackedDiff = Invoke-AITeamGit -RepoRoot $root -Arguments @('diff','--binary','HEAD','--','.')
    $untrackedRaw = Invoke-AITeamGit -RepoRoot $root -Arguments @('ls-files','--others','--exclude-standard')

    $untracked = @()
    if (-not [string]::IsNullOrWhiteSpace($untrackedRaw)) {
        foreach ($rel in ($untrackedRaw -split "`n" | Where-Object { $_ -ne '' } | Sort-Object)) {
            $full = Join-Path $root $rel
            if (Test-Path -LiteralPath $full -PathType Leaf) {
                $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
                $size = (Get-Item -LiteralPath $full).Length
            }
            else {
                $hash = 'NON_FILE'
                $size = -1
            }
            $untracked += [pscustomobject][ordered]@{
                path = $rel
                sha256 = $hash
                size = $size
            }
        }
    }

    $payload = [ordered]@{
        head = $head
        statusSha256 = Get-AITeamSha256Text -Text $status
        trackedDiffSha256 = Get-AITeamSha256Text -Text $trackedDiff
        untracked = $untracked
    }
    $payloadJson = $payload | ConvertTo-Json -Depth 12 -Compress
    $fingerprint = Get-AITeamSha256Text -Text $payloadJson

    return [pscustomobject][ordered]@{
        schemaVersion = 1
        repoRoot = $root
        head = $head
        branch = $branch
        isClean = [string]::IsNullOrWhiteSpace($status)
        fingerprint = $fingerprint
        statusSha256 = $payload.statusSha256
        trackedDiffSha256 = $payload.trackedDiffSha256
        untracked = $untracked
    }
}

function Compare-AITeamRepoState {
    param(
        [Parameter(Mandatory)][object]$Baseline,
        [Parameter(Mandatory)][object]$Current
    )

    $differences = @()
    if ([string]$Baseline.head -ne [string]$Current.head) {
        $differences += "HEAD: $($Baseline.head) -> $($Current.head)"
    }
    if ([string]$Baseline.trackedDiffSha256 -ne [string]$Current.trackedDiffSha256) {
        $differences += 'Tracked working-tree/staged diff changed.'
    }

    $oldUntracked = @{}
    foreach ($item in @($Baseline.untracked)) { $oldUntracked[[string]$item.path] = $item }
    $newUntracked = @{}
    foreach ($item in @($Current.untracked)) { $newUntracked[[string]$item.path] = $item }

    $oldKeys = @($oldUntracked.Keys)
    $newKeys = @($newUntracked.Keys)
    $added = @($newKeys | Where-Object { -not $oldUntracked.ContainsKey($_) } | Sort-Object)
    $removed = @($oldKeys | Where-Object { -not $newUntracked.ContainsKey($_) } | Sort-Object)
    $changed = @($oldKeys | Where-Object {
        $newUntracked.ContainsKey($_) -and (
            [string]$oldUntracked[$_].sha256 -ne [string]$newUntracked[$_].sha256 -or
            [int64]$oldUntracked[$_].size -ne [int64]$newUntracked[$_].size
        )
    } | Sort-Object)

    if ($added.Count -gt 0) { $differences += 'Untracked added: ' + ($added -join ', ') }
    if ($removed.Count -gt 0) { $differences += 'Untracked removed: ' + ($removed -join ', ') }
    if ($changed.Count -gt 0) { $differences += 'Untracked changed: ' + ($changed -join ', ') }

    $pass = ([string]$Baseline.fingerprint -eq [string]$Current.fingerprint)
    return [pscustomobject][ordered]@{
        pass = $pass
        baselineFingerprint = [string]$Baseline.fingerprint
        currentFingerprint = [string]$Current.fingerprint
        differences = $differences
    }
}

function Test-AITeamEvidenceLocation {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$Location
    )

    if ($Location -notmatch '^(?<file>.+):(?<line>[1-9][0-9]*)$') {
        return [pscustomobject][ordered]@{ pass=$false; error='evidence location must be file:line'; file=$null; line=$null }
    }

    $root = [System.IO.Path]::GetFullPath($RepoRoot)
    $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $rel = $Matches.file
    $lineNo = [int]$Matches.line
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

    if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject][ordered]@{ pass=$false; error="evidence escapes repo: $rel"; file=$rel; line=$lineNo }
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        return [pscustomobject][ordered]@{ pass=$false; error="evidence file missing: $rel"; file=$rel; line=$lineNo }
    }

    try { $lines = [System.IO.File]::ReadAllLines($full) }
    catch { return [pscustomobject][ordered]@{ pass=$false; error="cannot read evidence file: $rel"; file=$rel; line=$lineNo } }

    if ($lineNo -gt $lines.Length) {
        return [pscustomobject][ordered]@{ pass=$false; error="evidence line $lineNo > $($lines.Length): $rel"; file=$rel; line=$lineNo }
    }

    $lineText = [string]$lines[$lineNo - 1]
    return [pscustomobject][ordered]@{
        pass = $true
        error = $null
        file = $rel
        line = $lineNo
        lineSha256 = Get-AITeamSha256Text -Text $lineText
    }
}

function Test-AITeamFindingReport {
    param(
        [Parameter(Mandatory)][string]$ReportPath,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedSha,
        [Parameter(Mandatory)][string]$ExpectedMission,
        [string]$ExpectedRole
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try {
        $data = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        $errors.Add("cannot parse report JSON: $($_.Exception.Message)")
        return [pscustomobject][ordered]@{ pass=$false; errors=@($errors); agentRole=$null; findingCount=0; leadView=$null; evidenceDigests=@() }
    }

    $required = @('schemaVersion','agentRole','mission','commitSha','summary','coverage','findings','confidenceTelemetry')
    $props = @($data.PSObject.Properties.Name)
    foreach ($key in $required) {
        if ($props -notcontains $key) { $errors.Add("missing required field $key") }
    }

    if ($props -contains 'schemaVersion' -and [int]$data.schemaVersion -ne 2) {
        $errors.Add('wrong schemaVersion; expected 2')
    }
    if ($props -contains 'mission' -and [string]$data.mission -ne $ExpectedMission) {
        $errors.Add("mission '$($data.mission)' does not match expected '$ExpectedMission'")
    }
    if ($props -contains 'commitSha') {
        $got = [string]$data.commitSha
        if ($got -notmatch '^[0-9a-fA-F]{40}$') {
            $errors.Add("commitSha '$got' must be the full 40-character Git SHA")
        }
        elseif ($got.ToLowerInvariant() -ne $ExpectedSha.ToLowerInvariant()) {
            $errors.Add("commitSha '$got' does not match expected '$ExpectedSha'")
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedRole) -and $props -contains 'agentRole') {
        if ([string]$data.agentRole -ne $ExpectedRole) {
            $errors.Add("agentRole '$($data.agentRole)' does not match expected '$ExpectedRole'")
        }
    }
    if ($props -contains 'summary' -and [string]::IsNullOrWhiteSpace([string]$data.summary)) {
        $errors.Add('summary must be non-empty')
    }

    if ($props -contains 'coverage') {
        $coverageProps = @($data.coverage.PSObject.Properties.Name)
        foreach ($key in @('inspectedAreas','evidenceAnchors','excludedAsIrrelevant','unresolved')) {
            if ($coverageProps -notcontains $key) { $errors.Add("coverage.$key is required") }
        }
        if ($coverageProps -contains 'inspectedAreas' -and @($data.coverage.inspectedAreas).Count -eq 0) {
            $errors.Add('coverage.inspectedAreas must contain at least one item')
        }
        if ($coverageProps -contains 'evidenceAnchors') {
            $anchors = @($data.coverage.evidenceAnchors)
            if ($anchors.Count -eq 0) { $errors.Add('coverage.evidenceAnchors must contain at least one item') }
            foreach ($anchor in $anchors) {
                $checkedAnchor = Test-AITeamEvidenceLocation -RepoRoot $RepoRoot -Location ([string]$anchor)
                if (-not $checkedAnchor.pass) { $errors.Add("coverage anchor $($checkedAnchor.error)") }
            }
        }
    }

    $findings = @()
    if ($props -contains 'findings') { $findings = @($data.findings) }
    if ($findings.Count -gt 5) { $errors.Add('findings must contain at most 5 items') }

    $ids = @{}
    $evidenceDigests = @()
    for ($i=0; $i -lt $findings.Count; $i++) {
        $f = $findings[$i]
        $fProps = @($f.PSObject.Properties.Name)
        foreach ($key in @('id','claim','evidence','impact','verification','challenge')) {
            if ($fProps -notcontains $key) {
                $errors.Add("finding $($i+1) missing/non-empty $key")
                continue
            }
            if ($key -ne 'evidence' -and [string]::IsNullOrWhiteSpace([string]$f.$key)) {
                $errors.Add("finding $($i+1) missing/non-empty $key")
            }
        }

        if ($fProps -contains 'id') {
            $id = [string]$f.id
            if ($id -notmatch '^[A-Z][A-Z0-9-]*-[0-9]{2}$') { $errors.Add("finding $($i+1) invalid id '$id'") }
            elseif ($ids.ContainsKey($id)) { $errors.Add("duplicate finding id '$id'") }
            else { $ids[$id] = $true }
        }

        if ($fProps -notcontains 'evidence') { continue }
        $evidence = @($f.evidence)
        if ($evidence.Count -eq 0) {
            $errors.Add("finding $($i+1) missing/non-empty evidence")
            continue
        }

        foreach ($e in $evidence) {
            $eProps = @($e.PSObject.Properties.Name)
            if ($eProps -notcontains 'location' -or [string]::IsNullOrWhiteSpace([string]$e.location)) {
                $errors.Add("finding $($i+1) evidence missing location")
                continue
            }
            if ($eProps -notcontains 'detail' -or [string]::IsNullOrWhiteSpace([string]$e.detail)) {
                $errors.Add("finding $($i+1) evidence missing detail")
            }
            $checked = Test-AITeamEvidenceLocation -RepoRoot $RepoRoot -Location ([string]$e.location)
            if (-not $checked.pass) {
                $errors.Add("finding $($i+1) $($checked.error)")
            }
            else {
                $evidenceDigests += [pscustomobject][ordered]@{
                    findingId = if ($fProps -contains 'id') { [string]$f.id } else { "finding-$($i+1)" }
                    location = [string]$e.location
                    lineSha256 = [string]$checked.lineSha256
                }
            }
        }
    }

    $lead = [ordered]@{}
    foreach ($p in $data.PSObject.Properties) {
        if ($p.Name -ne 'confidenceTelemetry') { $lead[$p.Name] = $p.Value }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        agentRole = if ($props -contains 'agentRole') { [string]$data.agentRole } else { $null }
        findingCount = $findings.Count
        leadView = [pscustomobject]$lead
        evidenceDigests = $evidenceDigests
    }
}

function Test-AITeamReviewerCompletion {
    param(
        [Parameter(Mandatory)][string[]]$Required,
        [string[]]$Passed = @()
    )
    $requiredUnique = @($Required | Select-Object -Unique)
    $passedSet = @{}
    foreach ($p in @($Passed)) { $passedSet[$p] = $true }
    $missing = @($requiredUnique | Where-Object { -not $passedSet.ContainsKey($_) })
    return [pscustomobject][ordered]@{
        pass = ($missing.Count -eq 0)
        required = $requiredUnique
        passed = @($Passed | Select-Object -Unique)
        missing = $missing
    }
}

function Test-AITeamSuite {
    param(
        [Parameter(Mandatory)][string]$SuitePath,
        [Parameter(Mandatory)][string]$OraclePath
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try { $suite = Get-Content -LiteralPath $SuitePath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { $errors.Add("cannot parse suite: $($_.Exception.Message)"); $suite = $null }
    try { $oracle = Get-Content -LiteralPath $OraclePath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { $errors.Add("cannot parse oracles: $($_.Exception.Message)"); $oracle = $null }

    $missionIds = @{}
    $suiteVersion = if ($null -ne $suite) { [int]$suite.schemaVersion } else { 0 }
    if ($null -ne $suite) {
        if (@(1,2) -notcontains $suiteVersion) { $errors.Add('suite schemaVersion must be 1 or 2') }
        $missions = @($suite.missions)
        if ($missions.Count -eq 0) { $errors.Add('missions must be a non-empty array') }
        foreach ($m in $missions) {
            $id = [string]$m.id
            if ($id -notmatch '^AIT-[0-9]{2}$') { $errors.Add("invalid mission id '$id'"); continue }
            if ($missionIds.ContainsKey($id)) { $errors.Add("duplicate mission id $id") }
            $missionIds[$id] = $true
            foreach ($key in @('name','purpose','mode','objective')) {
                if (@($m.PSObject.Properties.Name) -notcontains $key -or [string]::IsNullOrWhiteSpace([string]$m.$key)) {
                    $errors.Add("$id missing/non-empty $key")
                }
            }
            if (@('review','product','deterministic') -notcontains [string]$m.mode) { $errors.Add("$id unsupported mode $($m.mode)") }
            $names = @($m.PSObject.Properties.Name)
            if ($names -contains 'routingHint' -or $names -contains 'successSignals' -or $names -contains 'failureSignals') {
                $errors.Add("$id leaks evaluation oracle into mission file")
            }
            if ($suiteVersion -eq 2 -and $names -contains 'webPolicy') {
                if (@('forbidden','allowed-if-needed','required') -notcontains [string]$m.webPolicy) {
                    $errors.Add("$id unsupported webPolicy $($m.webPolicy)")
                }
            }
        }
    }

    $oracleIds = @{}
    $oracleVersion = if ($null -ne $oracle) { [int]$oracle.schemaVersion } else { 0 }
    if ($null -ne $oracle) {
        if (@(1,2) -notcontains $oracleVersion) { $errors.Add('oracle schemaVersion must be 1 or 2') }
        foreach ($o in @($oracle.oracles)) {
            $id = [string]$o.id
            if ($oracleIds.ContainsKey($id)) { $errors.Add("duplicate oracle id $id") }
            $oracleIds[$id] = $true
            if (-not $missionIds.ContainsKey($id)) { $errors.Add("oracle $id has no mission") }
            $names = @($o.PSObject.Properties.Name)
            if ($oracleVersion -eq 1) {
                if ($names -notcontains 'routingExpectation' -or $names -notcontains 'successSignals') { $errors.Add("oracle $id missing expectations") }
            }
            else {
                if ($names -notcontains 'routing' -or $names -notcontains 'successSignals' -or $names -notcontains 'failureSignals') {
                    $errors.Add("oracle $id missing V3 routing/success/failure expectations")
                }
                else {
                    $routingNames = @($o.routing.PSObject.Properties.Name)
                    foreach ($key in @('requiredRoles','forbiddenRoles','maxReviewers')) {
                        if ($routingNames -notcontains $key) { $errors.Add("oracle $id routing.$key missing") }
                    }
                }
            }
        }
    }

    foreach ($id in $missionIds.Keys) {
        if (-not $oracleIds.ContainsKey($id)) { $errors.Add("mission $id is missing an oracle") }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        missionCount = $missionIds.Count
        suiteSchemaVersion = $suiteVersion
        oracleSchemaVersion = $oracleVersion
    }
}

function Test-AITeamRoutingOracle {
    param(
        [Parameter(Mandatory)][string]$OraclePath,
        [Parameter(Mandatory)][string]$TestId,
        [string[]]$Selected = @()
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try { $oracle = Get-Content -LiteralPath $OraclePath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch {
        return [pscustomobject][ordered]@{ pass=$false; errors=@("cannot parse oracles: $($_.Exception.Message)"); selected=@($Selected) }
    }

    $entries = @($oracle.oracles | Where-Object { [string]$_.id -eq $TestId })
    if ($entries.Count -ne 1) {
        return [pscustomobject][ordered]@{ pass=$false; errors=@("oracle entry $TestId not found exactly once"); selected=@($Selected) }
    }

    $entry = $entries[0]
    $selectedUnique = @($Selected | Select-Object -Unique)
    if ([int]$oracle.schemaVersion -eq 1) {
        $expected = @($entry.routingExpectation)
        $missing = @($expected | Where-Object { $selectedUnique -notcontains $_ })
        $extra = @($selectedUnique | Where-Object { $expected -notcontains $_ })
        if ($missing.Count -gt 0) { $errors.Add('missing expected role(s): ' + ($missing -join ', ')) }
        if ($extra.Count -gt 0) { $errors.Add('unexpected role(s): ' + ($extra -join ', ')) }
        return [pscustomobject][ordered]@{
            pass = ($errors.Count -eq 0)
            errors = @($errors)
            selected = $selectedUnique
            required = $expected
            forbiddenSelected = @()
            maxReviewers = $expected.Count
        }
    }

    $required = @($entry.routing.requiredRoles)
    $forbidden = @($entry.routing.forbiddenRoles)
    $maxReviewers = [int]$entry.routing.maxReviewers
    $missingRequired = @($required | Where-Object { $selectedUnique -notcontains $_ })
    $forbiddenSelected = @($selectedUnique | Where-Object { $forbidden -contains $_ })

    if ($missingRequired.Count -gt 0) { $errors.Add('missing required role(s): ' + ($missingRequired -join ', ')) }
    if ($forbiddenSelected.Count -gt 0) { $errors.Add('forbidden role(s) selected: ' + ($forbiddenSelected -join ', ')) }
    if ($selectedUnique.Count -gt $maxReviewers) { $errors.Add("selected $($selectedUnique.Count) reviewers; max is $maxReviewers") }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        selected = $selectedUnique
        required = $required
        missingRequired = $missingRequired
        forbiddenSelected = $forbiddenSelected
        maxReviewers = $maxReviewers
    }
}

function Test-AITeamMissionPacket {
    param(
        [Parameter(Mandatory)][string]$PacketPath,
        [Parameter(Mandatory)][string]$ExpectedSha
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try { $data = Get-Content -LiteralPath $PacketPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch {
        return [pscustomobject][ordered]@{ pass=$false; errors=@("cannot parse Mission Packet JSON: $($_.Exception.Message)") }
    }

    $required = @('schemaVersion','runId','missionId','mission','mode','commitSha','workspaceFingerprint','objective','requiredBehaviors','decisionRefs','exclusions','webPolicy')
    $props = @($data.PSObject.Properties.Name)
    foreach ($key in $required) { if ($props -notcontains $key) { $errors.Add("missing required field $key") } }

    if ($props -contains 'schemaVersion' -and [int]$data.schemaVersion -ne 1) { $errors.Add('Mission Packet schemaVersion must be 1') }
    if ($props -contains 'commitSha' -and [string]$data.commitSha -ne $ExpectedSha) { $errors.Add('Mission Packet commitSha does not match expected full SHA') }
    if ($props -contains 'workspaceFingerprint' -and [string]$data.workspaceFingerprint -notmatch '^[0-9a-fA-F]{64}$') { $errors.Add('Mission Packet workspaceFingerprint must be a 64-character SHA256') }
    if ($props -contains 'mode' -and @('review','product','deterministic') -notcontains [string]$data.mode) { $errors.Add('Mission Packet mode is invalid') }
    if ($props -contains 'webPolicy' -and @('forbidden','allowed-if-needed','required') -notcontains [string]$data.webPolicy) { $errors.Add('Mission Packet webPolicy is invalid') }
    if ($props -contains 'objective' -and [string]::IsNullOrWhiteSpace([string]$data.objective)) { $errors.Add('Mission Packet objective is required') }

    if ($props -contains 'decisionRefs') {
        foreach ($id in @($data.decisionRefs)) {
            if ([string]$id -notmatch '^DEC-[0-9]{3}$') { $errors.Add("Mission Packet invalid Decision reference '$id'") }
        }
    }

    if ($props -contains 'requiredBehaviors') {
        $ids = @{}
        foreach ($rb in @($data.requiredBehaviors)) {
            if ([string]$rb.id -notmatch '^RB-[0-9]{2}$') { $errors.Add("Mission Packet invalid required behavior id '$($rb.id)'") }
            elseif ($ids.ContainsKey([string]$rb.id)) { $errors.Add("Mission Packet duplicate required behavior id '$($rb.id)'") }
            else { $ids[[string]$rb.id] = $true }
            if ([string]::IsNullOrWhiteSpace([string]$rb.behavior)) { $errors.Add("Mission Packet $($rb.id) behavior is required") }
            if ($null -ne $rb.sourceDecision -and -not [string]::IsNullOrWhiteSpace([string]$rb.sourceDecision) -and [string]$rb.sourceDecision -notmatch '^DEC-[0-9]{3}$') {
                $errors.Add("Mission Packet $($rb.id) sourceDecision is invalid")
            }
        }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        missionId = if ($props -contains 'missionId') { [string]$data.missionId } else { $null }
        requiredBehaviorCount = if ($props -contains 'requiredBehaviors') { @($data.requiredBehaviors).Count } else { 0 }
    }
}

function Test-AITeamLeadReport {
    param(
        [Parameter(Mandatory)][string]$ReportPath,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedSha,
        [Parameter(Mandatory)][string]$ExpectedMission
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try { $data = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch {
        return [pscustomobject][ordered]@{ pass=$false; errors=@("cannot parse Lead report JSON: $($_.Exception.Message)") }
    }

    $required = @('schemaVersion','mission','commitSha','verdict','userSummary','agreedFacts','gaps','disagreements','decisionRequired','decision','systemQuality','nextStep')
    $props = @($data.PSObject.Properties.Name)
    foreach ($key in $required) { if ($props -notcontains $key) { $errors.Add("missing required field $key") } }

    if ($props -contains 'schemaVersion' -and [int]$data.schemaVersion -ne 3) { $errors.Add('Lead schemaVersion must be 3') }
    if ($props -contains 'mission' -and [string]$data.mission -ne $ExpectedMission) { $errors.Add('Lead mission does not match expected mission') }
    if ($props -contains 'commitSha' -and [string]$data.commitSha -ne $ExpectedSha) { $errors.Add('Lead commitSha does not match expected full SHA') }
    if ($props -contains 'verdict' -and @('PASS','PASS_WITH_GAPS','DEGRADED','FAIL') -notcontains [string]$data.verdict) { $errors.Add('Lead verdict is invalid') }
    if ($props -contains 'userSummary' -and [string]::IsNullOrWhiteSpace([string]$data.userSummary)) { $errors.Add('Lead userSummary is required') }
    if ($props -contains 'nextStep' -and [string]::IsNullOrWhiteSpace([string]$data.nextStep)) { $errors.Add('Lead nextStep is required') }

    if ($props -contains 'decisionRequired') {
        $decisionRequired = [bool]$data.decisionRequired
        if ($decisionRequired -and $null -eq $data.decision) { $errors.Add('decisionRequired=true requires decision object') }
        if (-not $decisionRequired -and $null -ne $data.decision) { $errors.Add('decisionRequired=false requires decision=null') }
    }

    if ($props -contains 'agreedFacts') {
        foreach ($fact in @($data.agreedFacts)) {
            if ([string]::IsNullOrWhiteSpace([string]$fact.claim)) { $errors.Add('agreedFacts claim is required') }
            $sources = @($fact.sources)
            if ($sources.Count -eq 0) { $errors.Add('agreedFacts sources must be non-empty') }
            foreach ($source in $sources) {
                $checked = Test-AITeamEvidenceLocation -RepoRoot $RepoRoot -Location ([string]$source)
                if (-not $checked.pass) { $errors.Add("Lead agreedFact $($checked.error)") }
            }
        }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        verdict = if ($props -contains 'verdict') { [string]$data.verdict } else { $null }
        decisionRequired = if ($props -contains 'decisionRequired') { [bool]$data.decisionRequired } else { $null }
    }
}

function Test-AITeamProductReport {
    param(
        [Parameter(Mandatory)][string]$ReportPath,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedSha,
        [Parameter(Mandatory)][string]$ExpectedMission
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try { $data = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch {
        return [pscustomobject][ordered]@{ pass=$false; errors=@("cannot parse Product report JSON: $($_.Exception.Message)") }
    }

    $required = @('schemaVersion','agentRole','mission','commitSha','jobToBeDone','projectFacts','opportunities','doNotBuild','questions','recommendedNextDiscussion')
    $props = @($data.PSObject.Properties.Name)
    foreach ($key in $required) { if ($props -notcontains $key) { $errors.Add("missing required field $key") } }

    if ($props -contains 'schemaVersion' -and [int]$data.schemaVersion -ne 1) { $errors.Add('Product schemaVersion must be 1') }
    if ($props -contains 'agentRole' -and [string]$data.agentRole -ne 'product-erp-partner') { $errors.Add('Product agentRole must be product-erp-partner') }
    if ($props -contains 'mission' -and [string]$data.mission -ne $ExpectedMission) { $errors.Add('Product mission does not match expected mission') }
    if ($props -contains 'commitSha' -and [string]$data.commitSha -ne $ExpectedSha) { $errors.Add('Product commitSha does not match expected full SHA') }

    $projectFacts = @()
    if ($props -contains 'projectFacts') { $projectFacts = @($data.projectFacts) }
    foreach ($fact in $projectFacts) {
        if ([string]::IsNullOrWhiteSpace([string]$fact.claim)) { $errors.Add('Product projectFact claim is required') }
        $evidence = @($fact.evidence)
        if ($evidence.Count -eq 0) { $errors.Add('Product projectFact requires evidence'); continue }
        foreach ($e in $evidence) {
            if ([string]::IsNullOrWhiteSpace([string]$e.detail)) { $errors.Add('Product projectFact evidence detail is required') }
            $checked = Test-AITeamEvidenceLocation -RepoRoot $RepoRoot -Location ([string]$e.location)
            if (-not $checked.pass) { $errors.Add("Product projectFact $($checked.error)") }
        }
    }

    $opportunities = @()
    if ($props -contains 'opportunities') { $opportunities = @($data.opportunities) }
    if ($opportunities.Count -gt 4) { $errors.Add('Product opportunities must contain at most 4 items') }
    foreach ($item in $opportunities) {
        foreach ($key in @('id','problem','proposal','whyBetter','employeeExample','tradeoff','externalPatternRefs')) {
            if (@($item.PSObject.Properties.Name) -notcontains $key) { $errors.Add("Product opportunity missing $key") }
        }
        foreach ($url in @($item.externalPatternRefs)) {
            if ([string]$url -notmatch '^https?://') { $errors.Add("Product externalPatternRef is not http/https: $url") }
        }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        opportunityCount = $opportunities.Count
    }
}

function Test-AITeamProjectBrain {
    param([Parameter(Mandatory)][string]$RepoRoot)

    $errors = New-Object System.Collections.Generic.List[string]
    $root = [System.IO.Path]::GetFullPath($RepoRoot)
    $brain = Join-Path $root 'ERPPrototype\Documentation\brain'
    $indexPath = Join-Path $brain 'decisions-index.yaml'
    $aliasPath = Join-Path $brain 'field-aliases.yaml'
    $logPath = Join-Path $root 'ERPPrototype\Documentation\08_DECISIONS_LOG.md'

    try { $index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { $errors.Add("cannot parse decisions index: $($_.Exception.Message)"); $index = $null }
    try { $aliases = Get-Content -LiteralPath $aliasPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { $errors.Add("cannot parse field aliases: $($_.Exception.Message)"); $aliases = $null }

    $logIds = @{}
    if (Test-Path -LiteralPath $logPath) {
        $text = Get-Content -LiteralPath $logPath -Raw -Encoding UTF8
        foreach ($m in [regex]::Matches($text, '(?m)^##\s+(DEC-\d{3})\b')) { $logIds[$m.Groups[1].Value] = $true }
    }
    else { $errors.Add('missing 08_DECISIONS_LOG.md') }

    $indexedCount = 0
    if ($null -ne $index) {
        if ([int]$index.schemaVersion -ne 1) { $errors.Add('decisions-index schemaVersion must be 1') }
        if (@('partial','complete') -notcontains [string]$index.migrationStatus) { $errors.Add('migrationStatus must be partial or complete') }
        if (-not (Test-AITeamCommitSha -Value $index.indexedAgainstCommit)) { $errors.Add('indexedAgainstCommit must be a Git SHA') }
        foreach ($p in $index.decisions.PSObject.Properties) {
            $indexedCount++
            $id = $p.Name
            $record = $p.Value
            if ($id -notmatch '^DEC-\d{3}$') { $errors.Add("invalid decision ID $id"); continue }
            if (-not $logIds.ContainsKey($id)) { $errors.Add("$id has no matching heading in Decisions Log") }
            if (@('accepted','approved','superseded','rejected') -notcontains [string]$record.decisionStatus) { $errors.Add("$id unsupported decisionStatus") }
            if ([string]$record.decisionStatus -eq 'superseded' -and [string]::IsNullOrWhiteSpace([string]$record.supersededBy)) { $errors.Add("$id superseded decision requires supersededBy") }
            if (-not (Test-AITeamCommitSha -Value $record.recordedAtCommit -AllowNull)) { $errors.Add("$id recordedAtCommit invalid") }
            if (-not (Test-AITeamCommitSha -Value $record.indexedAtCommit)) { $errors.Add("$id indexedAtCommit invalid") }

            $scope = $record.decisionScope
            foreach ($key in @('areas','components','fields')) {
                if (@($scope.PSObject.Properties.Name) -notcontains $key) { $errors.Add("$id decisionScope.$key missing"); continue }
                foreach ($v in @($scope.$key)) { if ([string]::IsNullOrWhiteSpace([string]$v)) { $errors.Add("$id decisionScope.$key contains blank value") } }
            }

            $impl = $record.lastKnownImplementation
            $implStatus = [string]$impl.status
            if (@('implemented','partial','planned','unverified','not-applicable') -notcontains $implStatus) { $errors.Add("$id unsupported implementation status") }
            if ([string]::IsNullOrWhiteSpace([string]$impl.context)) { $errors.Add("$id implementation context is required") }
            if ($implStatus -in @('implemented','partial')) {
                if (-not (Test-AITeamCommitSha -Value $impl.verifiedAtCommit)) { $errors.Add("$id implementation verifiedAtCommit invalid") }
            }
            elseif (-not (Test-AITeamCommitSha -Value $impl.verifiedAtCommit -AllowNull)) { $errors.Add("$id implementation verifiedAtCommit invalid") }

            $doc = [string]$record.doc
            if ([string]::IsNullOrWhiteSpace($doc)) { $errors.Add("$id doc is required") }
            else {
                $target = [System.IO.Path]::GetFullPath((Join-Path $brain $doc))
                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { $errors.Add("$id doc target does not exist") }
            }
            if ([string]$record.heading -ne $id) { $errors.Add("$id heading must equal stable decision ID") }
        }
        if ([string]$index.migrationStatus -eq 'complete') {
            foreach ($id in $logIds.Keys) {
                if (@($index.decisions.PSObject.Properties.Name) -notcontains $id) { $errors.Add("complete migration is missing $id") }
            }
        }
    }

    $aliasCount = 0
    if ($null -ne $aliases) {
        if ([int]$aliases.schemaVersion -ne 1) { $errors.Add('field-aliases schemaVersion must be 1') }
        foreach ($p in $aliases.fields.PSObject.Properties) {
            $aliasCount++
            $name = $p.Name
            $record = $p.Value
            $layers = @($record.aliasesByLayer.PSObject.Properties.Name)
            foreach ($layer in @('csharp','json','javascript','revogrid','database')) {
                if ($layers -notcontains $layer) { $errors.Add("$name missing alias layer $layer") }
            }
            $status = [string]$record.lastVerification.status
            if (@('verified','unverified','stale') -notcontains $status) { $errors.Add("$name unsupported alias status") }
            if ($status -eq 'verified') {
                if (-not (Test-AITeamCommitSha -Value $record.lastVerification.verifiedAtCommit)) { $errors.Add("$name verifiedAtCommit invalid") }
            }
            elseif (-not (Test-AITeamCommitSha -Value $record.lastVerification.verifiedAtCommit -AllowNull)) { $errors.Add("$name verifiedAtCommit invalid") }
        }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        indexedDecisionCount = $indexedCount
        decisionLogCount = $logIds.Count
        fieldAliasCount = $aliasCount
    }
}

Export-ModuleMember -Function Get-AITeamRepoState, Compare-AITeamRepoState, Test-AITeamFindingReport, Test-AITeamReviewerCompletion, Test-AITeamSuite, Test-AITeamRoutingOracle, Test-AITeamMissionPacket, Test-AITeamLeadReport, Test-AITeamProductReport, Test-AITeamProjectBrain
