[CmdletBinding()]
param(
    [switch]$SkipJavaScriptSyntax
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$testProject = Join-Path $projectRoot 'ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj'
$mainProject = Join-Path $projectRoot 'ERPPrototype.csproj'

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-LastExitCode {
    param([Parameter(Mandatory)][string]$Operation)
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path $mainProject)) {
    throw "ERPPrototype.csproj was not found at $mainProject"
}

if (-not (Test-Path $testProject)) {
    throw "Integration-test project was not found at $testProject"
}

Write-Host 'ERPPrototype Phase 8 final verification' -ForegroundColor Green
Write-Host "Project: $projectRoot"

Write-Step 'Building the web project and integration-test project in Release'
& dotnet build $testProject --configuration Release --nologo
Assert-LastExitCode 'Release build'

if (-not $SkipJavaScriptSyntax) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue

    if ($null -eq $nodeCommand) {
        Write-Warning 'Node.js was not found. JavaScript syntax checks were skipped.'
    }
    else {
        Write-Step 'Checking project-owned JavaScript syntax'
        $javascriptFiles = Get-ChildItem (Join-Path $projectRoot 'wwwroot\js') -Filter '*.js' -File | Sort-Object FullName

        foreach ($file in $javascriptFiles) {
            & $nodeCommand.Source --check $file.FullName
            Assert-LastExitCode "JavaScript syntax check for $($file.Name)"
        }

        Write-Host "JavaScript syntax: PASS ($($javascriptFiles.Count) files)" -ForegroundColor Green
    }
}

Write-Step 'Running the 10 automated save safety tests on an isolated temporary SQL Server database'
$testOutput = & dotnet run --project $testProject --configuration Release --no-build 2>&1
$testExitCode = $LASTEXITCODE
$testOutput | ForEach-Object { Write-Host $_ }

if ($testExitCode -ne 0) {
    throw "Automated save safety tests failed with exit code $testExitCode."
}

$joinedOutput = $testOutput -join "`n"
if ($joinedOutput -notmatch 'Result:\s*10/10 passed\.' -or
    $joinedOutput -notmatch 'Phase 8\.8-R2 automated save safety net:\s*PASS') {
    throw 'The integration runner exited successfully but the required 10/10 PASS markers were not found.'
}

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$gitRoot = $null
if ($null -ne $gitCommand) {
    $gitRootCandidate = & $gitCommand.Source -C $projectRoot rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gitRootCandidate)) {
        $gitRoot = $gitRootCandidate.Trim()
    }
}

if ($null -ne $gitRoot) {
    Write-Step 'Checking Git whitespace and tracked generated files'
    & $gitCommand.Source -C $gitRoot diff --check
    Assert-LastExitCode 'git diff --check'

    $trackedFiles = & $gitCommand.Source -C $gitRoot ls-files
    Assert-LastExitCode 'git ls-files'

    $forbiddenTracked = @($trackedFiles | Where-Object {
        $_ -match '(^|/)(bin|obj|\.vs|TestResults|coverage|publish)/' -or
        $_ -match '\.(user|suo|pdb|exe|dll)$'
    })

    if ($forbiddenTracked.Count -gt 0) {
        throw "Generated or machine-local files are tracked by Git:`n$($forbiddenTracked -join "`n")"
    }

    Write-Host 'Git source hygiene: PASS' -ForegroundColor Green
}
else {
    Write-Host 'Git source hygiene: SKIPPED (the project is not inside a Git worktree).' -ForegroundColor Yellow
}

Write-Host "`nPhase 8.9 automated verification: PASS" -ForegroundColor Green
Write-Host 'No production database was used. The integration database was temporary and isolated.'
