RevoGrid Community — Gate 4J — Zoom Preserve Focused

What is already proven and NOT repeated:
- 100,000-row core Gate
- RTL + Scroll stability
- Native Split/Full stability
- ERP Edit/Dirty/Save/Undo/Redo
- 5,000-value paste + Undo/Redo
- Readonly
- Delete/Undo/Redo 1,000 rows
- Custom Columns + Undo/Redo

Known result from Gate 4I:
- Native browser Zoom to 90% clears RevoGrid selection (getSelectedRange() -> null).

This gate tests only the practical ERP mitigation:
1) User sets browser Zoom to 100% and explicitly captures the baseline.
2) User selects Basket once; the logical range is cached.
3) User changes browser Zoom manually: 90 -> 80 -> 67 -> 100.
4) After each resize settles, ERP re-applies the cached logical range once via
   the public setCellsFocus API.
5) The page verifies immediately, after 250 ms, and after 750 ms.

No Work Orders production files are modified.
