Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ProductionReviewSchemaVersion = '1.0'
$script:ProductionReviewPolicyVersion = 'production-review-v1'

function Get-ProductionReviewUtcIso {
    return [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function Get-ProductionReviewDataRoot {
    param([string]$DataRoot)
    if (-not [string]::IsNullOrWhiteSpace($DataRoot)) { return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataRoot)) }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { return (Join-Path $env:LOCALAPPDATA 'ERPPrototype\AI-Engineering') }
    return (Join-Path $env:TEMP 'ERPPrototype-AI-Engineering')
}

function Get-ProductionReviewerTransport {
    # Codex CLI's read-only sandbox blocks writes; the explicit permission is
    # the narrow documented complement required by this host to read the
    # checked-out repository. It does not grant write access.
    return [pscustomobject][ordered]@{
        sandboxMode = 'read-only'
        sandboxPermissions = @('disk-full-read-access')
    }
}

function Get-ProductionReviewSha256File {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-ProductionReviewSha256Text {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Invoke-ProductionReviewGit {
    param([Parameter(Mandatory)][string]$RepoRoot, [Parameter(Mandatory)][string[]]$Arguments)
    $output = @(& git -C $RepoRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)" }
    return ([string]($output -join "`n")).TrimEnd()
}

function Resolve-ProductionReviewRepository {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$BaseSha,
        [Parameter(Mandatory)][string]$CandidateSha
    )
    $root = Invoke-ProductionReviewGit -RepoRoot $RepoRoot -Arguments @('rev-parse','--show-toplevel')
    $base = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('rev-parse',"$BaseSha^{commit}")
    $candidate = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('rev-parse',"$CandidateSha^{commit}")
    $head = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('rev-parse','HEAD')
    & git -C $root merge-base --is-ancestor $base $candidate
    $isAncestor = ($LASTEXITCODE -eq 0)
    if ($LASTEXITCODE -gt 1) { throw 'Unable to verify Base/Candidate ancestry.' }

    $tracked = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('status','--porcelain=v1','--untracked-files=no')
    $untracked = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('status','--porcelain=v1','--untracked-files=all')
    $untrackedOnly = @($untracked -split "`n" | Where-Object { $_ -match '^\?\?' } | Sort-Object)
    $candidateDiff = Invoke-ProductionReviewGit -RepoRoot $root -Arguments @('diff','--binary',"$base..$candidate",'--','.')
    $workspacePayload = [ordered]@{
        head=$head; trackedStatus=$tracked; untrackedStatus=($untrackedOnly -join "`n"); candidateDiffDigest=(Get-ProductionReviewSha256Text $candidateDiff)
    } | ConvertTo-Json -Compress
    return [pscustomobject][ordered]@{
        repoRoot=[IO.Path]::GetFullPath($root); baseSha=$base; candidateSha=$candidate; actualHeadSha=$head
        candidateMatch=($head -eq $candidate); baseAncestorOfCandidate=$isAncestor
        trackedStatus=$tracked; untrackedStatus=($untrackedOnly -join "`n")
        workspaceFingerprint=(Get-ProductionReviewSha256Text $workspacePayload); candidateDiffDigest=(Get-ProductionReviewSha256Text $candidateDiff)
    }
}

function ConvertTo-ProductionReviewJson {
    param([Parameter(Mandatory)]$Value)
    return ($Value | ConvertTo-Json -Depth 50)
}

function Write-ProductionReviewAtomicJson {
    param([Parameter(Mandatory)]$Value, [Parameter(Mandatory)][string]$Path, [switch]$CreateOnly)
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $json = ConvertTo-ProductionReviewJson $Value
    if ($CreateOnly) {
        try {
            $stream = New-Object IO.FileStream($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $bytes = [Text.Encoding]::UTF8.GetBytes($json); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) }
            finally { $stream.Dispose() }
        } catch [IO.IOException] { throw "Review record already exists or is locked: $Path" }
        return
    }
    $temp = Join-Path $parent ('.' + [IO.Path]::GetRandomFileName())
    $backup = $temp + '.backup'
    [IO.File]::WriteAllText($temp, $json, [Text.Encoding]::UTF8)
    try {
        [IO.File]::Replace($temp, $Path, $backup, $true)
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue }
    } catch {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        throw "Atomic record update failed: $($_.Exception.Message)"
    }
}

