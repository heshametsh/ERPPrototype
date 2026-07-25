STEP 14 — DELTA SAVE WITHOUT FULL SHEET RELOAD

Purpose
-------
After a successful Save, update only the affected rows in the open Tabulator sheet.
Do not query and reload every work order in the department/year.

Files
-----
Components/Pages/TabulatorTest.razor
Data/WorkOrderService.cs
wwwroot/js/tabulatorTest.js

Database
--------
No migration.
Do not run Add-Migration or Update-Database.

What changed
------------
1. WorkOrderService returns the final database values only for inserted/updated rows,
   including Id, WorkYear, DisplayOrder, and the new RowVersion.
2. Deleted IDs are returned with the save result.
3. The Blazor page builds a small save delta instead of calling LoadSheetAsync again.
4. Tabulator applies update/add/delete operations only to affected rows.
5. New temporary IDs are replaced with SQL IDs without replacing all table data.
6. Rows moved to another work year disappear from the current sheet immediately.
7. Undo/Redo history is rebased using the existing ClientKey mechanism.

Required verification
---------------------
A. Normal update
- Edit one existing row and save.
- Confirm the row stays in place and the unsaved count returns to zero.
- Refresh and confirm persistence.

B. New row
- Add a row in the current year and save.
- Confirm it stays in the same visual position.
- Edit it again and save to prove the SQL Id and RowVersion were applied.

C. Delete
- Delete one existing row and save.
- Confirm only that row disappears.
- Refresh and confirm it remains deleted.

D. Move to another year
- Change Assignment Date to another year and save.
- Confirm the row disappears from the current sheet.
- Open the destination year and confirm it exists there.

E. Mixed save
- In one Save: update one row, add one row, delete one row, and move one row.
- Confirm all four operations complete correctly.

F. Concurrency
- Open the same row in two tabs.
- Save Tab A, then save stale Tab B.
- Confirm Tab B is rejected by RowVersion protection.

G. Undo/Redo after Save
- Edit and save a row.
- Use Undo, confirm the row becomes unsaved again.
- Use Redo and save again.

Local preparation checks performed
----------------------------------
- JavaScript syntax: passed (node --check).
- Delta tests: update + insert + delete passed.
- Delta test: rows moved out of the current year passed.
- C# build was not run because the preparation environment has no .NET SDK.
