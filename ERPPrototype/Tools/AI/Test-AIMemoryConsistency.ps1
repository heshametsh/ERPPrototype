param(
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$MemoryGateVersion = 'V8.0'

$RepoRoot = (Resolve-Path $RepoRoot).Path

$paths = @{
    State = 'AI_CURRENT_STATE.md'
    Control = 'AI_CONTROL_CENTER.md'
    Agents = 'AGENTS.md'
    Log = 'ERPPrototype\Documentation\AI_WORK_LOG.md'
    Cycle = 'ERPPrototype\Documentation\AI_WORK_CYCLE.md'
    Metrics = 'ERPPrototype\Documentation\AI_WORK_METRICS.csv'
    Matrix = 'ERPPrototype\Documentation\AI_GRID_REFERENCE_MATRIX.md'
    Decisions = 'ERPPrototype\Documentation\08_DECISIONS_LOG.md'
    Checklist = 'ERPPrototype\Documentation\06_REGRESSION_TEST_CHECKLIST.md'
    Protocol = 'ERPPrototype\Documentation\AI_LIVE_MEMORY_PROTOCOL.md'
}

$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Error([string]$message) {
    $errors.Add($message)
}

function Add-Warning([string]$message) {
    $warnings.Add($message)
}

function Invoke-GitChecked([string[]]$Arguments) {
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& git -C $RepoRoot @Arguments 2>&1)
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    if ($code -ne 0) {
        $detail = ($output | ForEach-Object { $_.ToString() }) -join ' | '
        Add-Error "Git command failed: git $($Arguments -join ' ') :: $detail"
        return @()
    }

    return @($output)
}

foreach ($key in $paths.Keys) {
    $full = Join-Path $RepoRoot $paths[$key]
    if (-not (Test-Path $full -PathType Leaf)) {
        Add-Error "Missing required memory file: $($paths[$key])"
    }
}

if ($errors.Count -gt 0) {
    Write-Host ''
    Write-Host 'AI memory consistency: FAIL'
    foreach ($message in $errors) {
        Write-Host "- $message"
    }
    exit 1
}

$statePath = Join-Path $RepoRoot $paths.State
$logPath = Join-Path $RepoRoot $paths.Log
$matrixPath = Join-Path $RepoRoot $paths.Matrix
$decisionsPath = Join-Path $RepoRoot $paths.Decisions
$checklistPath = Join-Path $RepoRoot $paths.Checklist
$protocolPath = Join-Path $RepoRoot $paths.Protocol
$metricsPath = Join-Path $RepoRoot $paths.Metrics
$cyclePath = Join-Path $RepoRoot $paths.Cycle

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText(
        $Path,
        [System.Text.UTF8Encoding]::new($false, $true)
    )
}

$state = Read-Utf8Text $statePath
$log = Read-Utf8Text $logPath
$matrix = Read-Utf8Text $matrixPath
$decisions = Read-Utf8Text $decisionsPath
$checklist = Read-Utf8Text $checklistPath
$protocol = Read-Utf8Text $protocolPath
$metrics = Read-Utf8Text $metricsPath
$cycle = Read-Utf8Text $cyclePath

# Live Git truth: compact state must describe the repository that is actually open.
$gitRootOutput = @(Invoke-GitChecked @('rev-parse','--show-toplevel'))
$gitBranchOutput = @(Invoke-GitChecked @('rev-parse','--abbrev-ref','HEAD'))
$gitHeadOutput = @(Invoke-GitChecked @('rev-parse','HEAD'))
$gitStatusOutput = @(Invoke-GitChecked @('status','--porcelain','--untracked-files=all'))

$actualGitRoot = if ($gitRootOutput.Count -gt 0) { $gitRootOutput[-1].ToString().Trim() } else { '' }
$actualBranch = if ($gitBranchOutput.Count -gt 0) { $gitBranchOutput[-1].ToString().Trim() } else { '' }
$actualHead = if ($gitHeadOutput.Count -gt 0) { $gitHeadOutput[-1].ToString().Trim().ToLowerInvariant() } else { '' }
$actualWorkingTree = if ($gitStatusOutput.Count -gt 0) { 'DIRTY' } else { 'CLEAN' }

