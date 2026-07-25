STEP 10G — Selection behavior fixes

Changes:
1. Validation Previous/Next no longer creates a real Tabulator range.
   Only the current validation error receives the custom blue highlight.
   Previous errors remain red and old blue highlights are cleared.
2. The sheet clears any unintended initial range after it is built.
3. Clicking a column filter icon no longer bubbles to the column header,
   so opening a filter does not select the whole column.
4. Normal user range selection inside the grid remains available.

Files:
- Components/Pages/TabulatorTest.razor.css
- wwwroot/js/tabulatorTest.js

No database migration is required.