function Get-ProductionReviewRecordPath {
    param([Parameter(Mandatory)][string]$ReviewId, [string]$DataRoot)
    $parsedReviewId = [Guid]::Empty
    if (-not [Guid]::TryParse($ReviewId, [ref]$parsedReviewId)) { throw 'reviewId must be a UUID.' }
    return (Join-Path (Join-Path (Get-ProductionReviewDataRoot $DataRoot) 'Reviews') ($ReviewId.ToLowerInvariant() + '.json'))
}

function Test-ProductionReviewAnchor {
    param([Parameter(Mandatory)]$Anchor, [Parameter(Mandatory)][string]$RepoRoot)
    $errors = New-Object Collections.Generic.List[string]
    $relative = [string]$Anchor.relativePath
    if ([string]::IsNullOrWhiteSpace($relative) -or $relative.Length -gt 300) { $errors.Add('anchor.relativePath is missing or too long.') }
    if ($relative -match '^[\\/]|^[a-zA-Z]:|\.\.(\\|/|$)|[\x00-\x1f]') { $errors.Add('anchor.relativePath must be a safe repository-relative path.') }
    $start = 0; $end = 0
    if (-not [int]::TryParse([string]$Anchor.startLine, [ref]$start) -or $start -lt 1 -or $start -gt 10000000) { $errors.Add('anchor.startLine is invalid.') }
    if (-not [int]::TryParse([string]$Anchor.endLine, [ref]$end) -or $end -lt $start -or $end -gt 10000000) { $errors.Add('anchor.endLine is invalid.') }
    if ($errors.Count -eq 0) {
        $full = [IO.Path]::GetFullPath((Join-Path $RepoRoot $relative))
        $prefix = [IO.Path]::GetFullPath($RepoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { $errors.Add('anchor does not resolve to a repository file.') }
    }
    return [pscustomobject]@{ pass=($errors.Count -eq 0); errors=@($errors) }
}

function Test-ProductionReviewerResult {
    param([Parameter(Mandatory)][string]$ResultPath, [Parameter(Mandatory)][string]$RepoRoot, [Parameter(Mandatory)][string]$ReviewId, [Parameter(Mandatory)][string]$AttemptId, [Parameter(Mandatory)][string]$CandidateSha)
    $errors = New-Object Collections.Generic.List[string]
    try { $result = Get-Content -LiteralPath $ResultPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return [pscustomobject]@{ pass=$false; errors=@("Reviewer result is not JSON: $($_.Exception.Message)"); result=$null } }
    if ([string]$result.reviewId -ne $ReviewId) { $errors.Add('Reviewer result reviewId does not match invocation.') }
    if ([string]$result.attemptId -ne $AttemptId) { $errors.Add('Reviewer result attemptId does not match invocation.') }
    if ([string]$result.candidateSha -ne $CandidateSha) { $errors.Add('Reviewer result candidateSha does not match invocation.') }
    if ([IO.Path]::GetFullPath([string]$result.repositoryCwd) -ne [IO.Path]::GetFullPath($RepoRoot)) { $errors.Add('Reviewer result repositoryCwd does not match invocation.') }
    if (@('FINDINGS','NO_FINDINGS_EVIDENCE_SUFFICIENT','EVIDENCE_REQUIRED') -notcontains [string]$result.disposition) { $errors.Add('Reviewer disposition is invalid.') }
    foreach ($finding in @($result.findings)) { foreach ($anchor in @($finding.anchors)) { $anchorResult = Test-ProductionReviewAnchor -Anchor $anchor -RepoRoot $RepoRoot; foreach ($error in @($anchorResult.errors)) { $errors.Add("finding anchor: $error") } } }
    if ([string]$result.disposition -eq 'EVIDENCE_REQUIRED') {
        foreach ($item in @($result.evidenceRequired)) {
            if ([string]::IsNullOrWhiteSpace([string]$item.acceptanceCriterion) -or [string]::IsNullOrWhiteSpace([string]$item.exactEvidence) -or [string]::IsNullOrWhiteSpace([string]$item.supportOrRefute)) { $errors.Add('EVIDENCE_REQUIRED item lacks criterion, exact evidence, or support/refute result.') }
        }
    }
    return [pscustomobject]@{ pass=($errors.Count -eq 0); errors=@($errors); result=$result }
}

function Get-ProductionReviewSessionCorrelation {
    param(
        [Parameter(Mandatory)][string]$EventsPath,
        [Parameter(Mandatory)][string]$ExpectedCwd,
        [Parameter(Mandatory)][string]$InvocationCwd,
        [Parameter(Mandatory)][string]$CandidateSha,
        [Parameter(Mandatory)][string]$AttemptMarker
    )
    $threadIds = New-Object Collections.Generic.List[string]; $sessionIds = New-Object Collections.Generic.List[string]; $cwds = New-Object Collections.Generic.List[string]; $markers = New-Object Collections.Generic.List[string]
    if (Test-Path -LiteralPath $EventsPath -PathType Leaf) {
        foreach ($line in @(Get-Content -LiteralPath $EventsPath -Encoding UTF8)) {
            try { $event = $line | ConvertFrom-Json } catch { continue }
            foreach ($prop in @($event.PSObject.Properties)) {
                $name = [string]$prop.Name; $value = [string]$prop.Value
                if ($name -in @('thread_id','threadId') -and $value) { $threadIds.Add($value) }
                if ($name -in @('session_id','sessionId') -and $value) { $sessionIds.Add($value) }
                if ($name -in @('cwd','repo_root','repoRoot') -and $value) { $cwds.Add($value) }
                if ($name -in @('attempt_marker','attemptMarker') -and $value) { $markers.Add($value) }
            }
        }
    }
    $rawHash = if (Test-Path -LiteralPath $EventsPath -PathType Leaf) { Get-ProductionReviewSha256File $EventsPath } else { $null }
    $invocationCwdMatch = [IO.Path]::GetFullPath($InvocationCwd) -eq [IO.Path]::GetFullPath($ExpectedCwd)
    $cwdMatch = $invocationCwdMatch -or (@($cwds | Where-Object { [IO.Path]::GetFullPath($_) -eq [IO.Path]::GetFullPath($ExpectedCwd) }).Count -gt 0)
    $markerMatch = @($markers | Where-Object { $_ -eq $AttemptMarker }).Count -gt 0
    $threadPresent = (@($threadIds).Count + @($sessionIds).Count) -gt 0
    $reasons = @()
    if ($threadPresent) { $reasons += 'Thread/session identity came from the event stream.' } else { $reasons += 'Event stream has no thread/session identity.' }
    if ($invocationCwdMatch) { $reasons += 'Runner bound this exact spawned process to its invocation cwd.' } else { $reasons += 'Runner invocation cwd does not match expected repository cwd.' }
    if ($markerMatch) { $reasons += 'Event stream exposed the invocation marker.' } else { $reasons += 'Event stream did not expose the optional marker.' }
    return [pscustomobject][ordered]@{ threadIds=@($threadIds | Select-Object -Unique); sessionIds=@($sessionIds | Select-Object -Unique); observedCwds=@($cwds | Select-Object -Unique); invocationCwd=$InvocationCwd; invocationCwdMatch=$invocationCwdMatch; candidateSha=$CandidateSha; candidateIdentityBound=$true; cwdMatch=$cwdMatch; markerMatch=$markerMatch; rawEventSha256=$rawHash; reasons=@($reasons); strength=if ($threadPresent -and $invocationCwdMatch -and -not [string]::IsNullOrWhiteSpace($rawHash)) { 'STRONG' } else { 'PARTIAL' } }
}

function Get-ProductionReviewTelemetry {
    param([Parameter(Mandatory)][string]$EventsPath, [Parameter(Mandatory)][string]$StderrPath, [Parameter(Mandatory)]$CodexUsage, [Parameter(Mandatory)]$Execution, [string]$RequestedModel)
    $observed = @{ inputTokens=$false; cachedInputTokens=$false; outputTokens=$false; reasoningTokens=$false; totalTokensReported=$false }
    $reportedTotal = $null; $actualModel = $null; $toolAttempts = 0; $toolFailures = 0
    if (Test-Path -LiteralPath $EventsPath -PathType Leaf) {
        foreach ($line in @(Get-Content -LiteralPath $EventsPath -Encoding UTF8)) {
            try { $event = $line | ConvertFrom-Json } catch { continue }
            if ($null -eq $actualModel -and $null -ne $event.PSObject.Properties['model'] -and -not [string]::IsNullOrWhiteSpace([string]$event.model)) { $actualModel = [string]$event.model }
            if ($null -ne $event.PSObject.Properties['item'] -and $null -ne $event.item -and [string]$event.item.type -match '(?i)tool|function|command') {
                if ([string]$event.type -match '(?i)started|completed') { $toolAttempts++ }
                if ($null -ne $event.item.PSObject.Properties['status'] -and [string]$event.item.status -match '(?i)fail|reject|error') { $toolFailures++ }
            }
            if ([string]$event.type -ne 'turn.completed' -or $null -eq $event.usage) { continue }
            foreach ($pair in @(@('inputTokens','input_tokens'),@('cachedInputTokens','cached_input_tokens'),@('outputTokens','output_tokens'),@('reasoningTokens','reasoning_tokens'),@('reasoningTokens','reasoning_output_tokens'),@('totalTokensReported','total_tokens'))) {
                if ($null -ne $event.usage.PSObject.Properties[$pair[1]] -and $null -ne $event.usage.($pair[1])) { $observed[$pair[0]] = $true }
            }
            if ($null -ne $event.usage.PSObject.Properties['total_tokens'] -and $null -ne $event.usage.total_tokens) { $reportedTotal = [int64]$event.usage.total_tokens }
        }
    }
    if (Test-Path -LiteralPath $StderrPath -PathType Leaf) {
        $stderr = Get-Content -LiteralPath $StderrPath -Raw -Encoding UTF8
        $rejected = [regex]::Matches($stderr, '(?im)exec_command failed for').Count
        if ($rejected -gt 0) { $toolAttempts += $rejected; $toolFailures += $rejected }
    }
    $input = if ($observed.inputTokens) { [int64]$CodexUsage.inputTokens } else { $null }
    $cached = if ($observed.cachedInputTokens) { [int64]$CodexUsage.cachedInputTokens } else { $null }
    $output = if ($observed.outputTokens) { [int64]$CodexUsage.outputTokens } else { $null }
    $reasoning = if ($observed.reasoningTokens) { [int64]$CodexUsage.reasoningTokens } else { $null }
    return [ordered]@{
        requestedModel=if ([string]::IsNullOrWhiteSpace($RequestedModel)) { $null } else { $RequestedModel }; actualModel=$actualModel
        inputTokens=$input; cachedInputTokens=$cached; newInputTokens=if ($null -ne $input -and $null -ne $cached) { $input - $cached } else { $null }
        outputTokens=$output; reasoningTokens=$reasoning; totalTokensReported=if ($observed.totalTokensReported) { $reportedTotal } else { $null }; totalTokensDerived=if ($null -ne $input -and $null -ne $output) { $input + $output } else { $null }
        toolAttempts=if ($toolAttempts -gt 0) { $toolAttempts } else { $null }; toolFailures=if ($toolFailures -gt 0) { $toolFailures } else { $null }; elapsedMilliseconds=$Execution.elapsedMilliseconds
        telemetryStatus=if (-not $Execution.modelAttempted) { 'UNAVAILABLE' } elseif ($observed.Values -contains $false) { 'PARTIAL' } else { 'AVAILABLE' }
    }
}

function Test-ProductionSmokeInfrastructure {
    param([Parameter(Mandatory)]$Preflight, [Parameter(Mandatory)]$Validation, [Parameter(Mandatory)]$Correlation, [Parameter(Mandatory)]$Telemetry, [Parameter(Mandatory)]$Postflight, [Parameter(Mandatory)]$ReviewerResult)
    $reasons = @()
    if (-not ($Preflight.candidateMatch -and $Preflight.baseAncestorOfCandidate)) { $reasons += 'Candidate preflight failed.' }
    if (-not $Validation.pass) { $reasons += 'Structured result validation failed.' }
    if ([string]$Correlation.strength -ne 'STRONG') { $reasons += 'Attempt/session correlation is not strong.' }
    if ($null -eq $Telemetry.inputTokens -or $null -eq $Telemetry.outputTokens -or (@($Correlation.threadIds).Count -eq 0)) { $reasons += 'Required smoke telemetry is incomplete.' }
    if (-not $Postflight.pass) { $reasons += 'Candidate integrity changed after reviewer execution.' }
    if ([string]$ReviewerResult.disposition -eq 'EVIDENCE_REQUIRED') { $reasons += 'Reviewer required evidence because static repository inspection was unavailable.' }
    return [pscustomobject]@{ pass=($reasons.Count -eq 0); reasons=@($reasons); failureClass=if ($reasons.Count -eq 0) { $null } else { 'INFRASTRUCTURE_TRANSPORT' } }
}

function New-ProductionReviewRecord {
    param(
        [Parameter(Mandatory)][string]$MissionId, [ValidateSet('production','benchmark')][string]$Mode = 'production', [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$BaseSha, [Parameter(Mandatory)][string]$CandidateSha, [string]$ReviewId, [string]$ContractVersion = 'v1', [string[]]$AcceptanceCriteria = @(), [string[]]$Exclusions = @(),
        [string]$RiskLevel = 'UNKNOWN', [string[]]$RiskCategories = @(), [string]$Subsystem = 'UNKNOWN', [string]$ChangeType = 'UNKNOWN', [string[]]$TechnologyTags = @(), [string]$DataRoot
    )
    $preflight = Resolve-ProductionReviewRepository -RepoRoot $RepoRoot -BaseSha $BaseSha -CandidateSha $CandidateSha
    $id = if ([string]::IsNullOrWhiteSpace($ReviewId)) { [Guid]::NewGuid().ToString() } else { $ReviewId }
    $parsedReviewId = [Guid]::Empty
    if (-not [Guid]::TryParse($id, [ref]$parsedReviewId)) { throw 'Review ID must be a UUID.' }
    $id = $parsedReviewId.ToString(); $now = Get-ProductionReviewUtcIso
    $record = [ordered]@{
        identity=[ordered]@{ schemaVersion=$script:ProductionReviewSchemaVersion; recordRevision=1; reviewId=$id; missionId=$MissionId; mode=$Mode; repoRoot=$preflight.repoRoot; baseSha=$preflight.baseSha; candidateSha=$preflight.candidateSha; createdAt=$now; updatedAt=$now }
        contract=[ordered]@{ contractVersion=$ContractVersion; acceptanceCriteria=@($AcceptanceCriteria); exclusions=@($Exclusions) }
        risk=[ordered]@{ level=$RiskLevel; categories=@($RiskCategories); subsystem=$Subsystem; changeType=$ChangeType; technologyTags=@($TechnologyTags) }
        preflight=$preflight
        policy=[ordered]@{ policyVersion=$script:ProductionReviewPolicyVersion; reviewerProtocolVersion='reviewer-optimized-v1'; reviewerProtocolHash=$null; routingDecision='MAIN_OWNED'; routingReason='Main engineering judgment; no automatic routing.' }
        attempts=@(); outcome=$null; laterFeedback=@()
    }
    $path = Get-ProductionReviewRecordPath -ReviewId $id -DataRoot $DataRoot
    Write-ProductionReviewAtomicJson -Value $record -Path $path -CreateOnly
    return [pscustomobject]@{ record=$record; path=$path }
}

function Update-ProductionReviewRecord {
    param([Parameter(Mandatory)][string]$ReviewId, [Parameter(Mandatory)][int]$ExpectedRevision, [Parameter(Mandatory)][scriptblock]$Mutator, [string]$DataRoot)
    $path = Get-ProductionReviewRecordPath -ReviewId $ReviewId -DataRoot $DataRoot
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Review record was not found: $ReviewId" }
    $record = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$record.identity.recordRevision -ne $ExpectedRevision) { throw "Stale review-record update. Expected revision $ExpectedRevision; actual revision $($record.identity.recordRevision)." }
    & $Mutator $record
    $record.identity.recordRevision = $ExpectedRevision + 1
    $record.identity.updatedAt = Get-ProductionReviewUtcIso
    Write-ProductionReviewAtomicJson -Value $record -Path $path
    return $record
}

function Add-ProductionReviewAttempt {
    param([Parameter(Mandatory)][string]$ReviewId, [Parameter(Mandatory)][int]$ExpectedRevision, [Parameter(Mandatory)]$Attempt, [string]$ReviewerProtocolHash, [string]$DataRoot)
    return (Update-ProductionReviewRecord -ReviewId $ReviewId -ExpectedRevision $ExpectedRevision -DataRoot $DataRoot -Mutator {
        param($record)
        $record.attempts = @($record.attempts) + @($Attempt)
        if (-not [string]::IsNullOrWhiteSpace($ReviewerProtocolHash)) { $record.policy.reviewerProtocolHash = $ReviewerProtocolHash }
    })
}

function Set-ProductionReviewOutcome {
    param([Parameter(Mandatory)][string]$ReviewId, [Parameter(Mandatory)][int]$ExpectedRevision, [Parameter(Mandatory)]$Outcome, [string]$DataRoot)
    return (Update-ProductionReviewRecord -ReviewId $ReviewId -ExpectedRevision $ExpectedRevision -DataRoot $DataRoot -Mutator { param($record) $record.outcome = $Outcome })
}

Export-ModuleMember -Function Get-ProductionReviewDataRoot, Get-ProductionReviewRecordPath, Get-ProductionReviewerTransport, Resolve-ProductionReviewRepository, Test-ProductionReviewAnchor, Test-ProductionReviewerResult, Get-ProductionReviewSessionCorrelation, Get-ProductionReviewTelemetry, Test-ProductionSmokeInfrastructure, New-ProductionReviewRecord, Add-ProductionReviewAttempt, Set-ProductionReviewOutcome