if ($actualGitRoot -ne '') {
    try {
        $resolvedGitRoot = (Resolve-Path -LiteralPath $actualGitRoot).Path
        if ($resolvedGitRoot -ne $RepoRoot) {
            Add-Error "RepoRoot does not match Git root. RepoRoot=$RepoRoot GitRoot=$resolvedGitRoot"
        }
    }
    catch {
        Add-Error "Could not resolve Git root returned by git: $actualGitRoot"
    }
}

$stateBranchMatch = [regex]::Match($state, '(?m)^- Branch:\s*`([^`]+)`\.\s*$')
$stateHeadMatch = [regex]::Match($state, '(?m)^- HEAD:\s*`([0-9a-fA-F]{40})`\.\s*$')
$stateWorkingTreeMatch = [regex]::Match($state, '(?m)^- Working tree:\s*\*\*(CLEAN|DIRTY)\*\*')

if (-not $stateBranchMatch.Success) {
    Add-Error "AI_CURRENT_STATE.md is missing structured live Git branch: - Branch: `...`."
}
elseif ($actualBranch -ne '' -and $stateBranchMatch.Groups[1].Value -ne $actualBranch) {
    Add-Error "Live Git branch drift: Current State=$($stateBranchMatch.Groups[1].Value), Git=$actualBranch."
}

if (-not $stateHeadMatch.Success) {
    Add-Error "AI_CURRENT_STATE.md is missing structured live Git HEAD: - HEAD: `<40-char-sha>`."
}
elseif ($actualHead -ne '' -and $stateHeadMatch.Groups[1].Value.ToLowerInvariant() -ne $actualHead) {
    Add-Error "Live Git HEAD drift: Current State=$($stateHeadMatch.Groups[1].Value), Git=$actualHead."
}

if (-not $stateWorkingTreeMatch.Success) {
    Add-Error "AI_CURRENT_STATE.md is missing structured working-tree state: - Working tree: **CLEAN|DIRTY**"
}
elseif ($stateWorkingTreeMatch.Groups[1].Value -ne $actualWorkingTree) {
    Add-Error "Live Git working-tree drift: Current State=$($stateWorkingTreeMatch.Groups[1].Value), Git=$actualWorkingTree."
}

# Compact state shape.
$missionMatches = [regex]::Matches($state, '(?m)^Mission:\s*(\S+)\s*$')
if ($missionMatches.Count -ne 1) {
    Add-Error "AI_CURRENT_STATE.md must contain exactly one 'Mission:' line."
}

$missionStatusMatches = [regex]::Matches($state, '(?m)^Mission status:\s*\*\*(OPEN|COMPLETE)\*\*\s*$')
if ($missionStatusMatches.Count -ne 1) {
    Add-Error "AI_CURRENT_STATE.md must contain exactly one 'Mission status: **OPEN|COMPLETE**' line."
}

$nextMatches = [regex]::Matches($state, '(?m)^## Next action\s*$')
if ($nextMatches.Count -ne 1) {
    Add-Error "AI_CURRENT_STATE.md must contain exactly one '## Next action' section."
}

$datedHeadings = [regex]::Matches($state, '(?m)^##\s+20\d{2}-\d{2}-\d{2}\b')
if ($datedHeadings.Count -gt 0) {
    Add-Error "AI_CURRENT_STATE.md contains dated receipt headings. Chronology belongs in AI_WORK_LOG.md."
}

if ($state -match 'Runtime evidence is pending' -and $state -match 'Real SQL Core suite.*\*\*PASS\*\*') {
    Add-Error "AI_CURRENT_STATE.md contains both completed SQL PASS evidence and an obsolete 'Runtime evidence is pending' statement."
}

