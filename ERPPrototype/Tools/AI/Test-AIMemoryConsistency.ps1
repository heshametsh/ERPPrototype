param(
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$MemoryGateVersion = 'V8.1-SIMPLE'

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

function Add-Error([string]$message) { $errors.Add($message) }
function Add-Warning([string]$message) { $warnings.Add($message) }

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText(
        $Path,
        [System.Text.UTF8Encoding]::new($false, $true)
    )
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
    foreach ($message in $errors) { Write-Host "- $message" }
    exit 1
}

# Git is authoritative and observed live, but deliberately not mirrored into Current State.
$oldPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $gitRoot = (& git -C $RepoRoot rev-parse --show-toplevel 2>$null).Trim()
    $gitBranch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
    $gitHead = (& git -C $RepoRoot rev-parse HEAD 2>$null).Trim()
    $gitStatus = @(& git -C $RepoRoot status --porcelain --untracked-files=all 2>$null)
    $gitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $oldPreference
}

if ($gitCode -ne 0 -or [string]::IsNullOrWhiteSpace($gitRoot)) {
    Add-Error 'RepoRoot is not a readable Git repository.'
}
else {
    try {
        if ((Resolve-Path $gitRoot).Path -ne $RepoRoot) {
            Add-Error "RepoRoot does not match Git root: $gitRoot"
        }
    }
    catch {
        Add-Error "Could not resolve Git root: $gitRoot"
    }
}

$gitWorkingTree = if ($gitStatus.Count -gt 0) { 'DIRTY' } else { 'CLEAN' }

$state = Read-Utf8Text (Join-Path $RepoRoot $paths.State)
$log = Read-Utf8Text (Join-Path $RepoRoot $paths.Log)
$decisions = Read-Utf8Text (Join-Path $RepoRoot $paths.Decisions)
$metricsText = Read-Utf8Text (Join-Path $RepoRoot $paths.Metrics)
$cycle = Read-Utf8Text (Join-Path $RepoRoot $paths.Cycle)
$protocol = Read-Utf8Text (Join-Path $RepoRoot $paths.Protocol)
$checklist = Read-Utf8Text (Join-Path $RepoRoot $paths.Checklist)
$matrix = Read-Utf8Text (Join-Path $RepoRoot $paths.Matrix)

# Compact-state mechanics.
$missionMatches = [regex]::Matches($state, '(?m)^Mission:\s*(\S+)\s*$')
$statusMatches = [regex]::Matches($state, '(?m)^Mission status:\s*\*\*(OPEN|COMPLETE)\*\*\s*$')
$nextMatches = [regex]::Matches($state, '(?m)^## Next action\s*$')

if ($missionMatches.Count -ne 1) { Add-Error "Current State must contain exactly one Mission line." }
if ($statusMatches.Count -ne 1) { Add-Error "Current State must contain exactly one Mission status: **OPEN|COMPLETE** line." }
if ($nextMatches.Count -ne 1) { Add-Error "Current State must contain exactly one ## Next action section." }

if ([regex]::Matches($state, '(?m)^##\s+20\d{2}-\d{2}-\d{2}\b').Count -gt 0) {
    Add-Error 'Current State contains dated chronology; move receipts to Work Log.'
}

if ($state -match '(?m)^##\s+Live Git truth\s*$' -or
    $state -match '(?m)^-\s+HEAD:\s*`[0-9a-fA-F]{7,40}`' -or
    $state -match '(?m)^-\s+Working tree:\s*\*\*(CLEAN|DIRTY)\*\*') {
    Add-Error 'Current State mirrors live Git HEAD/status. Git truth must be read live, not stored in tracked state.'
}

$stateLineCount = ($state -split "`r?`n").Count
if ($stateLineCount -gt 120) {
    Add-Warning "Current State has $stateLineCount lines; prune before it becomes chronology."
}

