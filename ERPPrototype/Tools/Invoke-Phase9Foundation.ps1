[CmdletBinding()]
param(
    [switch]$Headed,
    [switch]$KeepDatabase
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

if (-not (Test-Path $integrationProject)) {
    throw "Integration-test project was not found at $integrationProject"
}

if (-not (Test-Path $browserProject)) {
    throw "Browser-test project was not found at $browserProject"
}

Write-Host 'ERPPrototype Phase 9.0 automated foundation verification' -ForegroundColor Green
Write-Host "Project: $projectRoot"

Invoke-DotNetStep -Title 'Building the SQL Server integration-test project in Release' -Arguments @(
    'build',
    $integrationProject,
    '--configuration', 'Release',
    '--nologo'
)

Invoke-DotNetStep -Title 'Building browser tests, web application, and referenced projects in Release' -Arguments @(
    'build',
    $browserProject,
    '--configuration', 'Release',
    '--nologo'
)

Invoke-DotNetStep -Title 'Running the 10 SQL Server save safety checks' -Arguments @(
    'run',
    '--project', $integrationProject,
    '--configuration', 'Release',
    '--no-build'
)

$browserArguments = @(
    'run',
    '--project', $browserProject,
    '--configuration', 'Release',
    '--no-build',
    '--'
)

if ($Headed) {
    $browserArguments += '--headed'
}

if ($KeepDatabase) {
    $browserArguments += '--keep-database'
}

Invoke-DotNetStep -Title 'Running the Phase 9.0 login, sheet, and year-selection browser journey' -Arguments $browserArguments

Write-Host "`nPhase 9.0 automated foundation verification: PASS" -ForegroundColor Green
Write-Host 'Integration tests: 10/10 PASS | Browser checks: 4/4 PASS'
