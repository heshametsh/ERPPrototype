# Phase 9.2A6 — Readable Two-Row Basket Dashboard

## Base

Apply over the current successful Phase 9.2A5 project state.

## Scope

Visual layout only. No business rules, calculations, save behavior, filters,
SQL schema, or Basket aggregation logic are changed.

## What changes

- The 13 Basket cards use a centered `7 + 6` desktop layout instead of one
  very compressed row.
- Cards remain substantially shorter than the earlier tall two-row layout.
- Basket names can use two lines.
- `Orders` and `Remaining Amount` remain fully visible, but their inner gray
  boxes are removed to reduce visual noise.
- Empty stages remain visible with a quieter visual weight.
- The four open-work-order summary cards receive a small readability increase.
- The Selected totals footer remains a separate reserved row below Tabulator;
  this patch only softens its border/shadow.

## Expected user effect

The sheet remains the primary area, while the Basket dashboard becomes readable
without horizontal scrolling or tiny one-row cards.

## Files

- `wwwroot/app.css`

## Install

Extract the ZIP directly into the folder that contains `ERPPrototype.csproj`
and replace the existing file.

No migration or backfill is required.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected existing safety net:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- Overall verification: `PASS`

Manual visual check:

1. All 13 Basket cards are visible with no horizontal scroll.
2. Desktop layout is seven cards on the first row and six centered below.
3. Basket names and values are readable without consuming excessive sheet height.
4. The Selected totals remain below the grid and do not cover the last cell.

Do not commit or move a stable tag until automated and visual checks pass.
