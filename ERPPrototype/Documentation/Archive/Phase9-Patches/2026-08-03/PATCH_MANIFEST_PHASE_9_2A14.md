# Phase 9.2A14 — Compact Workspace Layout (Candidate)

## Base

Apply this patch over the current Phase 9.2A13-R1 project state.

## Objective

Give vertical space back to the Work Orders sheet without removing the active Basket summary or the fixed financial totals.

## User-visible changes

### Page header

- `Work Orders`, branch/department scope, and `Year` share one horizontal line on wide desktop screens.
- Header spacing and command buttons are slightly tighter without changing their behavior.

### Open-work-order totals

- The four totals remain unchanged in content.
- Their height and internal padding are reduced.

### Active Basket summary

- Only Basket stages containing work orders continue to appear.
- The summary is no longer presented as tall cards.
- Each stage is a thin, Excel-like data row containing:
  - Basket name
  - Work-order count
  - Remaining Amount
- The labels are shown once above the rail instead of being repeated inside every stage.
- Wide screens use four columns, so eight active stages occupy two rows.
- Each stage row is 24 px high to preserve sheet space.
- No horizontal scrolling is introduced.

### Work-order search

- Search remains immediately above the sheet.
- The outer decorative rectangle is removed.
- Only the real input has a border, eliminating the nested-rectangle appearance.
- Input width is increased to 420 px on wide screens.

### Sheet and Selected totals

- The sheet keeps all remaining viewport height.
- The `Selected` totals remain in a separately reserved row below the grid.
- The footer height is reduced from 44 px to 42 px without overlaying the last visible cell.

## Files

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Database

No migration and no database change. Do not run `Update-Database`.

## Verification

Run from the solution folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected automated result:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- Overall: `ERPPrototype automated verification: PASS`

Manual visual acceptance on the user's main screen:

- At least 15 Work Order rows should be visible when the Selected bar is present.
- Search must appear as one bordered input, not two nested rectangles.
- Active Basket rows must remain readable and occupy no more than two short rows for the current eight active stages.
- The last visible grid cell must remain above the separate Selected footer.

## Validation performed before delivery

- CSS brace validation: PASS.
- Required A14 selectors and target sizes: PASS.
- No migration files included.
- Runtime Build/SQL Server/Playwright were not available in the patch environment and must be accepted from the user's machine.

Do not Commit or Tag until automated tests and visual acceptance both pass.
