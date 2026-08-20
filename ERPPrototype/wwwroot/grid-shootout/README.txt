ERP GRID SHOOTOUT — GATE 0

Purpose
-------
This is an isolated evaluation lab. It does not replace or modify the Work Orders page.

Candidates
----------
- Tabulator 6.5.0 (local stock control)
- SlickGrid Universal 10.9.0 (MIT, pinned CDN)
- RevoGrid 4.24.2 (MIT, pinned CDN)
- Univer 0.25.1 (Apache-2.0, pinned UMD CDN)

Primary kill tests
------------------
1) Select Basket cell, violent top/bottom scrollbar drag 20 times, return and verify same logical cell/column.
2) 30 seconds aggressive wheel scroll.
3) Paste 1000 x 6 payload, verify shape, undo/redo where supported.
4) Toggle half-width 20 times with active selection.
5) Zoom 100 -> 90 -> 80 -> 75 -> 70 -> 67 -> 100.
6) RTL toggle and keyboard/navigation verification.
7) Repeat on 50k and 100k rows for headroom.
8) Export metrics JSON after each run.

Decision policy
---------------
Any 10k-row correctness failure is fatal. Performance is compared only after correctness passes.
Survivors move to Gate 1: real ERP integration torture tests.
