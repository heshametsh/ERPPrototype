# 09 — Maintainability Refactor Roadmap

**Runtime baseline:** Phase 8.6-R1 accepted after user regression on 2026-07-31. Field-level tracking, batch editing, save-result merge, and single grid lifecycle ownership are the current stable behavior.  
**Refactor policy:** incremental extraction, identical runtime behaviour, focused regression after every step, and no rewrite.

## Refactor Objectives

1. Keep the Work Orders page easy to review and change.
2. Give every file one clear responsibility.
3. Reduce duplicated structural, history, validation, and save logic.
4. Keep one owner for shared grid state and lifecycle.
5. Preserve the verified Excel-like behaviour and performance improvements.
6. Make future permissions, import/export, warehouse, and invoice work safer.

## Phase 8.1 — Razor / C# Code-Behind Split — COMPLETED

- `WorkOrders.razor` owns markup, bindings, and browser actions.
- `WorkOrders.razor.cs` owns component lifecycle, loading, saving, year switching,
  mapping, DTOs, and disposal.
- No business rule, SQL, JavaScript, permission, or user-interface behaviour was
  intentionally changed.

Structural result:

- `WorkOrders.razor`: about 208 lines instead of about 1,456.
- `WorkOrders.razor.cs`: about 1,260 lines of C# component logic.

## Phase 8.2 — Validation JavaScript Module — COMPLETED

`tabulatorValidation.js` owns:

- Work-order number, work-type, and assignment-date normalization.
- Blank-row and identity-key validation helpers.
- Duplicate indexes and row/cell validation errors.
- Error navigation and pre-save validation.
- Server validation mapping and custom editors.

Structural result:

- `tabulatorTest.js`: about 7,368 lines instead of about 9,462.
- `tabulatorValidation.js`: about 2,139 lines.

## Phase 8.3 — Clipboard and History Module — COMPLETED

`tabulatorClipboardHistory.js` owns:

- Range copy and browser clipboard writing.
- Clipboard parsing, target construction, paste, and range clear.
- Cell-edit and filter transactions.
- Undo/Redo orchestration for cells, filters, and structural transactions.
- Transaction focus restoration and the public `copyRange` facade.

Structural result:

- `tabulatorTest.js`: about 5,836 lines.
- `tabulatorClipboardHistory.js`: about 1,545 lines.
- The existing public API and performance operation names remain unchanged.

## Phase 8.4 — Structural Rows Module — COMPLETED

`tabulatorStructure.js` owns:

- Row context-menu and insert-dialog UI.
- Display-order allocation and rebalance.
- Blank-row construction and selected-row resolution.
- Incremental and bulk insert/delete paths.
- The verified replace-data paths for large delete, Undo, and Redo.
- Structural transaction creation, restoration, and application.
- Bulk-operation pointer locking and browser yielding.

`tabulatorTest.js` remains the central owner of:

- Table/state instances and lifecycle.
- Grid initialization, navigation, viewport handling, and teardown.
- Shared row identity cloning and performance-stage helpers.
- Dirty tracking, save delta, streamed save, and save reconciliation.
- Public state/status calls used by Razor and the extracted modules.

Structural result:

- `tabulatorTest.js`: about 3,526 lines instead of about 5,836.
- `tabulatorStructure.js`: about 2,323 lines.
- `tabulatorValidation.js`: remains about 2,139 lines.
- `tabulatorClipboardHistory.js`: remains about 1,545 lines.
- `tabulatorStructure.js` loads before Clipboard/History so structural Undo/Redo
  delegates to a registered implementation without circular ownership.

## Phase 8.5 — Field-Level Changes and Generic Batch Editing — COMPLETED

- Add `tabulatorFieldChanges.js` as the generic field metadata and batch-change engine.
- Record changed field keys per dirty row.
- Apply Paste, range clear, Undo, and Redo with redraw blocked and one post-processing pass.
- Validate only fields and rules affected by the change.
- Send changed field keys to Blazor and update only those fields in `WorkOrderService`.
- Keep all-fields validation for new rows.
- Centralize current server field keys in `WorkOrderFieldRegistry.cs`.
- Prepare the contract for future user-created columns without implementing their storage/UI yet.

