STEP 10I — Native Selection Movement + Filter Icon Toggle

Changed files:
- wwwroot/js/tabulatorTest.js
- wwwroot/js/tabulatorFilters.js
- Components/Pages/TabulatorTest.razor.css

What changed:
1. Previous/Next now moves Tabulator's native single-cell range selection.
2. The previously selected blue cell is cleared by Tabulator itself.
3. The table starts with no default selected cell using selectableRangeInitializeDefault:false.
4. The custom blue validation CSS layer was removed to avoid two competing selection systems.
5. Clicking the same filter icon again closes its open popup.
6. Clicking another filter icon closes the previous popup and opens only the new one.
7. Apply/Clear continue to close their popup normally.
8. Open filter popup state is cleaned up when leaving/destroying the page.

No database migration is required.

Verification performed before delivery:
- JavaScript syntax check: passed for both JS files.
- Browser test: initial ranges = 0.
- Browser test: selection moved from a normal cell to error 1, then error 2, with one range only.
- Browser test: same filter icon toggled popup from open to closed.
- Browser test: switching filter icons left one popup only.

Required local verification:
- Build Solution.
- Open sheet: no automatic blue cell.
- Select a normal cell, then Previous/Next: blue selection moves to the current error only.
- Click one filter icon twice: open then close.
- Open one filter, then another: first closes and only second stays open.
