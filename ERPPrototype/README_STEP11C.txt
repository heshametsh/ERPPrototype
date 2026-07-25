STEP 11C — One Scrollbar (Grid Only)

Decision:
- Remove the browser/page vertical scrollbar on desktop.
- Keep only Tabulator's internal vertical scrollbar.
- Do not use height: 100%.
- Calculate a stable numeric table height from the available viewport.

Files:
- Components/Pages/TabulatorTest.razor.css
- wwwroot/js/tabulatorTest.js

No database migration.

Verification:
1. Build Solution.
2. Ctrl+F5.
3. Confirm the far-right browser scrollbar is gone.
4. Confirm the grid scrollbar still works.
5. Edit row 1 Work Order Number and Work Type slowly.
6. Confirm the page does not jump and row 1 stays visible.
7. Confirm editor focus and blue selection stay stable.
8. Leave the page and confirm scrolling works normally on other pages.
9. Resize the browser once and confirm the grid fits the new viewport.
