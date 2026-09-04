# 47 — Gate 5B-10 Header Selection Acceptance — 2026-08-30

**Status:** Accepted
**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**Starting checkpoint:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4` / Gate 5B-9
**Route:** `/work-orders-revogrid-gate5b10`
**Grid:** RevoGrid Community 4.25.2 target

## 1. User-visible result

Gate 5B-10 adds whole-row and whole-column selection without turning ERP code into a second spreadsheet engine.

Employee behavior:

- plain Row Header / Column Header click selects that whole row/column.
- Ctrl/Cmd adds or removes non-adjacent rows/columns.
- Shift selects the contiguous row/column span from the anchor.
- Sort keeps the same Work Order selected by `ClientKey` even when its visible position changes.
- Filter removes a selected Work Order when that row leaves the current result; clearing the Filter does not silently reselect it.
- Scroll/virtualization does not remove selection and selection repaints when the target returns to the viewport.
- right-click inside selection preserves it.
- year/dataset switch clears semantic selection.
- disjoint Ctrl multi-cell ranges are not included.

## 2. Accepted architecture

> Revo owns grid mechanics; ERP adds only missing semantic whole-row/whole-column meaning.

- Revo owns native active cell/range, focus, keyboard/editing and virtualization.
- B10 registers `RevoGridHeaderSelectionPlugin` through `grid.plugins`.
- row semantic identity uses `ClientKey`; column semantic identity uses column `prop`.
- Row Header pointer handling is supplied through `rowHeaders.cellProperties`.
- Column Header handling uses Revo `beforeheaderclick`.
- active contiguous row/column selection is synchronized into Revo through public `setCellsFocus(...)`.
- ERP semantic state does not duplicate a complete multi-cell range engine.
- selected cell/header presentation is produced through Revo render properties, not a DOM-scanning repaint loop.
- changed column headers use public `updateColumns(...)`; the implementation must not replace the whole `grid.columns` collection merely to force repaint.
- Revo source is not modified.
- the accepted B10 path does not introduce a new dependency on Revo private selection stores.

## 3. Filter/Sort/History boundary

- Filter defines current-view membership for new row targeting and prunes semantic row selection.
- Sort changes position only; identity selection remains keyed by `ClientKey`.
- Scroll changes viewport only.
- dirty data changed while visible is not invalidated merely because a later Filter hides the row.
- Undo/Redo continues the original logical History operation.
- destructive/mutating commands must still perform their own current-view safety checks at execution time; selection state is not authorization.

## 4. Automated evidence

Final accepted run:

- Build: PASS.
- Gate 5B-9 Structure Workspace real-browser regression: PASS.
- Gate 5B-10 Header Selection real-browser journey: PASS.

Gate 5B-10 journey passed:

1. native Revo cell focus/range.
2. visible Plain/Ctrl/Shift rows.
3. row right-click preservation.
4. selected `ClientKey` survives Sort position changes.
5. Filter prunes row selection and does not restore it.
6. row selection repaints after virtualization.
7. visible Plain/Ctrl/Shift columns.
8. column right-click preservation.
9. dataset/year switch clears semantic selection.

Failure investigations during qualification also caught and removed:

- test races that observed Sort or dataset-switch intermediate states.
- an unsafe whole-column repaint approach that reassigned `grid.columns` and could disturb RTL logical/display ordering; accepted implementation uses `updateColumns(...)`.
- earlier design attempts that relied too heavily on selection-store/DOM workarounds were not accepted.

## 5. Manual evidence

User manually verified the accepted candidate in the browser on 2026-08-30:

- Row Ctrl/Shift.
- Column Ctrl/Shift.
- Sort.
- Filter remove/no-auto-return.
- Scroll and repaint.
- right-click inside/outside selection.
- RTL header/data alignment.

Result: PASS.

## 6. Regression boundary

Gate 5B-9 remains mandatory regression evidence with Gate 5B-10.

B10 must not regress:

- Structure Workspace.
- Selection-scoped row delete/current filtered row safety.
- Custom Column insert/delete History.
- range-fill Paste.
- ordinary Revo cell range/focus/edit behavior.

## 7. Next bounded mission

Gate 5B-10 is closed unless new regression evidence requires change.

Next:

1. snapshot-safe Save handshake.
2. real DB Save.
3. end-to-end `RowVersion` concurrency and edit-during-Save behavior.
4. server validation/failure mapping.
5. database-connected Custom Column/layout persistence.
6. reconnect/recovery and production qualification.
