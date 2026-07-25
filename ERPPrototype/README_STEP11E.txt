STEP 11E — Responsive grid-only scrolling on desktop

Files:
- Components/Pages/TabulatorTest.razor.css
- wwwroot/js/tabulatorTest.js

Purpose:
- Keep the browser scrollbar disabled when a desktop window is narrowed.
- Keep only the Tabulator internal scrollbar.
- Prevent focusing a cell from scrolling the document and hiding the controls.
- Preserve normal document scrolling on touch/mobile devices.
- Includes the Enter-stays-in-cell behavior from Step 11D.

No database migration.

Test:
1. Open the work-order page at normal width.
2. Narrow the desktop browser window below 800px.
3. Confirm the outer browser scrollbar does not return.
4. Click/edit Work Order Number, Work Type, Basket, Status, and Notes.
5. Confirm the page remains at the top and the controls stay visible.
6. Confirm the grid's internal scrollbar still works.
7. Open another page and confirm normal scrolling is restored.
