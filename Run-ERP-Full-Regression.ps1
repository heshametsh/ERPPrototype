param(
    [string]$RepoRoot = "C:\Users\Hesham\source\repos\ERPPrototype",
    [switch]$PreflightOnly
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

    $global:LASTEXITCODE = 0
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

    $global:LASTEXITCODE = 0
    & $Action
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        $script:Failures.Add($Name)
        Write-Host "$Name : FAILED (exit code $code)"
        return
    }

    Write-Host "$Name : PASS"
}

function Assert-TextContains {
    param([string]$Path,[string]$Expected,[string]$Message)
    if (-not (Test-Path $Path)) { throw "Missing preflight file: $Path" }
    $content = [IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8)
    if (-not $content.Contains($Expected)) { throw $Message }
}

function Invoke-HarnessPreflight {
    $gate = Join-Path $RepoRoot "ERPPrototype\Components\Pages\WorkOrdersRevoGridGate5C1.razor"
    $program = Join-Path $RepoRoot "ERPPrototype\ERPPrototype.E2ETests\Program.cs"
    $b12Runner = Join-Path $RepoRoot "ERPPrototype\ERPPrototype.E2ETests\Gate5B12RealDbSaveRunner.cs"
    $canonicalSurface = Join-Path $RepoRoot "ERPPrototype\ERPPrototype.E2ETests\RevoCanonicalTestSurface.cs"
    Assert-TextContains $gate '@page "/work-orders-revogrid"' 'Canonical Revo Work Orders route changed or disappeared.'
    $revoRoutes = Get-ChildItem (Join-Path $RepoRoot "ERPPrototype\Components\Pages") -Filter "WorkOrdersRevoGrid*.razor" |
        Select-String -Pattern '^@page "/work-orders-revogrid'
    if ($revoRoutes.Count -ne 1 -or $revoRoutes[0].Line.Trim() -ne '@page "/work-orders-revogrid"') {
        throw 'Revo Work Orders must expose exactly one route: /work-orders-revogrid.'
    }
    Assert-TextContains $gate 'EnableSaveHandshake="true"' 'Gate 5C-1 no longer enables the Save handshake used by the active module path.'
    Assert-TextContains $gate 'EnableColumnVisibility="true"' 'Gate 5C-1 no longer enables Column Visibility.'
    Assert-TextContains $program '"--revo-gate5c1-visibility-focused"' 'Visibility focused runner is not wired in Program.cs.'
    Assert-TextContains $program '"--revo-employee-real-workday"' 'Employee Real Workday runner is not wired in Program.cs.'
    Assert-TextContains $program '"--revo-empty-sheet"' 'Canonical Empty Sheet runner is not wired in Program.cs.'
    Assert-TextContains $program '"--startup-security"' 'Startup Security runner is not wired in Program.cs.'
    Assert-TextContains $b12Runner 'using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;' 'B12 no longer uses the canonical Revo test surface.'
    Assert-TextContains $canonicalSurface 'internal const string GatePath = "/work-orders-revogrid";' 'Canonical Revo test surface no longer targets /work-orders-revogrid.'
    Assert-TextContains $b12Runner 'ResolveActiveModulePathAsync(page)' 'B12 no longer verifies the browser-loaded Gate module dynamically.'
}

function Assert-E2EBuildFreshness {
    $dll=Join-Path $RepoRoot "ERPPrototype\ERPPrototype.E2ETests\bin\Debug\net10.0\ERPPrototype.E2ETests.dll"
    if(-not (Test-Path $dll)){ throw 'E2E build output is missing after Build.' }
    $sources=@(
        "ERPPrototype\ERPPrototype.E2ETests\Program.cs",
        "ERPPrototype\ERPPrototype.E2ETests\RevoCanonicalTestSurface.cs",
        "ERPPrototype\ERPPrototype.E2ETests\EmployeeRealWorkdayRunner.cs",
        "ERPPrototype\ERPPrototype.E2ETests\EmptySheetLifecycleRunner.cs",
        "ERPPrototype\ERPPrototype.E2ETests\StartupSecurityRunner.cs",
        "ERPPrototype\ERPPrototype.E2ETests\Gate5C1RenameFocusedRunner.cs",
        "ERPPrototype\ERPPrototype.E2ETests\Gate5C1VisibilityFocusedRunner.cs",
        "ERPPrototype\ERPPrototype.E2ETests\Gate5B12RealDbSaveRunner.cs"
    ) | ForEach-Object { Get-Item (Join-Path $RepoRoot $_) }
    $latest=($sources | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
    if((Get-Item $dll).LastWriteTimeUtc -lt $latest){ throw 'E2E DLL is older than current harness source after Build.' }
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

    Run-RequiredStep "PREFLIGHT - SOURCE/HARNESS" {
        Invoke-HarnessPreflight
    }

    if ($PreflightOnly) {
        Write-Host "ERP HARNESS PREFLIGHT : PASS"
        exit 0
    }

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
    Run-RequiredStep "09 - E2E BUILD FRESHNESS" {
        Assert-E2EBuildFreshness
    }

    Run-TestStep "10 - REAL EMPLOYEE WORKDAY" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-employee-real-workday
    }

    Run-TestStep "20 - RENAME FOCUSED BREAK SUITE" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-gate5c1-rename-focused
    }
    Run-TestStep "25 - VISIBILITY FOCUSED BREAK SUITE" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-gate5c1-visibility-focused
    }

    Run-TestStep "30 - CANONICAL EMPTY SHEET" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-empty-sheet
    }

    Run-TestStep "40 - B12 REAL DB SAVE" {
        dotnet run --project $e2e -c Debug --no-build -- --revo-gate5b12-real-db
    }

    Run-TestStep "45 - STARTUP SECURITY" {
        dotnet run --project $e2e -c Debug --no-build -- --startup-security
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
        Write-Host "Visibility Focused ....... PASS"
        Write-Host "Canonical Empty Sheet .... PASS"
        Write-Host "B12 Real DB Save ......... PASS"
        Write-Host "Startup Security ......... PASS"
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
