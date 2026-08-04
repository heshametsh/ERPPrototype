# ERPPrototype Phase 9.2D2 Patch Manifest

Base: Phase 9.2D1 candidate.

## Purpose

- Remove Observe and all artificial Playwright delay.
- Fix the E2E year-reload race exposed by `row Id 2000`.
- Separate functional Stress diagnostics from quantitative performance.
- Make Performance traverse the real dataset to its end region.
- Add one-command Arrow/Enter/Wheel × 1k/5k/10k matrix execution.

## Modified application/tooling files

- `Tools\Invoke-ERPTests.ps1`
- `Tools\Invoke-ERPPerformanceBaseline.ps1`
- `Tools\Invoke-ERPPerformanceSoak.ps1`
- `README.md`
- `START_HERE_ERP_PROTOTYPE.md`
- `Documentation\03_CURRENT_IMPLEMENTATION.md`
- `Documentation\06_REGRESSION_TEST_CHECKLIST.md`

## Added application/tooling files

- `Tools\Invoke-ERPPerformanceMatrix.ps1`
- `Documentation\34_CHANGE_SUMMARY_2026-08-04_PHASE9_2D2.md`
- `PATCH_MANIFEST_PHASE_9_2D2.md`

## Modified E2E files

- `E2ETestOptions.cs`
- `E2EBrowserSession.cs`
- `Phase9FoundationRunner.cs`
- `Phase9FoundationBrowserTest.cs`
- `WorkOrdersPage.cs`
- `PerformanceBaselineBrowserTest.cs`
- `PerformanceBaselineReport.cs`

## Database

No migration and no developer-database update.

## First command after copying

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

Do not create a Git checkpoint until 17/17 Integration and 55/55 Browser pass.
