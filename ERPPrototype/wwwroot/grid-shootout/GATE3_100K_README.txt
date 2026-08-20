RevoGrid Community — Gate 3 — 100,000 rows

Guided/manual interaction with automatic PASS/FAIL.

Fixes from Gate 2.6:
- Paste verification is keyed by stable row ID, not visual/source position after Sort.
- Paste uses Notes so changing a sorted Work Order value cannot reshuffle rows during verification.
- 4000->200 end-of-sheet verification is also keyed by stable row ID.
- Filter expected count is scaled to 12,500 NeedLicense rows out of 100,000.

Work Orders runtime is not modified.
