param(
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Stop-Bootstrap([string]$Reason) {
    Write-Host "ERP AI BOOTSTRAP: STOP"
    Write-Host ("Reason: " + $Reason)
    exit 2
}

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText(
        $Path,
        [System.Text.UTF8Encoding]::new($false, $true)
    )
}

function One-Line([string]$Text, [int]$Max = 420) {
    $value = ([regex]::Replace([string]$Text, '\s+', ' ')).Trim()
    if ($value.Length -le $Max) { return $value }
    return $value.Substring(0, $Max - 3) + "..."
}

function Get-Section([string]$Text, [string]$Heading) {
    $pattern = '(?ms)^##\s+' + [regex]::Escape($Heading) + '\s*$\s*(.*?)(?=^##\s+|\z)'
    $match = [regex]::Match($Text, $pattern)
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return ""
}
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PSScriptRoot "..\..\.."
}

try { $repo = (Resolve-Path -LiteralPath $RepoRoot).Path }
catch { Stop-Bootstrap "Repository path cannot be resolved." }

$required = [ordered]@{
    Agents  = Join-Path $repo "AGENTS.md"
    Control = Join-Path $repo "AI_CONTROL_CENTER.md"
    State   = Join-Path $repo "AI_CURRENT_STATE.md"
    Log     = Join-Path $repo "ERPPrototype\Documentation\AI_WORK_LOG.md"
    Metrics = Join-Path $repo "ERPPrototype\Documentation\AI_WORK_METRICS.csv"
    Cycle   = Join-Path $repo "ERPPrototype\Documentation\AI_WORK_CYCLE.md"
    Checker = Join-Path $repo "ERPPrototype\Tools\AI\Test-AIMemoryConsistency.ps1"
}

foreach ($entry in $required.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
        Stop-Bootstrap ("Missing required source: " + $entry.Key + " -> " + $entry.Value)
    }
}

try {
    $agents = Read-Utf8Text $required.Agents
    $control = Read-Utf8Text $required.Control
    $state = Read-Utf8Text $required.State
    $log = Read-Utf8Text $required.Log
    $metricsText = Read-Utf8Text $required.Metrics
    $cycle = Read-Utf8Text $required.Cycle
} catch { Stop-Bootstrap ("Required source could not be read as valid UTF-8: " + $_.Exception.Message) }
$missionMatch = [regex]::Match($state, '(?m)^Mission:\s*(\S+)\s*$')
$statusMatch = [regex]::Match($state, '(?m)^Mission status:\s*\*\*(OPEN|COMPLETE)\*\*\s*$')
$dateMatch = [regex]::Match($state, '(?m)^Updated:\s*(\d{4}-\d{2}-\d{2})\s*$')
if (-not $missionMatch.Success) { Stop-Bootstrap "Current State has no valid Mission line." }
if (-not $statusMatch.Success) { Stop-Bootstrap "Current State has no valid Mission status." }
if (-not $dateMatch.Success) { Stop-Bootstrap "Current State has no valid Updated date." }

$mission = $missionMatch.Groups[1].Value
$missionStatus = $statusMatch.Groups[1].Value
$currentMission = Get-Section $state "Current mission"
$nextAction = Get-Section $state "Next action"
if ([string]::IsNullOrWhiteSpace($currentMission)) { Stop-Bootstrap "Current State has no Current mission section." }
if ([string]::IsNullOrWhiteSpace($nextAction)) { Stop-Bootstrap "Current State has no Next action section." }

$logDates = @([regex]::Matches($log, '(?m)^##\s+(\d{4}-\d{2}-\d{2})\b') | ForEach-Object { $_.Groups[1].Value })
if ($logDates.Count -gt 0) {
    $latestLogDate = $logDates | Sort-Object -Descending | Select-Object -First 1
    if ($dateMatch.Groups[1].Value -lt $latestLogDate) {
        Stop-Bootstrap ("Current State is older than latest Work Log event: " + $latestLogDate)
    }
}

try { $metrics = @($metricsText | ConvertFrom-Csv) }
catch { Stop-Bootstrap ("Metrics CSV cannot be parsed: " + $_.Exception.Message) }

