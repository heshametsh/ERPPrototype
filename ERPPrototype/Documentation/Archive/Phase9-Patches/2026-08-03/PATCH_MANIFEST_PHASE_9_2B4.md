# ERP Prototype — Phase 9.2B4 Light Modern Data Grid

## Basis

Install this candidate **after Phase 9.2B3**.

## Purpose

This patch changes only the Work Orders grid and the reserved `Selected` status strip. It does not change the financial cards, Basket summary, year selector, search box, calculations, save logic, filters, sorting, keyboard navigation, or row capacity.

## User-visible changes

- Replaces the heavy dark-navy grid header with a medium blue-grey header and dark text.
- Reduces the visual weight of vertical grid lines.
- Keeps subtle zebra striping for long-row tracking without creating strong blue bands.
- Adds a calm row-hover state.
- Makes row-number cells a quiet positional guide.
- Reduces active-cell selection to a fine 1px outline with almost no fill.
- Keeps edit mode slightly stronger than selection so data entry remains clear.
- Restyles the `Selected` footer as a neutral status strip separated from the table.
- Preserves the same header height, row height, and visible-row capacity.

## Files replaced

- `Components\Pages\WorkOrders.razor.css`
- `wwwroot\app.css`

## Installation

Extract the ZIP into the folder containing `ERPPrototype.csproj` and allow the two files above to be replaced.

No database migration is required. Do **not** run `Update-Database`.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected baseline:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- `ERPPrototype automated verification: PASS`

Manual visual checks:

1. The header is clear but no longer the darkest/dominant element on the page.
2. Even and odd rows are distinguishable only subtly.
3. Long rows are easy to track horizontally.
4. Active-cell selection is thin and light.
5. Edit mode remains clearly distinguishable from selection.
6. The `Selected` strip is separate from the last grid row.
7. At least 15 rows remain visible at the normal test viewport.

Do not commit or tag until automated tests pass and the real browser screenshot is accepted.