## Planned Following Phases

### Phase 8.6 — Grid Lifecycle and Interaction Review

**R1 completed and user-tested:** `tabulatorLifecycle.js` owns one grid instance from state creation through disposal. Repeated year switching kept one initialization per opened sheet, stable navigation, and no duplicate action.

**R2 pending focused regression:** `tabulatorInteractions.js` now owns the binding of resize, right-click guard, cell edit/selection events, active-sheet pointer tracking, keyboard commands, and document Copy/Paste.

`tabulatorTest.js` remains the coordinator and retains the actual algorithms. R2 changes ownership location only; it does not change shortcut or grid behavior.

Practical example: changing from year 2026 to 2025 disconnects the old sheet through Lifecycle, then Interactions binds exactly one command route for the new sheet.

### Phase 8.7 — Save and Dirty-State Review

- Review save-delta creation, streamed interop, deleted rows, rekey reconciliation,
  and history rebasing.
- Keep server DTO contracts and persistence behaviour unchanged during extraction.

### Phase 8.8 — WorkOrderService Split

- Separate read/query responsibilities from save/validation responsibilities.
- Preserve transaction boundaries, uniqueness rules, role scope, and measured
  query behaviour.

### Phase 8.9 — Final Consolidation

- Remove obsolete comments and dead experimental paths proven unused.
- Run the full Work Orders regression checklist.
- Compare key performance scenarios with the verified Phase 7 baseline.
- Create the stable Git checkpoint only after all tests pass.

## Rules for Every Refactor Patch

1. One responsibility boundary per patch.
2. No business-rule or user-interface change unless separately approved.
3. No new framework and no rewrite.
4. Preserve existing public calls until final consolidation.
5. Run syntax/build checks plus focused regression before continuing.
6. Roll back immediately if behaviour differs and isolate the cause.

## Current Focused Regression for Phase 8.4

1. Load the current-year sheet and change year once.
2. Open the row context menu from a cell and close it normally.
3. Insert one row above and below the current selection.
4. Insert a large block such as 1,000 rows, then Undo and Redo.
5. Delete a small selection, then Undo and Redo.
6. Delete at least 500 rows to activate the bulk replace-data path, then Undo and
   Redo.
7. Confirm row positions and values are restored after Undo.
8. Save a safe structural change, refresh, and confirm persistence.
9. Confirm Copy/Paste and validation still work after structural operations.
10. Confirm no `tabulatorStructure` load/registration error or unexpected
    JavaScript error appears in the console.


## Current Focused Regression for Phase 8.5

Use section O in `06_REGRESSION_TEST_CHECKLIST.md`. Do not continue refactoring or create a Git tag until full-column Paste, Save, Undo/Redo, identity-change rejection, and refresh verification pass.

## Phase 8.5-R2 Focus

Keep the business result of field-level tracking, but stop treating every saved row as a visible row refresh. When the employee saves a full Notes column, the screen already contains those Notes values. Save should merge the internal server version silently and refresh a visible cell only when the server actually changed its displayed value.

Acceptance: after a 4,952-row Paste and Save, arrows remain usable without changing year, and `save.delta.update-rows` should report near-zero rows when the server returned no different sheet values.


## Phase 8.6-R1 Result

Section Q passed in user testing. Six grid initializations matched six opened sheets across year changes, navigation stayed below the regression threshold, and Copy/Paste, right-click, wheel, structure operations, and Save remained functional.

## Current Focused Regression for Phase 8.6-R2

Use section R in `06_REGRESSION_TEST_CHECKLIST.md`. The required evidence is one action per key/pointer/clipboard event before and after repeated year switches, preserved quick/text edit modes, deep-row Resize stability, and no `tabulatorInteractions` or red Console error.
