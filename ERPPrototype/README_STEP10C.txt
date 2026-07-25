STEP 10C — CENTRAL GRID VALIDATION MANAGER
==========================================

Purpose
-------
Create one consistent validation system for all current and future sheet errors,
not only Work Order Number / Work Type errors.

Files changed
-------------
Components/Pages/TabulatorTest.razor
Components/Pages/TabulatorTest.razor.css
Data/WorkOrderService.cs
wwwroot/js/tabulatorTest.js

Database
--------
No migration is required.
Do NOT run Add-Migration or Update-Database for this step.

Implemented behavior
--------------------
1. Every cell-addressable error is highlighted in red.
2. The row-number cell receives a red error marker.
3. A validation navigator appears above the grid:
   - total error count
   - current error position (1 of N)
   - Previous / Next buttons
   - clear row, field, and error message
4. Bulk paste automatically moves to the first invalid cell.
5. Previous / Next cycles through errors from top to bottom, then left to right.
6. Fixing a value removes its error immediately and updates the count.
7. Save is stopped before contacting the server while blocking errors exist.
8. Current rules connected to the manager:
   - Work Order Number: required, exactly 9 ASCII digits
   - Work Type: required, exactly 3 ASCII digits
   - Assignment Date: valid DD/MM/YYYY when entered
   - Basket: required and must be from the approved list
   - Status: maximum 150 characters
   - Notes: maximum 1000 characters
   - duplicate Work Order Number + Work Type inside the current sheet
9. Company-wide duplicate errors returned by the server are mapped back to the
   Work Order Number and Work Type cells and added to the same navigator.
10. The JavaScript API applyExternalValidationErrors(...) is ready for future
    warehouse locks, permissions, concurrency, and other server-side rules.

Verification already performed before delivery
----------------------------------------------
- JavaScript syntax: node --check passed.
- Pure validation rules: passed.
- Multiple errors + duplicate identity ordering: passed.
- C# build could not be run in the preparation environment because dotnet is
  unavailable. Build and browser behavior must be verified in Visual Studio.

Required user test
------------------
1. Build Solution.
2. Paste at least 5 rows containing:
   - one 7-digit Work Order Number
   - one 2-digit Work Type
   - one invalid date such as 31/02/2026
3. Confirm:
   - all invalid cells are red
   - each affected row number has a red marker
   - the sheet jumps to the first error
   - the navigator shows the correct total and 1 of N
4. Press Next and Previous until all errors are visited.
5. Correct errors one by one and confirm the count decreases immediately.
6. While an error remains, press Save and confirm no save request starts and the
   sheet jumps to the first remaining error.
7. Correct all errors, save, refresh, and confirm the data remains.
8. Create a duplicate Work Order Number + Work Type in the current sheet and
   confirm both identity cells are marked.
9. Try a duplicate already stored in the company database and confirm the server
   error returns to the relevant cells.
10. Test Undo / Redo after creating and fixing errors.

After all tests pass
--------------------
git add .
git commit -m "Add central sheet validation and error navigation"
git status
