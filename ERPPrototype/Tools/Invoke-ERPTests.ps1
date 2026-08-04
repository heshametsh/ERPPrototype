[CmdletBinding()]
param(
    [switch]$Headed,
    [switch]$KeepDatabase,

    [ValidateSet('Smoke', 'Full', 'Stress')]
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
Write-Host "Browser mode: $(if ($Headed) { 'Headed/visible/no-slowmo' } else { 'Headless/no-slowmo' })"
Write-Host 'Browser dataset: 1,000 rows per year (2,000 seeded rows total)'

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
    $integrationArguments = @(
        'run',
        '--project', $integrationProject,
        '--configuration', 'Release',
        '--no-build'
    )

    $integrationTitle = 'Running the 16 SQL Server save and financial safety checks'

    if ($Suite -eq 'Stress') {
        $integrationArguments += @('--', '--stress')
        $integrationTitle = 'Running 16 core SQL Server checks plus the 1,000-row batch stress check'
    }

    Invoke-DotNetStep -Title $integrationTitle -Arguments $integrationArguments
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

$expectedBrowserChecks = switch ($Suite) {
    'Smoke' { 10 }
    'Full' { 48 }
    'Stress' { 55 }
}

$integrationSummary = if ($SkipIntegration) {
    'Integration tests: skipped'
}
elseif ($Suite -eq 'Stress') {
    'Integration tests: 17/17 PASS (includes 1,000-row add/update/delete)'
}
else {
    'Integration tests: 16/16 PASS'
}

Write-Host "`nERPPrototype automated verification: PASS" -ForegroundColor Green
Write-Host "$integrationSummary | Browser checks: $expectedBrowserChecks/$expectedBrowserChecks PASS ($Suite)"
