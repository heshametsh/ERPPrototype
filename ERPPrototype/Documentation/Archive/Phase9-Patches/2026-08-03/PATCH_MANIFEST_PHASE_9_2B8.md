# Phase 9.2B8 — Compact Vertical KPI Rail Trial

## Purpose

This is the second reversible visual experiment for the vertical financial totals.

- The four totals remain stacked vertically on the right.
- Each total is now one compact horizontal line: label on the left and value on the right.
- The KPI rail and active-Basket area share the same fixed 82 px height budget.
- Basket groups are vertically centered inside that space instead of leaving a large empty block.
- Search remains a separate control above the sheet.
- The new overview is shorter than B7, so it does not intentionally reduce the grid height.

No business logic, totals, Basket calculations, filtering, saving, database schema, or migrations are changed.

## Files replaced

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Install

Extract this ZIP into the folder that contains `ERPPrototype.csproj`, preserving folders and replacing the two files above.

This patch must be installed over **Phase 9.2B7**.

Do **not** run `Update-Database`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected baseline:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS

## Visual acceptance

- No large blank area below the Basket groups.
- The four KPI lines fit inside the same height as the Basket panel.
- Search stays separate from the overview area.
- The sheet keeps at least the previous practical row capacity.

## Rollback

Use the existing `ERPPrototype_Phase9.2B7_VerticalKpiTrial_ROLLBACK_to_B6R1.zip` to return to the accepted B6-R1 layout if the vertical concept is rejected.
