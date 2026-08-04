# Phase 9.2D — Arrow-Only Performance Health Test

This candidate adds a dedicated, opt-in automated performance soak to diagnose same-sheet navigation fatigue.

## Files

- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `Tools/Invoke-ERPPerformanceSoak.ps1`
- `Documentation/32_CHANGE_SUMMARY_2026-08-03_PHASE9_2D.md`

## Important

- No database migration.
- No application/UI/CSS/JavaScript change.
- Normal Stress stays at 55/55.
- The dedicated performance command expects 63/63 browser checks.
- Do not commit until the new report has been reviewed.

## Run

From the solution root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceSoak.ps1
```

After the run, send the console summary and upload:

`phase9-arrow-navigation-health-metrics.json`
