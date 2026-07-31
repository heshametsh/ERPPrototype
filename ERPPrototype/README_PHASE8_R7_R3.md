# ERPPrototype Phase 8.7-R3 Patch

Apply this cumulative patch **over `Phase8.7-R2-Stable` only**.

## Purpose

Extract browser Dirty State into `wwwroot/js/tabulatorDirtyState.js` without changing employee-visible behaviour. The module owns original snapshots, dirty rows, exact changed fields, deleted saved rows, Save collection, and post-Save baseline acceptance.

## Files to replace/add

- `Components/App.razor`
- `wwwroot/js/tabulatorTest.js`
- `wwwroot/js/tabulatorLifecycle.js`
- `wwwroot/js/tabulatorDirtyState.js` (new)
- documentation files included in the patch

## Practical example

Change Notes and Status in one order, then Undo Status. The unsaved count remains one row, and Save sends only Notes. After Save, the server row version becomes the new baseline and the unsaved count becomes zero.

## Build

```powershell
dotnet clean; dotnet build
```

## Test

Run section U of `Documentation/06_REGRESSION_TEST_CHECKLIST.md`. Do not Commit or Tag until runtime testing passes.

## Rollback

Restore the same files from the `Phase8.7-R2-Stable` checkpoint. No database rollback or migration is required.
