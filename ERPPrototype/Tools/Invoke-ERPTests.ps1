[CmdletBinding()]
param(
    [switch]$Headed,
    [switch]$KeepDatabase,

    [ValidateSet('Smoke', 'Full')]
    [string]$Suite = 'Full',

    [switch]$SkipIntegration
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$integrationProject = Join-Path $projectRoot 'ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj'
$browserProject = Join-Path $projectRoot 'ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj'

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

if (-not (Test-Path $browserProject)) {
    throw "Browser-test project was not found at $browserProject"
}

if (-not $SkipIntegration -and -not (Test-Path $integrationProject)) {
    throw "Integration-test project was not found at $integrationProject"
}

Write-Host 'ERPPrototype automated verification' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "Browser suite: $Suite"

if (-not $SkipIntegration) {
    Invoke-DotNetStep -Title 'Building the SQL Server integration-test project in Release' -Arguments @(
        'build',
        $integrationProject,
        '--configuration', 'Release',
        '--nologo'
    )
}

Invoke-DotNetStep -Title 'Building browser tests, web application, and referenced projects in Release' -Arguments @(
    'build',
    $browserProject,
    '--configuration', 'Release',
    '--nologo'
)

if (-not $SkipIntegration) {
    Invoke-DotNetStep -Title 'Running the 10 SQL Server save safety checks' -Arguments @(
        'run',
        '--project', $integrationProject,
        '--configuration', 'Release',
        '--no-build'
    )
}

$browserArguments = @(
    'run',
    '--project', $browserProject,
    '--configuration', 'Release',
    '--no-build',
    '--',
    '--suite', $Suite.ToLowerInvariant()
)

if ($Headed) {
    $browserArguments += '--headed'
}

if ($KeepDatabase) {
    $browserArguments += '--keep-database'
}

Invoke-DotNetStep -Title "Running the $Suite browser suite" -Arguments $browserArguments

$expectedBrowserChecks = if ($Suite -eq 'Smoke') { 5 } else { 9 }
$integrationSummary = if ($SkipIntegration) { 'Integration tests: skipped' } else { 'Integration tests: 10/10 PASS' }

Write-Host "`nERPPrototype automated verification: PASS" -ForegroundColor Green
Write-Host "$integrationSummary | Browser checks: $expectedBrowserChecks/$expectedBrowserChecks PASS ($Suite)"
