# Phase 9.2B7 — Vertical KPI Rail Visual Trial

## Purpose

This is an intentionally reversible visual experiment.

- The four financial totals are stacked vertically in a compact rail on the right.
- Active Basket groups use the remaining horizontal area.
- The total overview height is held near the current KPI + Basket height budget so the Work Orders sheet is not intentionally reduced.
- No business logic, financial calculations, filtering, saving, database schema, or migrations are changed.

## Files replaced

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Install

Extract this ZIP into the folder that contains `ERPPrototype.csproj`, preserving folders and replacing the three files above.

Do **not** run `Update-Database`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected baseline:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS

## Visual acceptance check

- Four totals appear as one compact vertical rail on the right.
- Basket groups occupy the remaining width and preserve workflow order.
- Search remains standalone above the sheet.
- The sheet keeps at least the current practical row capacity; no intentional grid-height reduction was introduced.

## Rollback

Use the companion rollback ZIP `ERPPrototype_Phase9.2B7_VerticalKpiTrial_ROLLBACK_to_B6R1.zip` to restore the exact B6-R1 files included with this trial.
