[CmdletBinding()]
param(
    [ValidateSet(1000, 5000, 10000)]
    [int]$RowsPerYear = 1000,

    [ValidateRange(3, 10)]
    [int]$Runs = 5,

    [switch]$Headed,
    [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'

$baselineScript = Join-Path `
    $PSScriptRoot `
    'Invoke-ERPPerformanceBaseline.ps1'

if (-not (Test-Path -LiteralPath $baselineScript)) {
    throw "Could not find the neutral baseline runner: $baselineScript"
}

Write-Warning (
    'Invoke-ERPPerformanceSoak.ps1 is retained only as a compatibility wrapper. ' +
    'It now runs the neutral deep Arrow baseline without SlowMo or timing trace.'
)

$arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $baselineScript,
    '-Action', 'Arrow',
    '-RowsPerYear', $RowsPerYear.ToString(),
    '-Runs', $Runs.ToString()
)

if ($Headed) {
    $arguments += '-Headed'
}

if ($KeepDatabase) {
    $arguments += '-KeepDatabase'
}

& powershell.exe @arguments

if ($LASTEXITCODE -ne 0) {
    throw "The neutral Arrow baseline failed with exit code $LASTEXITCODE."
}
