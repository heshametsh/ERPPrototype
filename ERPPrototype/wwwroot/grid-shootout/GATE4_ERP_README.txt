RevoGrid Community — ERP Gate 4 — 100,000 rows

Purpose:
Validate ERP-owned behavior on top of RevoGrid Community, not just raw grid speed.

Tests:
1) Manual cell edit + Dirty + Save baseline + Undo/Redo after Save.
2) One ERP history operation containing 5,000 cell deltas.
3) Remaining Amount readonly via real keyboard edit attempt.
4) Delete/Undo/Redo for 1,000 rows.
5) 20 custom-column cycles plus Add/Undo/Redo before Save.
6) 20 Full/Split width changes while Basket selection remains stable.
7) Fresh RTL grid + 100 virtual jumps with Basket selection.
8) Real browser Zoom changes while Basket selection remains stable.

Important:
The Save in this lab is intentionally an in-browser saved baseline. It tests the session History/Dirty contract. SQL persistence is tested only after a real RevoGrid Work Orders integration prototype exists.
