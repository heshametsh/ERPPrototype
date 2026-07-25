STEP 11 — Fixed Work-Order Workspace

Purpose
-------
Keep the Work Orders title, action buttons, status, instruction bar, search box,
and validation message visible while the user scrolls only inside the grid.

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
2. Copy Components and wwwroot into the project root and replace the two files.
3. Build Solution.
4. Run the page and press Ctrl+F5.

Expected result
---------------
- The browser page itself does not scroll on normal desktop screens.
- The header/actions/instructions/search stay visible.
- The Tabulator card fills the remaining viewport height.
- Only the grid body scrolls vertically.
- On narrow or very short screens, normal page scrolling is restored.
