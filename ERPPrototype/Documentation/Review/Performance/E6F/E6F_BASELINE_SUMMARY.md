# E6F Provisional Performance Baseline — 2026-07-27

**Status:** Accepted as a temporary refactor reference by user decision.

## Source runs

- `E6F_BASELINE_RUN_1.json` — clean long navigation run, viewport 1351×838.
- `E6F_BASELINE_RUN_2.json` — clean long navigation run, viewport 1738×838.

## Calculated reference

| Movement | Average input-to-paint | Average p95 | Temporary ceiling |
|---|---:|---:|---:|
| ArrowDown | 59.71 ms | 107.3 ms | 118 ms |
| ArrowUp | 75.65 ms | 108.3 ms | 119 ms |
| Enter | 92.77 ms | 125.2 ms | 138 ms |

## Interpretation

- Both reports completed thousands of movements with zero JavaScript errors.
- The keydown handler itself remained negligible; the larger cost is rendering/Virtual DOM work.
- These values are for regression detection during extraction, not final product targets.
- Because viewport widths differ and only two runs were accepted, do not claim small performance gains from this reference.
- `GRID-001` long-session fatigue remains open.
