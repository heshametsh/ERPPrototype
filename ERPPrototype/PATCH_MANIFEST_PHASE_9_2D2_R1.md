# ERPPrototype Phase 9.2D2-R1 Patch Manifest

## Purpose

Stabilize the previous-year Virtual DOM reachability check after Phase 9.2D2.

The previous-year dataset loaded correctly, but the E2E test could request the
last row while the basket-dashboard height correction was still restoring the
old top-of-grid viewport. The application, database, Razor, CSS, and runtime
JavaScript are unchanged.

## Changed file

- `ERPPrototype.E2ETests\WorkOrdersPage.cs`

## Test-harness changes

- Year switching now waits for summary and basket dashboard readiness.
- Year switching waits until aggregate, viewport-layout, resize, and viewport-
  restore frames are idle.
- `ScrollToRowAsync` retries until the requested row is genuinely rendered
  inside the live Tabulator viewport after all late layout restoration ends.
- The DOM reachability assertion remains intact; it is not weakened to a data-
  only assertion.

## Required verification

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

Expected result:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS

Do not run or accept a performance baseline until Stress is fully green.
