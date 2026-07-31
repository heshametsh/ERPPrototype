# 16 — Phase 8.5 Field-Level Changes and Generic Batch Editing

**Status:** Runtime result: architecture PASS, bulk-performance goal NOT accepted; superseded by Phase 8.5-R1 test  
**Apply over:** Phase 8.4 + Phase 8.4-R1

## Problem confirmed by measurement

Pasting one column into 4,952 rows changed 4,952 values, but the old save path treated each affected row as a complete-row change. The page also received thousands of cell-edit events. This produced page fatigue after Paste and previously caused unrelated identity checks during Save.

## What changed

- Added a generic field-definition and batch-change module: `tabulatorFieldChanges.js`.
- Dirty state now records the field keys changed in each row.
- Paste, range clear, Undo, and Redo apply large changes as one batch with redraw blocked.
- Dirty tracking, validation dependencies, and filter refresh run once after the batch.
- Blazor receives `changedFields` with each existing dirty row.
- `WorkOrderService` normalizes, validates, and assigns only the changed fields.
- New rows still validate all required fields.
- The global identity rule runs only for new rows or when an identity field changes.
- Current server field keys and rule dependencies are centralized in `WorkOrderFieldRegistry.cs`.

## Practical examples

### Example 1 — Estimated value column

A future user adds an Estimated Value column and pastes values into 4,952 rows.

Expected logic:

- 4,952 estimated values are saved.
- Work Order Number, Work Type, Notes, Status, Basket, and Assignment Date are not rewritten.
- The global identity rule does not run.

The custom-column feature itself is not implemented yet; Phase 8.5 prepares the generic change pipeline it will use.

### Example 2 — Notes only

The employee pastes Notes into the entire sheet.

Expected logic:

- Notes validation and Notes persistence run.
- Work-order identity validation does not run.
- The row does not move between years.

### Example 3 — Work Type

The employee changes Work Type in one row.

Expected logic:

- The Work Type field is validated.
- The identity rule checks the pair Work Order Number + Work Type for that row.
- A duplicate is blocked.

### Example 4 — Assignment Date

The employee changes Assignment Date into another year.

Expected logic:

- Date validation runs.
- The row moves to the destination year after Save.
- Editing Notes alone never triggers this move logic.

## Documentation rule added

Technical explanations must begin with the real Work Orders situation, explain before/after behaviour, state the exact test, and only then mention internal code when necessary.

## Required test

Run section O in `06_REGRESSION_TEST_CHECKLIST.md`. Do not tag the refactor until full-column Paste, Save, Undo/Redo, duplicate rejection, year move, and Refresh verification all pass.


## Runtime result recorded — 2026-07-31

The first Phase 8.5 test confirmed that field-level tracking worked: the 4,952-cell paste no longer emitted 4,952 `cellEdited` table events, and the identity rule remained out of scope. However, the first bulk application strategy used `updateData` for thousands of rows and regressed the user-visible timings:

- Paste: about 1.01 seconds instead of about 0.63 seconds.
- Undo: about 1.17 seconds instead of about 0.72 seconds.
- ArrowDown p95 in the mixed post-paste session: about 151 ms.

Therefore the Phase 8.5 architecture is retained, but its first large-batch application strategy is rejected. Phase 8.5-R1 replaces only that strategy.
