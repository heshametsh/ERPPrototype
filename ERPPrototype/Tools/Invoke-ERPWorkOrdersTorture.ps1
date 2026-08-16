[CmdletBinding()]
param(
    [int]$RowsPerYear = 10000,
    [switch]$Headless,
    [switch]$SkipSafetyGate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$verificationScript = Join-Path $PSScriptRoot 'Invoke-ERPTests.ps1'
$browserProject = Join-Path $projectRoot 'ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj'

if ($RowsPerYear -lt 10000 -or $RowsPerYear -gt 10000) {
    throw 'The accepted Work Orders torture target is currently exactly 10,000 rows per year.'
}

Write-Host 'ERPPrototype Work Orders TORTURE test' -ForegroundColor Magenta
Write-Host "Project: $projectRoot"
Write-Host "Dataset: $RowsPerYear rows per year"
Write-Host 'Bulk abuse: edit 1,000 + insert 1,000 + delete 1,000, with Undo/Redo and persistence verification'
Write-Host 'Additional abuse: repeated search/filter/sort, wheel, 1,000 keyboard moves, dirty-state interaction, year switching'
Write-Host 'This suite is intentionally harsh. A functional PASS can still contain unacceptable latency/Long Tasks.'

if (-not $SkipSafetyGate) {
    Write-Host "`n==> Safety gate: Integration + Full browser regression" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File $verificationScript -Suite Full
    if ($LASTEXITCODE -ne 0) {
        throw "Safety gate failed with exit code $LASTEXITCODE. Torture test was not started."
    }
}

Write-Host "`n==> Building the torture browser suite in Release" -ForegroundColor Cyan
& dotnet build $browserProject --configuration Release --no-incremental --nologo
if ($LASTEXITCODE -ne 0) {
    throw "Torture browser build failed with exit code $LASTEXITCODE."
}

$arguments = @(
    'run',
    '--project', $browserProject,
    '--configuration', 'Release',
    '--no-build',
    '--',
    '--torture',
    '--rows-per-year', "$RowsPerYear"
)

if (-not $Headless) {
    $arguments += '--headed'
}

Write-Host "`n==> Hammering Work Orders" -ForegroundColor Magenta
& dotnet @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Work Orders torture suite failed with exit code $LASTEXITCODE."
}

Write-Host "`nERPPrototype Work Orders TORTURE: PASS" -ForegroundColor Green
Write-Host 'Interpretation: the sheet survived the abuse without detected data loss or browser/server errors.'
Write-Host 'Performance findings still require reviewing the printed phase timings and Long Tasks.'
