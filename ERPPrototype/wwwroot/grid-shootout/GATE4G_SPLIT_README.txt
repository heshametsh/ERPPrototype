RevoGrid Community — Gate 4G — Split Focused

Purpose:
- Do NOT repeat Gate 4F tests 1-5; they already passed.
- Isolate the Split/Full selection issue at 100,000 rows with ERP Custom present.

Phase 1 — Native:
- User selects Basket.
- User presses Split/Full.
- Page only observes getSelectedRange at 0, 150, 500, and 1000 ms.
- No repair is performed.

Phase 2 — ERP Preserve (only if Native fails):
- User selects Basket again.
- User presses Split/Full.
- The ERP captures the public selected range before resize and reapplies it with
  setCellsFocus after layout settles.
- Page verifies persistence again up to 1000 ms.

No Work Orders production files are modified.
