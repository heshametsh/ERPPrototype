# Phase 9.2A13 — Unified Work Orders Workspace (Candidate)

## Base

Apply over the current Phase 9.2A12 project state.

## Goal

Replace the accumulated experimental visual overrides with one coherent final refinement layer while preserving the approved business behavior.

The design keeps the Work Orders grid as the primary workspace and makes the upper information area readable without excessive height.

## Visible changes

### Page header and commands

- Tighter page padding and vertical spacing.
- Smaller, consistently sized action buttons.
- `Save` remains the primary action.
- Year and page context remain visible beside the title.

### Open-work-order summary

The existing four metrics remain unchanged:

- Open Work Orders
- Work Order Value
- Partial Amount
- Remaining Amount

They are presented as compact flat KPI tiles with subtle individual accents and clearer numeric hierarchy.

### Active Basket summary

- Only Basket stages containing work orders remain visible, using the existing Phase 9.2A10 logic.
- Wide desktop layout uses four equal columns; eight active stages normally produce two rows.
- Each stage is one compact horizontal row, not a large card:
  - Basket name
  - order count with `أمر`
  - full Remaining Amount with `متبقي`
- No horizontal scrolling.
- Responsive layout uses three, two, or one column on narrower screens.

### Search

- Remains immediately above the sheet.
- Increased to a clear 390px input on wide screens.
- Keeps the existing search behavior and stable test hook.

### Grid

- Slightly reduced header and row heights to show more work orders without making text difficult to read.
- Softer Slate/Blue borders and alternating rows.
- Existing keyboard navigation, selection, editing, filters, and financial sorting remain unchanged.

### Selected totals

- Remains a separate reserved row below the grid.
- Height reduced to 44px.
- It never overlays the last visible Tabulator row.

## Files

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Database

No migration and no database update.

Do not run `Update-Database`.

## Verification

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected automated result remains:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- `ERPPrototype automated verification: PASS`

Manual visual gate:

1. Active Basket stages are readable in four columns on the wide desktop screen.
2. Search is clearly visible immediately above the sheet.
3. The sheet remains the dominant area and displays more rows than the previous large-card layouts.
4. The Selected totals row is visible below the grid and does not cover the last cell.
5. No horizontal Basket scrollbar appears.

Do not commit or tag until automated tests pass and the actual application layout is accepted visually.
