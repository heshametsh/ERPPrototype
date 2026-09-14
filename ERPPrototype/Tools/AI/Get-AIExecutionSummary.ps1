param([int]$LastEvents = 50)

$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$logPath = Join-Path $projectRoot "Documentation\AI_EXECUTION_LOG.csv"
if (-not (Test-Path $logPath)) {
    Write-Output "Execution telemetry: no events yet."
    exit 0
}

$rows = @(Import-Csv $logPath)
if ($rows.Count -eq 0) {
    Write-Output "Execution telemetry: no events yet."
    exit 0
}

$recent = @($rows | Select-Object -Last $LastEvents)
$totalMs = [long](($recent | Measure-Object -Property DurationMs -Sum).Sum)
$failures = @($recent | Where-Object { $_.Outcome -eq "FAIL" }).Count
$stageTotals = @($recent | Group-Object Stage | ForEach-Object {
    [pscustomobject]@{ Stage = $_.Name; Ms = [long](($_.Group | Measure-Object -Property DurationMs -Sum).Sum) }
} | Sort-Object Ms -Descending)
$slowest = if ($stageTotals.Count -gt 0) { $stageTotals[0] } else { $null }
$slowText = if ($slowest) { " | slowest=" + $slowest.Stage + " " + [math]::Round($slowest.Ms / 1000.0, 1) + "s" } else { "" }
Write-Output ("Execution telemetry (last " + $recent.Count + "): local=" + [math]::Round($totalMs / 1000.0, 1) + "s | fails=" + $failures + $slowText)