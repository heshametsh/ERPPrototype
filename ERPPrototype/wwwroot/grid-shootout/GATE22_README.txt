Gate 2.2B — RevoGrid Community filter registration fix

Why:
The standalone RevoGrid bundle does not automatically register the standalone filter panel custom element.
This patch explicitly registers revogr-filter-panel before creating the grid.

Scope:
- Test lab only (wwwroot/grid-shootout).
- No Work Orders runtime changes.
- RevoGrid Community only.

Expected:
The Community filter button should appear in filterable column headers.
