# Phase 8.5-R2 — Save Result Merge

**Apply over:** Phase 8.5-R1 (`ERPPrototype_Phase8_R5_R1_Large_Batch_ReplaceData.zip`)

## What was happening in the sheet

After a full-column Paste, the values were already visible. When Save succeeded, the client received 4,952 saved rows and sent all of them through the visible grid update path again. That second full refresh fatigued vertical navigation until changing year recreated the grid.

## What changes

The Save result is compared with the data already present in each row:

- Technical values not represented as sheet columns, such as the concurrency version, are merged silently into row data.
- A sheet column is refreshed only when the server returned a genuinely different value.
- Sheet fields are discovered from Tabulator columns, including hidden columns, so future custom columns do not require hard-coded names.

## Practical example

An employee pastes Notes into 4,952 work orders and presses Save.

Before R2, the grid refreshed all 4,952 complete rows after the database accepted them.

After R2, if Notes already match the server result, the screen is not repainted. Only the internal version stamp is refreshed. The duplicate identity rule remains off because Work Order Number and Work Type were not edited.

## Apply

Copy the files over the current project, then run:

```powershell
dotnet clean; dotnet build
```

## Test

1. Refresh the page.
2. Paste one full non-identity column across about 4,952 rows.
3. Save once.
4. Test ArrowDown and ArrowUp immediately without changing year.
5. Download the performance report.
6. Confirm `identityCheckRows: 0`.
7. Check `save.delta.plan-mutations` and `save.delta.update-rows`:
   - `updateRows` / `rows` should be near zero when the server did not change sheet values.
   - `technicalFieldWrites` should show the internal values merged without repainting.
8. Refresh and confirm the data persisted.

## Rollback

Restore `wwwroot/js/tabulatorTest.js` and the documentation files from the Phase 8.5-R1 project copy. Do not Commit or Tag before the runtime test passes.

## Verification performed here

- JavaScript syntax check passed for all project-owned JS files.
- Patch file paths and ZIP integrity were checked.
- .NET build and browser execution were not available in this environment.