# State date may equal, but not trail, the latest log date.
$stateDateMatch = [regex]::Match($state, '(?m)^Updated:\s*(\d{4}-\d{2}-\d{2})\s*$')
$logDates = [regex]::Matches($log, '(?m)^##\s+(\d{4}-\d{2}-\d{2})\b')
if (-not $stateDateMatch.Success) {
    Add-Error 'Current State is missing Updated: YYYY-MM-DD.'
}
elseif ($logDates.Count -gt 0) {
    $stateDate = [datetime]::ParseExact($stateDateMatch.Groups[1].Value, 'yyyy-MM-dd', $null)
    $latestLogDate = ($logDates | ForEach-Object {
        [datetime]::ParseExact($_.Groups[1].Value, 'yyyy-MM-dd', $null)
    } | Sort-Object -Descending | Select-Object -First 1)
    if ($stateDate -lt $latestLogDate) {
        Add-Error 'Current State Updated date is older than the latest Work Log date.'
    }
}

# Decision ids stay unique.
$decisionIds = [regex]::Matches($decisions, '(?m)^##\s+(DEC-\d+)\b') | ForEach-Object { $_.Groups[1].Value }
$duplicates = $decisionIds | Group-Object | Where-Object { $_.Count -gt 1 }
foreach ($duplicate in $duplicates) {
    Add-Error "Duplicate decision id: $($duplicate.Name)"
}

# Future Work Log entries must expose structured metadata.
$marker = '<!-- STRUCTURED-LOG-V1 -->'
$structuredHeadingPattern = '(?m)^##\s+20\d{2}-\d{2}-\d{2}\b[^\r\n]*'

# Parser self-check: the same structured heading must be found under LF and CRLF.
foreach ($sampleEol in @("`n", "`r`n")) {
    $sample = $marker + $sampleEol + '## 2026-09-09 — Parser self-check' + $sampleEol + $sampleEol + 'Meta: Mission=SELFTEST; Class=TOOLING; Outcome=PASS; Stage=CHECK; Scope=DOCS_TOOLING' + $sampleEol
    $sampleStructured = $sample.Substring($marker.Length)
    if ([regex]::Matches($sampleStructured, $structuredHeadingPattern).Count -ne 1) {
        Add-Error 'Structured Work Log parser self-check failed for LF/CRLF handling.'
        break
    }
}

$markerIndex = $log.LastIndexOf($marker, [System.StringComparison]::Ordinal)
if ($markerIndex -lt 0) {
    Add-Error 'Work Log is missing STRUCTURED-LOG-V1 marker.'
}
else {
    $structured = $log.Substring($markerIndex + $marker.Length)
    $headings = [regex]::Matches($structured, $structuredHeadingPattern)
    if ($headings.Count -lt 1) {
        Add-Error 'No structured Work Log entry exists after STRUCTURED-LOG-V1 marker.'
    }
    else {
        $lastHeading = $headings[$headings.Count - 1]
        $tail = $structured.Substring($lastHeading.Index + $lastHeading.Length)
        $meta = [regex]::Match($tail, '(?m)^\s*Meta:\s*Mission=([^;\r\n]+);\s*Class=([^;\r\n]+);\s*Outcome=([^;\r\n]+);\s*Stage=([^;\r\n]+);\s*Scope=([^\r\n]+)')
        if (-not $meta.Success) {
            Add-Error 'Latest structured Work Log entry is missing the required Meta line.'
        }
    }
}

# Metrics schema and completed-mission closure.
$requiredMetricColumns = @(
    'MissionId','CompletedDate','CommunicationCorrectionTurns','ReworkLoops','ScopeDriftEvents',
    'ProductFailures','TestHarnessFailures','BuildStaleFailures','ToolingFailures','EnvironmentFailures',
    'RequiredEvidenceComplete','StateSyncMisses','StaleStateCorrections','PackageIterations'
)

