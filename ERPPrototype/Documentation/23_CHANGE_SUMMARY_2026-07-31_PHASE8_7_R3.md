# Phase 8.7-R3 — Browser Dirty-State Module Extraction

**Date:** 2026-07-31
**Base:** `Phase8.7-R2-Stable`
**Status:** Accepted after focused dirty-state and save regression

## What changed?

A new browser module, `wwwroot/js/tabulatorDirtyState.js`, now owns:

- the last server-accepted snapshot of each row;
- dirty row ids;
- exact changed field keys per row;
- ids and row versions of deleted saved rows;
- collecting dirty and deleted rows for Save;
- accepting successful Save rows as the new baseline;
- clearing dirty/deleted state after successful reconciliation.

`tabulatorLifecycle.js` asks the module to create the change-tracking portion of a new grid state. `tabulatorTest.js` still coordinates Save application, but delegates baseline replacement and dirty clearing to the module. All existing public function names remain available on `window.tabulatorTest`.

## Business behaviour

### Edit and partial Undo

If the employee changes Notes and Status in one work order, the row is unsaved with two changed fields. Undoing Status back to the stored value removes only Status from the changed-field list; Notes remains ready to save.

### New row

A newly inserted row has no original database snapshot, so all trackable fields are considered part of its first Save. After Save maps the temporary id to a database id, the server result becomes its new baseline.

### Delete and restore

Deleting a saved work order records its id and row version for the server. Undoing the deletion removes it from the deleted set. Deleting and successfully saving clears the deleted set.

### Full-column Paste

Pasting Notes into thousands of rows still uses one batch/history transaction. Dirty State records Notes as the changed field; it does not activate the global identity query. After Save succeeds, the returned row versions become the baseline and the unsaved count returns to zero.

## Intentionally unchanged

- No change to Tabulator edit, Paste, Undo/Redo, insert, delete, or navigation algorithms.
- No change to Blazor Save request/result files or `WorkOrderService`.
- No change to validation, global uniqueness, permissions, year movement, or database schema.
- No change to Arabic messages or performance operation names.
- No autosave and no Undo persistence after refresh.

## Required test

Run section U of `Documentation/06_REGRESSION_TEST_CHECKLIST.md`, especially partial Undo, new-row first/second Save, delete/restore, moved-year Save, failed duplicate Save, and full-column non-identity Save.
