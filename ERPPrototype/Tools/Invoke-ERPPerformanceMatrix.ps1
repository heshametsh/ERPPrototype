[CmdletBinding()]
param(
    [ValidateSet(1000, 5000, 10000)]
    [int[]]$RowsPerYear = @(1000, 5000, 10000),

    [ValidateSet('Arrow', 'Enter', 'Wheel')]
    [string[]]$Action = @('Arrow', 'Enter', 'Wheel'),

    [ValidateRange(3, 10)]
    [int]$Runs = 5,

    [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

$keyboardActionsPerRun = 30 + 120 + 120
$wheelActionsPerRun = 20 + 80 + 80
$minimumDeepActions = 0

foreach ($rows in $RowsPerYear) {
    foreach ($currentAction in $Action) {
        if ($currentAction -eq 'Wheel') {
            $minimumDeepActions += [Math]::Max(
                240,
                [Math]::Floor($rows / 4)
            )
        }
        else {
            $minimumDeepActions += [Math]::Max(
                500,
                [Math]::Floor($rows / 2)
            )
        }
    }
}

$fixedActionsPerMatrixRun = 0
foreach ($currentAction in $Action) {
    if ($currentAction -eq 'Wheel') {
        $fixedActionsPerMatrixRun += $wheelActionsPerRun
    }
    else {
        $fixedActionsPerMatrixRun += $keyboardActionsPerRun
    }
}

$minimumTotalActions = (
    (($fixedActionsPerMatrixRun * $RowsPerYear.Count) + $minimumDeepActions) *
    $Runs
)

Write-Host 'ERPPrototype deep neutral performance matrix' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "Actions: $($Action -join ', ')"
Write-Host "Datasets: $($RowsPerYear -join ', ') rows per year"
Write-Host "Fresh-browser runs per combination: $Runs"
Write-Host 'Browser: Headless/no-slowmo'
Write-Host 'Trace: disabled during measurement'
Write-Host 'Year changes and Refresh: prohibited inside each measured run'
Write-Host (
    'Minimum generated input actions: ' +
    $minimumTotalActions.ToString('N0') +
    ' (actual count is higher because every run continues to the sheet end region)'
)
Write-Host 'Integration tests are intentionally separate from the timing matrix.'

Invoke-DotNetStep `
    -Title 'Building browser tests and application once in Release' `
    -Arguments @(
        'build',
        $browserProject,
        '--configuration', 'Release',
        '--nologo'
    )

$combinationNumber = 0
$totalCombinations = $RowsPerYear.Count * $Action.Count

foreach ($rows in $RowsPerYear) {
    foreach ($currentAction in $Action) {
        $combinationNumber++

        $arguments = @(
            'run',
            '--project', $browserProject,
            '--configuration', 'Release',
            '--no-build',
            '--',
            '--suite', 'performance',
            '--performance-action', $currentAction.ToLowerInvariant(),
            '--rows-per-year', $rows.ToString(),
            '--performance-runs', $Runs.ToString()
        )

        if ($KeepDatabase) {
            $arguments += '--keep-database'
        }

        Invoke-DotNetStep `
            -Title (
                "Performance matrix $combinationNumber/$totalCombinations: " +
                "$currentAction with $rows rows per year"
            ) `
            -Arguments $arguments
    }
}

Write-Host "`nERPPrototype deep neutral performance matrix: PASS" -ForegroundColor Green
Write-Host (
    "$totalCombinations combinations completed. " +
    'Each combination produced an independent JSON baseline report under TestArtifacts.'
)
