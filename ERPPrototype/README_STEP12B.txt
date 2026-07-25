STEP 12B — AUTOMATIC WORK-YEAR DISTRIBUTION

Approved business rule
----------------------
1. A work order with Assignment Date is stored in the sheet matching the date year.
2. A work order without Assignment Date stays in the sheet where it was entered.
3. If a date is added or changed later, the work order moves automatically to that date year on Save.
4. If an existing date is deleted, the work order stays in its current sheet year.
5. No confirmation dialog is shown for each row.

Files
-----
Components/Pages/TabulatorTest.razor
Data/WorkOrderService.cs
Migrations/20260725103000_AlignWorkOrderYearWithAssignmentDate.cs
Migrations/20260725103000_AlignWorkOrderYearWithAssignmentDate.Designer.cs
README_STEP12B.txt

Database migration
------------------
The migration corrects already-saved records whose WorkYear does not match a non-null AssignmentDate.
Rows without AssignmentDate are not changed.
No schema is added or removed.

Execution
---------
1. Stop the project.
2. Copy the patch into the project and replace the files.
3. Build Solution.
4. Do NOT run Add-Migration.
5. Run Update-Database in Package Manager Console.
6. Start the app and press Ctrl+F5.

Required tests
--------------
A. Open 2026 and enter/paste four rows:
   - Assignment Date in 2024
   - Assignment Date in 2025
   - Assignment Date in 2026
   - No Assignment Date
   Save once.

Expected:
   - 2024 row appears in 2024.
   - 2025 row appears in 2025.
   - 2026 row stays in 2026.
   - undated row stays in 2026.
   - status shows how many rows were distributed.

B. In 2025, delete Assignment Date from an existing row and Save.
Expected: the row remains in 2025.

C. In 2025, change Assignment Date to a 2024 date and Save.
Expected: the row moves to 2024.

D. Verify the old rows that were already saved with 2025 dates now appear in 2025 after Update-Database.

No JavaScript or CSS is changed in this patch.
