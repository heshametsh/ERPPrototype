STEP 11A — Restore Stable Cell Editing

Purpose
-------
Rollback only the fixed-workspace sizing introduced in Step 11 because it caused
Tabulator to redraw while editing the Work Order Number and Work Type cells.

This restores the last verified grid sizing:
- Tabulator height: 650px
- Normal page layout (no flex/100% height binding)

Files
-----
Components/Pages/TabulatorTest.razor.css
wwwroot/js/tabulatorTest.js

Database
--------
No migration and no database change.

Apply
-----
1. Stop the project.
2. Copy Components and wwwroot into the project root.
3. Replace the two files.
4. Build Solution.
5. Run and press Ctrl+F5.

Test
----
- Double-click Work Order Number and type 9 digits.
- Double-click Work Type and type 3 digits.
- Confirm the editor stays open and the blue selection does not blink.
- Save and refresh to confirm persistence.
