STEP 11B — Sticky Work Order Controls (Stable Editing)

Files:
- Components/Pages/TabulatorTest.razor
- Components/Pages/TabulatorTest.razor.css

Purpose:
- Keep the page title, commands, status, instructions, validation message, and search visible below the 72px global navbar.
- Preserve Tabulator's fixed 650px height and stable cell editing.
- No JavaScript changes.
- No database migration.

Test:
1. Build the solution.
2. Hard refresh with Ctrl+F5.
3. Edit Work Order Number and Work Type; editors must stay stable.
4. Scroll the browser outside the grid; the control area must remain visible.
5. Scroll inside the grid; only grid rows move.
6. Test filter popups and Save.
