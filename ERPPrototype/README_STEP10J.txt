STEP 10J - Validation navigation without range-selection conflicts

Files:
- wwwroot/js/tabulatorTest.js
- Components/Pages/TabulatorTest.razor.css

What changed:
1. Previous/Next no longer moves or creates Tabulator native ranges.
2. Any old spreadsheet selection is cleared when validation navigation starts.
3. The current validation error gets one dedicated blue marker.
4. Other invalid cells remain red.
5. The marker is driven by validation state, so virtual rendering cannot leave old blue cells behind.
6. Normal manual range selection remains available for copy/paste after the user selects cells again.

No database migration is required.