try {
    $metricRows = @($metricsText | ConvertFrom-Csv)
    if ($metricRows.Count -lt 1) { Add-Error 'Metrics has no data rows.' }
    else {
        $columns = @($metricRows[0].PSObject.Properties.Name)
        foreach ($column in $requiredMetricColumns) {
            if ($column -notin $columns) { Add-Error "Metrics is missing required column: $column" }
        }

        $dupMissions = $metricRows | Group-Object MissionId | Where-Object { $_.Name -and $_.Count -gt 1 }
        foreach ($dup in $dupMissions) { Add-Error "Metrics contains duplicate MissionId: $($dup.Name)" }

        if ($missionMatches.Count -eq 1 -and $statusMatches.Count -eq 1 -and $statusMatches[0].Groups[1].Value -eq 'COMPLETE') {
            $missionId = $missionMatches[0].Groups[1].Value
            $matching = @($metricRows | Where-Object { $_.MissionId -eq $missionId })
            if ($matching.Count -ne 1) {
                Add-Error "Completed mission must have exactly one Metrics row for MissionId=$missionId."
            }
            else {
                $row = $matching[0]
                if ([string]::IsNullOrWhiteSpace($row.CompletedDate)) { Add-Error "Metrics CompletedDate is blank for $missionId." }
                if ($row.RequiredEvidenceComplete -ne 'YES') { Add-Error "Metrics RequiredEvidenceComplete must be YES for $missionId." }
                foreach ($field in @('CommunicationCorrectionTurns','ReworkLoops','ScopeDriftEvents','ProductFailures','TestHarnessFailures','BuildStaleFailures','ToolingFailures','EnvironmentFailures','StateSyncMisses','StaleStateCorrections','PackageIterations')) {
                    $value = $row.$field
                    $parsed = 0
                    if ([string]::IsNullOrWhiteSpace($value) -or -not [int]::TryParse($value, [ref]$parsed) -or $parsed -lt 0) {
                        Add-Error "Metrics field $field must be a non-negative integer for $missionId."
                    }
                }
            }
        }
    }
}
catch {
    Add-Error "Metrics CSV parse failed: $($_.Exception.Message)"
}

# UTF-8 / mojibake integrity for active memory/canonical evidence files.
function Remove-MarkdownCodeForEncodingAudit([string]$Text) {
    $withoutFenced = [regex]::Replace($Text, '(?ms)```.*?```', '')
    return [regex]::Replace($withoutFenced, '`[^`\r\n]*`', '')
}

function Test-HighConfidenceMojibake([string]$Text) {
    return (Remove-MarkdownCodeForEncodingAudit $Text) -match 'Ø§|Ù„|â€”|â€“|Ã—|\uFFFD'
}

$memoryTexts = @{
    'AI_CURRENT_STATE.md' = $state
    'AI_WORK_LOG.md' = $log
    'AI_WORK_CYCLE.md' = $cycle
    'AI_LIVE_MEMORY_PROTOCOL.md' = $protocol
    '06_REGRESSION_TEST_CHECKLIST.md' = $checklist
    'AI_GRID_REFERENCE_MATRIX.md' = $matrix
}
foreach ($entry in $memoryTexts.GetEnumerator()) {
    if (Test-HighConfidenceMojibake $entry.Value) {
        Add-Error "High-confidence text-encoding corruption detected in $($entry.Key)."
    }
}

Write-Host ''
if ($warnings.Count -gt 0) {
    Write-Host 'Warnings:'
    foreach ($message in $warnings) { Write-Host "- $message" }
    Write-Host ''
}

if ($errors.Count -gt 0) {
    Write-Host 'AI memory consistency: FAIL'
    foreach ($message in $errors) { Write-Host "- $message" }
    exit 1
}

Write-Host "AI memory consistency: PASS ($MemoryGateVersion)"
Write-Host "Mission: $($missionMatches[0].Groups[1].Value)"
Write-Host "Git observed live: branch=$gitBranch head=$gitHead working-tree=$gitWorkingTree"
if ($statusMatches[0].Groups[1].Value -eq 'COMPLETE') { Write-Host 'Mission metrics closure: PASS' }
Write-Host 'Checker scope: memory mechanics only; product semantics remain owned by code/evidence/canonical docs.'
exit 0