if ($state -match 'Expected Core suite size' -and $state -match 'Real SQL Core suite.*\d+/\d+\s+PASS') {
    Add-Warning "AI_CURRENT_STATE.md still contains an expected Core-suite size after an executed Core-suite result; verify it is not stale."
}

$stateLineCount = ($state -split "`r?`n").Count
if ($stateLineCount -gt 220) {
    Add-Warning "AI_CURRENT_STATE.md has $stateLineCount lines. Prune compact state before it becomes chronology."
}

# Latest state date must not be older than the latest work-log date.
$stateDateMatch = [regex]::Match($state, '(?m)^Updated:\s*(\d{4}-\d{2}-\d{2})\s*$')
$logDates = [regex]::Matches($log, '(?m)^##\s+(\d{4}-\d{2}-\d{2})\b')
if (-not $stateDateMatch.Success) {
    Add-Error "AI_CURRENT_STATE.md is missing a valid Updated: YYYY-MM-DD line."
}
elseif ($logDates.Count -gt 0) {
    $stateDate = [datetime]::ParseExact($stateDateMatch.Groups[1].Value, 'yyyy-MM-dd', $null)
    $latestLogDate = ($logDates | ForEach-Object {
        [datetime]::ParseExact($_.Groups[1].Value, 'yyyy-MM-dd', $null)
    } | Sort-Object -Descending | Select-Object -First 1)

    if ($stateDate -lt $latestLogDate) {
        Add-Error "AI_CURRENT_STATE.md Updated date is older than the latest AI_WORK_LOG.md entry."
    }
}

# Duplicate DEC ids are not allowed.
$decisionIds = [regex]::Matches($decisions, '(?m)^##\s+(DEC-\d+)\b') |
    ForEach-Object { $_.Groups[1].Value }

$duplicates = $decisionIds |
    Group-Object |
    Where-Object { $_.Count -gt 1 }

foreach ($duplicate in $duplicates) {
    Add-Error "Duplicate decision id in 08_DECISIONS_LOG.md: $($duplicate.Name)"
}

