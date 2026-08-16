[CmdletBinding()]
param(
    [ValidateSet(1000, 5000, 10000)]
    [int[]]$RowsPerYear = @(1000, 5000, 10000),

    [ValidateRange(3, 10)]
    [int]$Runs = 5,

    [switch]$Headed,
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

Write-Host 'ERPPrototype clean Work Orders open baseline' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "Datasets: $($RowsPerYear -join ', ') rows per year"
Write-Host "Fresh-browser runs per dataset: $Runs"
Write-Host "Browser: $(if ($Headed) { 'Headed/visible/no-slowmo' } else { 'Headless/no-slowmo' })"
Write-Host 'Profiler: baseline mode only; measured hook overhead is reported'
Write-Host 'Purpose: separate SQL/server work from browser/grid initialization during Work Orders open'
Write-Host 'Safety gate: SQL integration tests + Full browser regression must pass before timing starts'
Write-Host 'Important: local loopback timing is not SEC-network latency'

Write-Host "`n==> Running the accepted functional safety gate before performance timing" -ForegroundColor Cyan
$verificationParameters = @{
    Suite = 'Full'
}

if ($Headed) {
    $verificationParameters.Headed = $true
}

& $verificationScript @verificationParameters

foreach ($rows in $RowsPerYear) {
    $arguments = @(
        'run',
        '--project', $browserProject,
        '--configuration', 'Release',
        '--no-build',
        '--',
        '--suite', 'OpenPerformance',
        '--rows-per-year', $rows.ToString(),
        '--performance-runs', $Runs.ToString()
    )

    if ($Headed) {
        $arguments += '--headed'
    }

    if ($KeepDatabase) {
        $arguments += '--keep-database'
    }

    Invoke-DotNetStep `
        -Title "Measuring Work Orders open with $rows rows per year" `
        -Arguments $arguments
}

Write-Host "`nERPPrototype clean Work Orders open baseline: PASS" -ForegroundColor Green
Write-Host 'Safety gate: Integration PASS + Full browser PASS'
Write-Host 'Each dataset produced an independent JSON report under ERPPrototype.E2ETests\TestArtifacts.'
