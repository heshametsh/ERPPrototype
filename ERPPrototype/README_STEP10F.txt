STEP 10F — Active validation error selection

Changed file:
- Components/Pages/TabulatorTest.razor.css

Behavior:
- All invalid cells remain red.
- Previous/Next moves the normal blue selection to the active error cell.
- The active error uses a strong blue border and light blue background.
- The red corner marker remains visible so the cell is still clearly invalid.
- No database migration is required.
