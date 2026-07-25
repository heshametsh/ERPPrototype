STEP 10K - Native validation error selection

Files changed:
- wwwroot/js/tabulatorTest.js
- Components/Pages/TabulatorTest.razor.css

Actual root cause found in the bundled Tabulator 6.5 code:
1. range.remove() cannot leave the table with zero ranges after a range has existed.
   Removing the last range immediately creates a replacement range, so the old
   blue spreadsheet selection remained visible.
2. The red validation CSS used !important and visually covered the native blue
   range when it reached an invalid cell.

Fix:
- Previous/Next now uses table.addRange(errorCell, errorCell).
- Because selectableRange is 1, Tabulator replaces the old range with the new
  error cell, so only one native blue selection exists.
- The custom second blue marker was removed.
- A CSS rule after the red error rule makes the selected invalid cell blue,
  while all other invalid cells remain red.

No database or migration changes.

Test:
1. Open the sheet; no selection should exist initially.
2. Select any normal cell.
3. Create at least three invalid cells.
4. Press Next repeatedly: the one native blue selection must move each time.
5. The previous error must return to red.
6. Press Previous and verify the reverse order.
7. Normal drag selection, copy, and paste must still work.
