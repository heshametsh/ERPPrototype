# Phase 9.2D — Arrow-Only Performance Health Test

## Purpose

Add a dedicated automated browser performance test for the Work Orders sheet after the user reported that the sheet feels as if it slows down during continued use.

This phase measures performance only. It does not change the Work Orders page, business rules, database, CSS, or save behavior.

## Test protocol

The test follows the approved isolation rule:

1. Load the current-year sheet with 1,000 rows.
2. Select the first active Work Order Number cell.
3. Measure 160 `ArrowDown` presses as the cold sample.
4. Continue on the same sheet for another 560 `ArrowDown` presses without refresh, year change, search, wheel, Enter, or other operations.
5. Measure another 160 `ArrowDown` presses as the long-session sample.
6. Confirm the sheet still has 1,000 rows and no unsaved changes.

Total: 880 Arrow-only navigation steps in one continuous sheet session.

## Measurements

- Cold and long-session input-to-paint P50, P95, and maximum latency.
- Cold-to-long P95 delta and ratio.
- Long tasks.
- Chromium JavaScript heap snapshots.
- Listener, timer, animation-frame, and observer balance during the continuation segment.
- Maximum number of rendered Tabulator row elements.
- Final row count and dirty-row count.

## Automated budgets

- Cold Arrow P95 must remain at or below 100 ms.
- Long-session Arrow P95 must remain at or below 100 ms.
- Long-session regression must be limited: no more than 20 ms absolute increase, unless the ratio remains at or below 1.80x.
- Positive lifecycle-resource growth is tightly bounded.
- Rendered rows must stay at or below 150.
- Every requested Arrow step must be processed.
- The sheet must remain at 1,000 rows with zero dirty rows.

## Output

The dedicated run produces:

`phase9-arrow-navigation-health-metrics.json`

inside the normal E2E `TestArtifacts` run folder.

The existing `phase9-1000-row-stress-metrics.json` is still produced as before.

## Run command

From the solution root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceSoak.ps1
```

Expected healthy result:

- Integration: 17/17 PASS
- Browser: 63/63 PASS
- ERPPrototype automated verification: PASS

Normal Stress runs remain 55/55 because the extra performance soak is enabled only by the dedicated script.
