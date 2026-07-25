Step 10L - Simple validation current-error marker

This patch intentionally stops trying to move Tabulator's native blue range selection.

New behavior:
- User spreadsheet selection remains independent.
- Previous/Next only scrolls to the validation error.
- The current validation error gets a strong amber/yellow marker with a dark outline.
- Other validation errors remain red.
- No range is created, moved, removed, or focused by validation navigation.

Files:
- Components/Pages/TabulatorTest.razor.css
- wwwroot/js/tabulatorTest.js

No database migration.

Test:
1. Open sheet and select any normal cell.
2. Create at least three validation errors.
3. Use Next/Previous.
4. Confirm the amber marker moves between errors.
5. Confirm the normal blue selection is not modified by validation navigation.
6. Correct the active error and confirm the marker moves/updates with remaining errors.
