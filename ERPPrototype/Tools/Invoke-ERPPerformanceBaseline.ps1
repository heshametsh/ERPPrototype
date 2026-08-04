[CmdletBinding()]
param(
    [ValidateSet('Arrow', 'Enter', 'Wheel')]
    [string]$Action = 'Arrow',

    [ValidateSet(1000, 5000, 10000)]
    [int]$RowsPerYear = 1000,

    [ValidateRange(1, 10)]
    [int]$Runs = 5,

    [switch]$Headed,
    [switch]$Diagnostics,
    [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Diagnostics -and -not $PSBoundParameters.ContainsKey('Runs')) {
    $Runs = 1
}

if (-not $Diagnostics -and $Runs -lt 3) {
    throw 'A neutral baseline requires at least 3 independent runs.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$browserProject = Join-Path `
    $projectRoot `
    'ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj'

if (-not (Test-Path -LiteralPath $browserProject)) {
    throw "Browser-test project was not found at $browserProject"
}

function Invoke-DotNetStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "`n==> $Title" -ForegroundColor Cyan
    & dotnet @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "$Title failed with exit code $LASTEXITCODE."
    }
}

Write-Host 'ERPPrototype neutral browser performance baseline' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "Action: $Action"
Write-Host "Dataset: $RowsPerYear rows per year ($($RowsPerYear * 2) total seeded rows)"
Write-Host "Independent fresh-browser runs: $Runs"
Write-Host "Browser: $(if ($Headed) { 'Headed/visible/no-slowmo' } else { 'Headless/no-slowmo' })"
Write-Host 'SlowMo: disabled'
Write-Host "Trace: $(if ($Diagnostics) { 'enabled — diagnostic run, not comparable to baseline' } else { 'disabled during measurement' })"
Write-Host 'Continuation: same sheet to the end region before the long-session sample'
Write-Host 'Integration tests are intentionally not run inside the timing command.'

Invoke-DotNetStep `
    -Title 'Building browser tests and application in Release' `
    -Arguments @(
        'build',
        $browserProject,
        '--configuration', 'Release',
        '--nologo'
    )

$arguments = @(
    'run',
    '--project', $browserProject,
    '--configuration', 'Release',
    '--no-build',
    '--',
    '--suite', 'performance',
    '--performance-action', $Action.ToLowerInvariant(),
    '--rows-per-year', $RowsPerYear.ToString(),
    '--performance-runs', $Runs.ToString()
)

if ($Headed) {
    $arguments += '--headed'
}

if ($Diagnostics) {
    $arguments += '--performance-diagnostics'
}

if ($KeepDatabase) {
    $arguments += '--keep-database'
}

Invoke-DotNetStep `
    -Title "Running neutral $Action performance baseline" `
    -Arguments $arguments

Write-Host "`nERPPrototype neutral performance baseline: PASS" -ForegroundColor Green
