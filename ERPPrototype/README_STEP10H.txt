STEP 10H - REVIEWED GRID SELECTION, FILTER POPUPS, AND PAGE CLEANUP

Purpose
-------
This patch fixes interacting selection and popup problems after reviewing the
whole uploaded ERPPrototype(5) project, not only the visible symptoms.

Root causes found
-----------------
1. Tabulator was allowed to create a default range at [0,0], so the first cell
   appeared selected as soon as the page opened.
2. Validation navigation removed ranges manually. Tabulator creates a new
   empty active range after the last range is removed, so the custom cleanup
   fought Tabulator's internal range manager.
3. Validation navigation also painted a second CSS-only blue selection. The
   native Tabulator range and the custom class could remain on different cells.
4. Filter-icon click propagation was blocked, preventing Tabulator's popup
   blur/close behavior from seeing the next filter click.
5. Filter close used synthetic body events and direct popup DOM removal, which
   could leave Tabulator's popup instance out of sync.
6. The Blazor page did not destroy the JavaScript table/listeners when leaving
   the route, so repeated navigation could accumulate document handlers.
7. The scoped CSS contained duplicate filter-button rules.

Changes
-------
- Added selectableRangeInitializeDefault: false.
- Validation Previous/Next now moves one native Tabulator range with setBounds.
- Removed the competing uds-validation-current-cell selection system.
- The current range uses one clear blue border; all invalid cells remain red.
- Filter icons block only pointer/mousedown range starts, not normal click.
- Added a single-popup coordinator: opening a filter closes the previous popup.
- Apply/Clear closes through Tabulator's popup instance instead of synthetic
  body events and manual DOM removal.
- TabulatorTest.razor now implements IAsyncDisposable and calls
  tabulatorTest.destroy when the page is left.
- Removed duplicate scoped filter-button CSS.

No database changes
-------------------
Do not run Add-Migration or Update-Database for this patch.

Required verification
---------------------
1. Build Solution.
2. Open the sheet: no cell should be blue automatically.
3. Create several validation errors and use Previous/Next:
   exactly one cell is blue at a time; other invalid cells stay red.
4. Manual click/drag range selection still works.
5. Open Work Type filter, then Assignment Date filter:
   the first popup closes and only one popup remains.
6. Apply and Clear Filter both close the popup.
7. Navigate away from /tabulator-test and return twice:
   shortcuts, paste, selection, and popups must run once only.
8. Save and refresh to confirm existing behavior is unchanged.
