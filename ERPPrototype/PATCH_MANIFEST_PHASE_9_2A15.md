# Phase 9.2A15 — Final Visual Cleanup (Candidate)

## Base

Apply this patch over the current **Phase 9.2A14** project state.

## Objective

Keep the compact layout that restored the Work Orders sheet to at least 15 visible rows, while removing the remaining visual noise and improving long-session readability.

## User-visible changes

### Active Basket summary

- Removes the technical sentence above the Basket summary.
- Keeps active Baskets only.
- Keeps the wide-screen `4 × 2` distribution for the current eight active stages.
- Presents each stage as one clean data row:
  - Basket name on the right.
  - Work-order count in a fixed narrow middle column.
  - Remaining Amount in a fixed numeric column on the left.
- Uses subtle separators rather than card borders or heavy backgrounds.
- Keeps the summary height below the A14 version, preserving the sheet viewport.

### Work-order search

- Search remains immediately above the sheet.
- The visible external label is hidden accessibly; the existing placeholder identifies the field.
- Only one input border remains.
- The field is widened to 430 px on wide screens and stays responsive.

### Financial summary and sheet

- The four open-work-order totals keep the same content and calculations.
- Their typography and borders are calmer without increasing height.
- The sheet uses a restrained slate/blue palette, softer borders, subtle alternating rows, and a clearer selected-cell state.
- Grid header and row heights remain compact to preserve at least 15 visible rows on the user's main screen.

### Selected totals

- Remain in the separate reserved row below the sheet.
- Continue to avoid covering the last visible cell.

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

Manual visual acceptance:

- At least 15 Work Order rows remain visible with the Selected bar present.
- No technical Basket heading appears.
- Basket name, count, and Remaining Amount are readable and aligned.
- Search appears as one wide input directly above the sheet.
- The last visible grid cell remains above the Selected footer.

Do not Commit or Tag until automated tests and visual acceptance both pass.
