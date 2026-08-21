YEAR SELECTOR EXPLICIT FINAL LAB

Route:
  /year-selector-isolation-lab

This CLEAN diagnostic replacement tests only the one implementation that
visually survived the previous isolated test:

  <option selected="@(year == SelectedYear)">

No RevoGrid.
No SQL.
No WorkOrderService.
No Work Orders changes.

Automatic startup reproduction:
  1. current year only
  2. async expansion to next/current/previous/two-years-ago
  3. fixed JS inspection with no arguments passed from Blazor

Then test manually:
  previous year -> current year -> next year -> current year -> Refresh

PASS means browser DOM value equals the C# SelectedYear.
After Refresh the selected year must be the current Saudi business year.
