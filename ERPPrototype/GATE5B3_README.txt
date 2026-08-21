ERP Prototype - RevoGrid Gate 5B-3
Date: 2026-08-21

New route:
/work-orders-revogrid-gate5b3

Self-test:
/grid-shootout/revogrid-excel-filter-state-lab.html
Expected: PASS 9 / FAIL 0

Scope:
- Excel-like selected-value filter UI.
- Assignment Date and custom Date: Year -> Month -> Day.
- RevoGrid Community 4.25.2 FilterPlugin remains the filter engine.
- Apply/Clear are one Sheet History action.
- Filter never enters Change Engine Dirty.
- Filter-only / Sort-only column policy restored for Gate 5B-3.
- Gate 5B-2 route remains behaviorally isolated.
- No production /work-orders cutover and no database Save added.
