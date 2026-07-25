STEP 12 — WORK-ORDER SHEETS BY DEPARTMENT + YEAR
================================================

PURPOSE
-------
Each logical work-order sheet is now scoped by:

    DepartmentId + WorkYear

The existing company-wide uniqueness rule remains unchanged:

    WorkOrderNumber + WorkTypeCode

FILES CHANGED
-------------
Components/Pages/TabulatorTest.razor
Components/Pages/TabulatorTest.razor.css
Data/ApplicationDbContext.cs
Data/WorkOrderService.cs
wwwroot/js/tabulatorTest.js
Migrations/20260725090000_ScopeWorkOrderDisplayOrderByYear.cs
Migrations/20260725090000_ScopeWorkOrderDisplayOrderByYear.Designer.cs
Migrations/ApplicationDbContextModelSnapshot.cs

IMPLEMENTED BEHAVIOUR
---------------------
1. The current calendar year opens by default.
2. The year selector lists the current year and years already used by the employee's department.
3. Loading is filtered in SQL by DepartmentId + WorkYear.
4. New records are saved into the selected year.
5. Update and delete operations are protected by DepartmentId + WorkYear on the server.
6. DisplayOrder calculation is independent for every department/year sheet.
7. The database index is changed from:
       DepartmentId + DisplayOrder
   to:
       DepartmentId + WorkYear + DisplayOrder
8. Switching year is blocked while there are unsaved changes.
9. Switching year creates a fresh grid session, so Undo/Redo history does not cross between sheets.
10. The stale EF model snapshot was corrected to match the actual current model before adding this migration.

NO CHANGE TO
------------
- Company-wide WorkOrderNumber + WorkTypeCode uniqueness.
- WorkOrder primary key.
- Existing work-order values.
- Assignment-date rules.
- Tabulator editing, copy/paste, filters, validation, or viewport behaviour.

INSTALLATION
------------
1. Stop the project.
2. Copy the patch contents into the project and replace the listed files.
3. Build Solution.
4. Review the included migration.
5. In Package Manager Console run:

       Update-Database

Do not run Add-Migration because the migration is already included.

TESTS
-----
1. Open /tabulator-test and confirm the current year is selected.
2. Confirm only that year's rows are visible.
3. Make an unsaved edit, then try another year. The switch must be blocked.
4. Save or Undo the edit, then switch year. The new sheet must load.
5. Add a row in the selected year, save, refresh, and confirm persistence.
6. Return to the original year and confirm its rows and order are unchanged.
7. Verify Work Order Number + Work Type duplicates are still rejected across the company.

DATABASE CHECK
--------------
The migration only replaces one non-unique performance index. It does not delete or rewrite work-order rows.