# Compare executed SQL evidence counts across live state / checklist / grid matrix when available.
$stateSql = [regex]::Match(
    $state,
    'Real SQL Core suite[^\r\n]*?(?<pass>\d+)/(?:\s*)?(?<total>\d+)\s+PASS',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

$matrixSql = [regex]::Match(
    $matrix,
    'REAL SQL VERIFIED\s*\((?<pass>\d+)/(?:\s*)?(?<total>\d+)',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

$checklistMatches = [regex]::Matches(
    $checklist,
    '(?<pass>\d+)/(?:\s*)?(?<total>\d+)\s+PASS',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

if ($stateSql.Success) {
    $stateCount = "$($stateSql.Groups['pass'].Value)/$($stateSql.Groups['total'].Value)"

    if ($matrixSql.Success) {
        $matrixCount = "$($matrixSql.Groups['pass'].Value)/$($matrixSql.Groups['total'].Value)"
        if ($matrixCount -ne $stateCount) {
            Add-Error "SQL evidence drift: Current State=$stateCount, Grid Matrix=$matrixCount."
        }
    }

    if ($checklistMatches.Count -gt 0) {
        $lastChecklist = $checklistMatches[$checklistMatches.Count - 1]
        $checklistCount = "$($lastChecklist.Groups['pass'].Value)/$($lastChecklist.Groups['total'].Value)"
        if ($checklistCount -ne $stateCount) {
            Add-Error "SQL evidence drift: Current State=$stateCount, Regression Checklist latest=$checklistCount."
        }
    }
}

# Semantic/staleness checks for the active CC-YEAR mission.
if ($missionMatches.Count -eq 1 -and
    $missionMatches[0].Groups[1].Value -eq 'CC-YEAR-001') {
    if ($state -match 'focused live Tabulator browser journey') {
        Add-Error "CC-YEAR Current State still contains the superseded Tabulator browser acceptance gate."
    }

    if ($matrix -match 'Live Tabulator remains the user-behavior surface; focused browser acceptance is still required') {
        Add-Error "CC-YEAR Grid Matrix still contains the superseded Tabulator acceptance-surface statement."
    }

    if ($checklist -match 'Existing Phase9 Full browser suite passes the CC-YEAR extension') {
        Add-Error "CC-YEAR Regression Checklist still contains the superseded Phase9 Full browser gate."
    }

    if ($decisions -match 'Phase 1 final acceptance pending browser/manual gate') {
        Add-Error "DEC-067 still contains the superseded generic browser/manual Phase 1 gate."
    }
}

# Encoding integrity:
# strict UTF-8 decoding happens above; historical examples inside Markdown
# code spans/blocks are documentation and must not self-trigger the detector.
function Remove-MarkdownCodeForEncodingAudit([string]$Text) {
    $withoutFencedCode = [regex]::Replace(
        $Text,
        '(?ms)```.*?```',
        ''
    )

    return [regex]::Replace(
        $withoutFencedCode,
        '`[^`\r\n]*`',
        ''
    )
}

function Test-HighConfidenceMojibake([string]$Text) {
    $auditableText = Remove-MarkdownCodeForEncodingAudit $Text
    return $auditableText -match 'Ø§|Ù„|â€”|â€“|Ã—|\uFFFD'
}

# Self-test both directions so recording an old corruption example cannot
# create a false new error.
$documentedMojibakeExample = 'Historical repair example: `2Ã—2` was corrected to `2×2`.'
$realMojibakeExample = 'This prose is corrupted: 2Ã—2.'

if (Test-HighConfidenceMojibake $documentedMojibakeExample) {
    Add-Error "Memory checker self-test failed: Markdown code examples incorrectly trigger the encoding gate."
}

if (-not (Test-HighConfidenceMojibake $realMojibakeExample)) {
    Add-Error "Memory checker self-test failed: real mojibake outside Markdown code was not detected."
}

$memoryTextByName = @{
    'AI_CURRENT_STATE.md' = $state
    'AI_WORK_LOG.md' = $log
    'AI_WORK_CYCLE.md' = $cycle
    '06_REGRESSION_TEST_CHECKLIST.md' = $checklist
    'AI_GRID_REFERENCE_MATRIX.md' = $matrix
    'AI_LIVE_MEMORY_PROTOCOL.md' = $protocol
}

foreach ($entry in $memoryTextByName.GetEnumerator()) {
    if (Test-HighConfidenceMojibake $entry.Value) {
        Add-Error "High-confidence text-encoding corruption detected outside Markdown code in $($entry.Key)."
    }
}

if ($protocol -notmatch 'Cross-document integrity gate' -or
    $protocol -notmatch 'canonical owners') {
    Add-Error "AI_LIVE_MEMORY_PROTOCOL.md is not synchronized to the V7 canonical-routing model."
}

# Metrics schema should retain the continuity fields already adopted.
foreach ($column in @('StateSyncMisses', 'StaleStateCorrections')) {
    if ($metrics -notmatch "(^|,)$column(,|`r?`n)") {
        Add-Error "AI_WORK_METRICS.csv is missing required column: $column"
    }
}

# Stable rules must exist.
if ($cycle -notmatch 'Existing-harness-first gate') {
    Add-Error "AI_WORK_CYCLE.md is missing the Existing-harness-first gate."
}
if ($cycle -notmatch 'Documentation consistency gate') {
    Add-Error "AI_WORK_CYCLE.md is missing the Documentation consistency gate."
}

if ($cycle -notmatch 'Manual-first user-visible acceptance gate') {
    Add-Error "AI_WORK_CYCLE.md is missing the Manual-first user-visible acceptance gate."
}

$controlText = Read-Utf8Text (Join-Path $RepoRoot $paths.Control)
$agentsText = Read-Utf8Text (Join-Path $RepoRoot $paths.Agents)

if ($controlText -notmatch 'Manual-first acceptance rule') {
    Add-Error "AI_CONTROL_CENTER.md is missing the Manual-first acceptance rule."
}

if ($agentsText -notmatch 'Automated PASS evidence never implies user manual acceptance') {
    Add-Error "AGENTS.md is not synchronized to the Manual-first acceptance rule."
}

$metricLines = @($metrics -split "`r?`n" | Where-Object { $_ -ne '' })
if ($metricLines.Count -ge 2 -and $metricLines[0] -eq $metricLines[1]) {
    Add-Error "AI_WORK_METRICS.csv contains a duplicated header row."
}

# A completed mission is not memory-closed without one factual metrics row for the same MissionId.
if ($missionMatches.Count -eq 1 -and $missionStatusMatches.Count -eq 1 -and
    $missionStatusMatches[0].Groups[1].Value -eq 'COMPLETE') {
    try {
        $metricRows = @($metrics | ConvertFrom-Csv)
        $missionId = $missionMatches[0].Groups[1].Value
        $matchingMetricRows = @($metricRows | Where-Object { $_.MissionId -eq $missionId })

        if ($matchingMetricRows.Count -ne 1) {
            Add-Error "Completed mission must have exactly one metrics row for MissionId=$missionId; found $($matchingMetricRows.Count)."
        }
        else {
            $metricRow = $matchingMetricRows[0]
            if ([string]::IsNullOrWhiteSpace($metricRow.CompletedDate)) {
                Add-Error "Completed mission metrics row is missing CompletedDate for MissionId=$missionId."
            }
            if ($metricRow.RequiredEvidenceComplete -ne 'YES') {
                Add-Error "Completed mission metrics row must set RequiredEvidenceComplete=YES for MissionId=$missionId."
            }

            foreach ($field in @('CommunicationCorrectionTurns','ReworkLoops','ScopeDriftEvents','EnvironmentFailures','StateSyncMisses','StaleStateCorrections')) {
                if ([string]::IsNullOrWhiteSpace($metricRow.$field)) {
                    Add-Error "Completed mission metrics row has blank factual field: $field"
                }
            }
        }
    }
    catch {
        Add-Error "AI_WORK_METRICS.csv could not be parsed for mission-closure validation: $($_.Exception.Message)"
    }
}

if ($missionMatches.Count -eq 1 -and $missionMatches[0].Groups[1].Value -eq 'CC-YEAR-001') {
    if ($state -match 'user has \*\*not given hands-on manual acceptance yet\*\*' -or
        $state -match 'Memory Gate V7\.2 must PASS') {
        Add-Error "CC-YEAR Current State still contains superseded pre-manual/tooling blocker text."
    }
}

Write-Host ''
if ($warnings.Count -gt 0) {
    Write-Host 'Warnings:'
    foreach ($message in $warnings) {
        Write-Host "- $message"
    }
    Write-Host ''
}

if ($errors.Count -gt 0) {
    Write-Host 'AI memory consistency: FAIL'
    foreach ($message in $errors) {
        Write-Host "- $message"
    }
    exit 1
}

Write-Host "AI memory consistency: PASS ($MemoryGateVersion)"
Write-Host "Mission: $($missionMatches[0].Groups[1].Value)"
Write-Host "Git truth synchronized: branch=$actualBranch head=$actualHead working-tree=$actualWorkingTree"
if ($missionStatusMatches.Count -eq 1 -and $missionStatusMatches[0].Groups[1].Value -eq 'COMPLETE') {
    Write-Host 'Mission metrics closure: PASS'
}
if ($stateSql.Success) {
    Write-Host "SQL evidence synchronized: $($stateSql.Groups['pass'].Value)/$($stateSql.Groups['total'].Value) PASS"
}
Write-Host 'Current State / Work Log / Decisions / Checklist / Grid Matrix structural checks are consistent.'
exit 0
