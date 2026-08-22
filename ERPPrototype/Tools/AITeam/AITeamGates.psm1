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

function Test-AITeamFindingReport {
    param(
        [Parameter(Mandatory)][string]$ReportPath,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedSha,
        [Parameter(Mandatory)][string]$ExpectedMission
    )

    $errors = New-Object System.Collections.Generic.List[string]
    try {
        $data = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        $errors.Add("cannot parse report JSON: $($_.Exception.Message)")
        return [pscustomobject][ordered]@{ pass=$false; errors=@($errors); agentRole=$null; findingCount=0; leadView=$null }
    }

    $required = @('schemaVersion','agentRole','mission','commitSha','summary','findings','confidenceTelemetry')
    $props = @($data.PSObject.Properties.Name)
    foreach ($key in $required) {
        if ($props -notcontains $key) { $errors.Add("missing required field $key") }
    }

    if ($props -contains 'schemaVersion' -and [int]$data.schemaVersion -ne 1) {
        $errors.Add('wrong schemaVersion')
    }
    if ($props -contains 'mission' -and [string]$data.mission -ne $ExpectedMission) {
        $errors.Add("mission '$($data.mission)' does not match expected '$ExpectedMission'")
    }
    if ($props -contains 'commitSha') {
        $got = [string]$data.commitSha
        if (-not (Test-AITeamCommitSha -Value $got)) {
            $errors.Add("commitSha '$got' is invalid")
        }
        elseif (-not ($got.ToLowerInvariant().StartsWith($ExpectedSha.ToLowerInvariant()) -or $ExpectedSha.ToLowerInvariant().StartsWith($got.ToLowerInvariant()))) {
            $errors.Add("commitSha '$got' does not match expected '$ExpectedSha'")
        }
    }

    $findings = @()
    if ($props -contains 'findings') { $findings = @($data.findings) }
    if ($findings.Count -gt 5) { $errors.Add('findings must contain at most 5 items') }

    $root = [System.IO.Path]::GetFullPath($RepoRoot)
    $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

    for ($i=0; $i -lt $findings.Count; $i++) {
        $f = $findings[$i]
        $fProps = @($f.PSObject.Properties.Name)
        foreach ($key in @('id','claim','evidence','impact','verification')) {
            if ($fProps -notcontains $key) {
                $errors.Add("finding $($i+1) missing/non-empty $key")
                continue
            }
            $value = $f.$key
            if ($null -eq $value -or ([string]$value -eq '' -and $key -ne 'evidence')) {
                $errors.Add("finding $($i+1) missing/non-empty $key")
            }
        }

        if ($fProps -notcontains 'evidence') { continue }
        $evidence = @($f.evidence)
        if ($evidence.Count -eq 0) {
            $errors.Add("finding $($i+1) missing/non-empty evidence")
            continue
        }
        foreach ($e in $evidence) {
            $location = [string]$e.location
            if ($location -notmatch '^(?<file>.+):(?<line>[1-9][0-9]*)$') {
                $errors.Add("finding $($i+1) evidence location must be file:line")
                continue
            }
            $rel = $Matches.file
            $lineNo = [int]$Matches.line
            $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
            if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                $errors.Add("finding $($i+1) evidence escapes repo: $rel")
                continue
            }
            if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
                $errors.Add("finding $($i+1) evidence file missing: $rel")
                continue
            }
            try {
                $lineCount = [System.IO.File]::ReadAllLines($full).Length
            }
            catch {
                $errors.Add("finding $($i+1) cannot read evidence file: $rel")
                continue
            }
            if ($lineNo -gt $lineCount) {
                $errors.Add("finding $($i+1) evidence line $lineNo > ${lineCount}: $rel")
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
    if ($null -ne $suite) {
        if ([int]$suite.schemaVersion -ne 1) { $errors.Add('suite schemaVersion must be 1') }
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
            if ($names -contains 'routingHint' -or $names -contains 'successSignals') { $errors.Add("$id leaks evaluation oracle into mission file") }
        }
    }

    $oracleIds = @{}
    if ($null -ne $oracle) {
        if ([int]$oracle.schemaVersion -ne 1) { $errors.Add('oracle schemaVersion must be 1') }
        foreach ($o in @($oracle.oracles)) {
            $id = [string]$o.id
            if ($oracleIds.ContainsKey($id)) { $errors.Add("duplicate oracle id $id") }
            $oracleIds[$id] = $true
            if (-not $missionIds.ContainsKey($id)) { $errors.Add("oracle $id has no mission") }
            $names = @($o.PSObject.Properties.Name)
            if ($names -notcontains 'routingExpectation' -or $names -notcontains 'successSignals') { $errors.Add("oracle $id missing expectations") }
        }
    }

    foreach ($id in $missionIds.Keys) {
        if (-not $oracleIds.ContainsKey($id)) { $errors.Add("mission $id is missing an oracle") }
    }

    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        errors = @($errors)
        missionCount = $missionIds.Count
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

Export-ModuleMember -Function Get-AITeamRepoState, Compare-AITeamRepoState, Test-AITeamFindingReport, Test-AITeamReviewerCompletion, Test-AITeamSuite, Test-AITeamProjectBrain
