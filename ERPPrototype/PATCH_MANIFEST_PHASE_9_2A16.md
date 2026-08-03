# Phase 9.2A16 — Search Position and Basket Clarity (Candidate)

## Base

Apply over the current **Phase 9.2A15** project state.

## Objective

Keep the accepted compact workspace and visible-sheet capacity, while fixing the two remaining layout issues:

1. Place Work Order search on the physical right directly above the sheet.
2. Clarify which Basket value is the order count and which is Remaining Amount without repeating labels inside every Basket.

## User-visible changes

### Work Order search

- Remains directly above the sheet.
- Moves to the physical right on wide desktop screens.
- Remains one input with one border.
- Keeps the current 430 px maximum width and responsive mobile behavior.

### Active Basket summary

- Keeps active Baskets only.
- Keeps the current wide-screen `4 × 2` layout.
- Adds one small legend only:
  - `اسم السلة`
  - `الأوامر`
  - `المتبقي`
- Does not repeat those labels inside every Basket.
- Keeps subtle vertical separators between Basket name, count, and Remaining Amount.
- Slightly tightens row height to offset the legend and preserve the sheet viewport.

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

Expected:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- Overall: `ERPPrototype automated verification: PASS`

Manual visual checks:

- Search is on the right directly above the sheet.
- Search has one border only.
- One compact Basket legend is visible, without repeated labels.
- Basket name, count, and Remaining Amount remain aligned.
- At least 15 sheet rows remain visible with the Selected footer present.

Do not Commit or Tag until automated tests and visual acceptance both pass.
