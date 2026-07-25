ERP Prototype — Step 13
Optimistic concurrency protection for Work Orders using SQL Server RowVersion

Purpose
-------
Prevent one browser session from silently overwriting a newer save made by another session.

Files changed
-------------
Data/Entities/WorkOrder.cs
Data/ApplicationDbContext.cs
Data/WorkOrderService.cs
Components/Pages/TabulatorTest.razor
wwwroot/js/tabulatorTest.js
Migrations/ApplicationDbContextModelSnapshot.cs
Migrations/20260725190000_AddWorkOrderRowVersion.cs
Migrations/20260725190000_AddWorkOrderRowVersion.Designer.cs

Database change
---------------
Adds one SQL Server rowversion column:
WorkOrders.RowVersion rowversion NOT NULL

Execution
---------
1. Stop the project.
2. Copy this patch into the project root and replace the files.
3. Build Solution.
4. Do NOT run Add-Migration. The migration is included.
5. Run in Package Manager Console:
   Update-Database
6. Start the project and hard refresh the browser with Ctrl+F5.

Normal-save test
----------------
1. Edit one existing row.
2. Save.
3. Refresh.
4. Confirm the value persisted.
5. Add and delete test rows and confirm both still work.

Two-tab concurrency test
------------------------
1. Open the same year and same work-order row in Tab A and Tab B.
2. In Tab A, change Notes and Save.
3. Without refreshing Tab B, change Basket or Status in the same row and Save.
4. Tab B must reject the save with an Arabic concurrency message.
5. The newer value saved by Tab A must remain in SQL Server.
6. Refresh Tab B, repeat the edit, and Save. It should then succeed.

Delete concurrency test
-----------------------
1. Open the same row in Tab A and Tab B.
2. In Tab A, edit the row and Save.
3. Without refreshing Tab B, delete that row and Save.
4. The delete must be rejected.

Notes
-----
- No silent overwrite is allowed.
- The browser carries RowVersion as an internal Base64 value; it is not displayed as a column.
- Undo/Redo history is rebased after save so it keeps the newest RowVersion.
- Project documentation should be updated only after Build, migration, and browser tests pass.
