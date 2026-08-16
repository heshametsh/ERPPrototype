[CmdletBinding()]
param(
    [ValidateSet(1000, 5000, 10000)]
    [int]$RowsPerYear = 10000,

    [ValidateRange(3, 10)]
    [int]$Runs = 3,

    [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$browserProject = Join-Path `
    $projectRoot `
    'ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj'
$verificationScript = Join-Path `
    $PSScriptRoot `
    'Invoke-ERPTests.ps1'

if (-not (Test-Path -LiteralPath $browserProject)) {
    throw "Browser-test project was not found at $browserProject"
}

if (-not (Test-Path -LiteralPath $verificationScript)) {
    throw "Verification script was not found at $verificationScript"
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

Write-Host 'ERPPrototype real-user Work Orders performance baseline' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "Dataset: $RowsPerYear rows per year"
Write-Host "Independent visible runs: $Runs"
Write-Host 'Primary UX case: Split Screen 100% (960x900 content viewport)'
Write-Host 'Browser: headed/visible Chromium, no SlowMo; short pauses happen only after each measured action'
Write-Host 'Measurements: user-journey wall time + Chromium main-thread Long Tasks'
Write-Host 'Safety gate: SQL integration tests + Full browser regression must pass first'
Write-Host 'Acceptance rule: numbers alone are not enough; the visible run must also feel smooth'
Write-Host 'Final SEC Edge/network validation remains a separate environment gate'

Write-Host "`n==> Running the accepted functional safety gate before real-user timing" -ForegroundColor Cyan
& $verificationScript -Suite Full

$arguments = @(
    'run',
    '--project', $browserProject,
    '--configuration', 'Release',
    '--no-build',
    '--',
    '--suite', 'RealUserPerformance',
    '--rows-per-year', $RowsPerYear.ToString(),
    '--performance-runs', $Runs.ToString(),
    '--headed'
)

if ($KeepDatabase) {
    $arguments += '--keep-database'
}

Invoke-DotNetStep `
    -Title "Running visible Split Screen real-user baseline with $RowsPerYear rows" `
    -Arguments $arguments

Write-Host "`nERPPrototype real-user Work Orders performance baseline: AUTOMATED PASS" -ForegroundColor Green
Write-Host 'Safety gate: Integration PASS + Full browser PASS'
Write-Host 'A JSON report and final screenshot were written under ERPPrototype.E2ETests\TestArtifacts.'
Write-Host 'IMPORTANT: do not close Performance acceptance from this line alone.' -ForegroundColor Yellow
Write-Host 'Human check still required: did the visible search/filter/sort/scroll/edit/Paste/Undo/Redo/Save/year-switch sequence feel smooth?' -ForegroundColor Yellow
