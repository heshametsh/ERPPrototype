param(
    [string]$RepoRoot = "C:\Users\Hesham\source\repos\ERPPrototype"
)

$ErrorActionPreference = "Stop"
$script:Failures = New-Object System.Collections.Generic.List[string]

function Run-RequiredStep {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Name
    Write-Host "============================================================"

    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name FAILED (exit code $LASTEXITCODE)"
    }

    Write-Host "$Name : PASS"
}

function Run-TestStep {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Name
    Write-Host "============================================================"

    & $Action
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        $script:Failures.Add($Name)
        Write-Host "$Name : FAILED (exit code $code)"
        return
    }

    Write-Host "$Name : PASS"
}

Push-Location $RepoRoot
try {
    $app = "ERPPrototype\ERPPrototype.csproj"
    $integration = "ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj"
    $e2e = "ERPPrototype\ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj"

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "ERP FULL REGRESSION - ONE COMMAND"
    Write-Host "============================================================"
    Write-Host "Fresh build first. Test suites continue even if one suite fails."

    Run-RequiredStep "00 - CLEAN APP" {
        dotnet clean $app -c Debug
    }

    Run-RequiredStep "01 - CLEAN INTEGRATION" {
        dotnet clean $integration -c Debug
    }

    Run-RequiredStep "02 - CLEAN E2E" {
        dotnet clean $e2e -c Debug
    }

    Run-RequiredStep "03 - RESTORE APP" {
        dotnet restore $app
    }

    Run-RequiredStep "04 - RESTORE INTEGRATION" {
        dotnet restore $integration
    }

    Run-RequiredStep "05 - RESTORE E2E" {
        dotnet restore $e2e
    }

    Run-RequiredStep "06 - BUILD APP" {
        dotnet build $app -c Debug --no-restore
    }

    Run-RequiredStep "07 - BUILD INTEGRATION" {
        dotnet build $integration -c Debug --no-restore
    }

    Run-RequiredStep "08 - BUILD E2E" {
        dotnet build $e2e -c Debug --no-restore
    }

    Run-TestStep "10 - REAL EMPLOYEE WORKDAY" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-employee-real-workday
    }

    Run-TestStep "20 - RENAME FOCUSED BREAK SUITE" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-gate5c1-rename-focused
    }

    Run-TestStep "30 - B9-B11 FULL REGRESSION" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-b9-b11-full-regression
    }

    Run-TestStep "40 - B12 REAL DB SAVE" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-gate5b12-real-db
    }

    Run-TestStep "50 - INTEGRATION TESTS" {
        dotnet test $integration -c Debug --no-build --no-restore
    }

    Write-Host ""
    Write-Host "============================================================"
    if ($script:Failures.Count -eq 0) {
        Write-Host "ERP FULL REGRESSION : PASS"
        Write-Host "============================================================"
        Write-Host "Real Employee Workday .... PASS"
        Write-Host "Rename Focused ........... PASS"
        Write-Host "B9-B11 Regression ........ PASS"
        Write-Host "B12 Real DB Save ......... PASS"
        Write-Host "Integration .............. PASS"
        exit 0
    }

    Write-Host "ERP FULL REGRESSION : FAILED"
    Write-Host "============================================================"
    Write-Host ("Failed suites: " + ($script:Failures -join ", "))
    Write-Host "All remaining suites were still executed so one run exposes every failure."
    exit 1
}
finally {
    Pop-Location
}
