# Phase 9.2B6 — Targeted Compact Polish

Apply this cumulative patch over the currently tested **Phase 9.2B5** files.

## Changes

- Reduced the height and internal padding of the four top KPI summaries while keeping their values readable.
- Removed the blue inset accent from the Basket group header rows.
- Changed selected cells to a light visible fill without the heavy outline or selection handle.
- Removed the full-width tinted Search toolbar surface so the Work Order search input appears as a standalone control.
- No business logic, calculations, database schema, grid row height, filtering, saving, or Basket distribution changes.

## Files replaced

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Installation

Extract the ZIP into the folder that contains `ERPPrototype.csproj`, allowing the two files above to be replaced.

Do **not** run `Update-Database`.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected baseline:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS

Visual checks:

- KPI row is shorter.
- Basket header has no blue selected-like top line.
- Selected cell uses only a light visible fill.
- Search input stands alone without a shaded strip extending across the grid.
