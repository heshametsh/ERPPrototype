# ERPPrototype Phase 9.2D1 — Neutral Performance Baseline Harness

Base: Phase 9.2C after 17/17 Integration, 55/55 Browser Stress, and CSS validation PASS.

## Replaces

The Phase 9.2D Arrow soak that used Stress + Observe + 650 ms SlowMo + tracing +
`tabulatorPerformance` instrumentation.

## Adds

- Dedicated `Performance` E2E suite.
- Independent fresh-browser runs.
- Configurable Arrow, Enter, or Wheel action.
- Configurable 1,000 / 5,000 / 10,000 rows per year.
- Neutral event-to-paint measurement with raw samples, P50, P95, heap, and DOM metrics.
- Trace-free normal baseline and separate diagnostic mode.
- `Tools\Invoke-ERPPerformanceBaseline.ps1`.

## Removes from the normal Stress suite

- `ERP_PERFORMANCE_SOAK` environment switch.
- The extra 8 timing assertions.
- The old in-page performance-observatory dependency.

The normal Stress suite remains 55/55.

## Database

No migration. Every performance run uses an isolated temporary SQL Server database.

## First command

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```