$completedCount = @($metrics | Where-Object { -not [string]::IsNullOrWhiteSpace($_.CompletedDate) }).Count
try {
    $gitRoot = ((& git -C $repo rev-parse --show-toplevel | Out-String).Trim())
    $branch = ((& git -C $repo branch --show-current | Out-String).Trim())
    $head = ((& git -C $repo rev-parse --short HEAD | Out-String).Trim())
    $gitStatus = @(& git -C $repo status --short --untracked-files=all)
} catch { Stop-Bootstrap ("Git preflight failed: " + $_.Exception.Message) }
if ([string]::IsNullOrWhiteSpace($gitRoot) -or [string]::IsNullOrWhiteSpace($head)) {
    Stop-Bootstrap "Git repository could not be read."
}


$checkerOutput = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $required.Checker -RepoRoot $repo 2>&1)
$checkerExit = $LASTEXITCODE
if ($checkerExit -ne 0) {
    Write-Host "ERP AI BOOTSTRAP: STOP"
    Write-Host "Reason: AI memory consistency checker failed."
    $checkerOutput | Select-Object -Last 12 | ForEach-Object { Write-Host $_ }
    exit 2
}
$blocks = @([regex]::Matches($log, '(?ms)^## .*?(?=^## |\z)') | ForEach-Object { $_.Value.Trim() })
$recentBlocks = @($blocks | Select-Object -Last 2)
$missionBlock = @($blocks | Where-Object { $_ -match ('Mission=' + [regex]::Escape($mission)) } | Select-Object -Last 1)

function Write-Receipt([string]$Block) {
    $heading = [regex]::Match($Block, '(?m)^##\s+(.+)$')
    $meta = [regex]::Match($Block, '(?m)^Meta:\s*(.+)$')
    if ($heading.Success) {
        $line = $heading.Groups[1].Value.Trim()
        if ($meta.Success) { $line += " | " + $meta.Groups[1].Value.Trim() }
        Write-Host ("- " + (One-Line $line 300))
    }
}

Write-Host "ERP AI BOOTSTRAP: READY"
Write-Host ("Mission: " + $mission + " | " + $missionStatus + " | State=" + $dateMatch.Groups[1].Value)
Write-Host ("Current: " + (One-Line $currentMission 520))
Write-Host ("Next: " + (One-Line $nextAction 520))
Write-Host ("Git: branch=" + $branch + " head=" + $head + " worktree=" + $(if ($gitStatus.Count -gt 0) { "DIRTY" } else { "CLEAN" }) + " changed=" + $gitStatus.Count)
Write-Host "Source: authorized live device/worktree first; remote Git/GitHub is not a routine input."
if ($gitStatus.Count -gt 0) {
    $names = @($gitStatus | Select-Object -First 6 | ForEach-Object { $_.Substring(3) })
    $more = $gitStatus.Count - $names.Count
    Write-Host ("Candidate sample: " + ($names -join ', ') + $(if ($more -gt 0) { " (+$more more)" } else { "" }))
}
Write-Host "Recent material events:"
foreach ($block in $recentBlocks) { Write-Receipt $block }
if ($missionBlock.Count -gt 0 -and $missionBlock[0] -notin $recentBlocks) {
    Write-Host "Latest mission receipt:"
    Write-Receipt $missionBlock[0]
}
$expectedLearningReviews = [math]::Floor($completedCount / 5)
$recordedLearningReviews = ([regex]::Matches($log, 'Stage=LEARNING_REVIEW')).Count
if ($completedCount -lt 5) {
    Write-Host ("Learning: " + $completedCount + "/5 completed Metrics missions; no trend decision yet.")
} elseif ($recordedLearningReviews -lt $expectedLearningReviews) {
    Write-Host ("Learning review due at " + $completedCount + " completed missions.")
} else {
    $remaining = 5 - ($completedCount % 5)
    Write-Host ("Learning: " + $completedCount + " completed missions; review recorded; next review after " + $remaining + " more.")
}

$executionSummaryScript = Join-Path $repo "ERPPrototype\Tools\AI\Get-AIExecutionSummary.ps1"
if (Test-Path $executionSummaryScript) { & $executionSummaryScript -LastEvents 50 }

Write-Host "Required context sources: PASS"
Write-Host "Memory checker: PASS"
Write-Host "Deep-read rule: expand local code/tests/evidence as far as needed before editing; never guess from bootstrap memory."
Write-Host "Red-result rule: classify PRODUCT vs TEST/HARNESS vs BUILD/STALE vs TOOLING vs ENVIRONMENT before product edits."
Write-Host "Next: inspect mission-relevant local code and evidence before modification."
exit 0
