# Phase 9.2B5 — Summary / Basket Visual Separation

## Base

Apply this candidate over the currently installed **Phase 9.2B4 — Light Modern Data Grid** files.

## Purpose

The four financial KPI cards and the active-Basket summaries were visually touching, so both levels looked like one dense stacked table. This patch separates them without changing dashboard calculations, Basket visibility rules, search behavior, grid logic, or database schema.

## Visual changes

- Adds an 8px deliberate gap between the KPI row and the Basket strip.
- Places the complete Basket summary inside a subtle independent surface.
- Adds 12px horizontal spacing and 4px row spacing between Basket groups.
- Keeps each Basket group compact, with a soft border, rounded corners, and restrained shadow.
- Preserves the current search position and Light Modern Data Grid design.
- Does not change row data, financial calculations, Save, filters, Undo/Redo, or database schema.

## Files replaced

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Installation

Extract the ZIP into the directory containing `ERPPrototype.csproj`, allowing the two files above to be replaced.

Do not run `Update-Database`.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected baseline:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- `ERPPrototype automated verification: PASS`

Visual acceptance:

- A clear gap exists between the KPI cards and Basket groups.
- The Basket strip reads as a separate dashboard level.
- Basket groups remain individually identifiable.
- Search stays directly above the grid on the right.
- At least 15 grid rows remain visible on the target screen.

Do not commit or move the stable tag until tests pass and the visual result is accepted.
