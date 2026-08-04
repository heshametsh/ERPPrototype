# Phase 9.2A2 — Calm Visual Polish

**Status:** Candidate — requires local Build and the existing automated Stress suite before acceptance.

## Base

Apply this patch only after the accepted **Phase 9.2A1 Basket Dashboard Foundation** version, including the successful value-filter test helper correction.

## Scope

This is a visual-only step. It does not change:

- Basket calculations.
- Open-work-order calculations.
- Save behavior or database schema.
- Filters or sorting rules.
- Copy/Paste, Undo/Redo, row insertion, or deletion.
- Selection totals.

## What changes in the sheet

### Header controls

- `Save` remains the strongest primary action.
- `Copy Selected Cells` uses a softer blue treatment.
- Undo, Redo, Insert, and Delete use calm outline buttons.
- The load/save status pill is smaller and less visually dominant.

### Open summary

The four existing values remain unchanged:

- Open Work Orders.
- Work Order Value.
- Partial Amount.
- Remaining Amount.

They are displayed as separate white cards with small, muted accent lines instead of one heavy blue container.

### Basket dashboard

- White cards on a soft neutral background.
- Stages containing data use a calm blue top accent.
- Empty stages are visually quieter without being hidden.
- Long Arabic stage names can use two lines.
- Orders and Remaining Amount have compact internal metric panels.
- The horizontal scrollbar is thinner and less visually heavy.

### Search and grid

- The search box is compact and sits immediately above the grid.
- The large unused toolbar gap is removed.
- Grid borders, header background, alternating rows, hover, and selected cells use softer tones.

### Selected summary

The existing four selected metrics remain unchanged and visible at the bottom, with a lighter shadow and reduced height.

## Files

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`
- `wwwroot/js/tabulatorBasketDashboard.js`

## Installation

Extract the ZIP directly into the inner project folder that contains `ERPPrototype.csproj`, then allow the four files above to be replaced.

There is no migration and no data backfill. Do **not** run `Update-Database`.

## Automated verification

Run from the solution repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected existing result:

```text
Integration tests: 17/17 PASS
Browser checks: 54/54 PASS
ERPPrototype automated verification: PASS
```

## Manual visual check

Confirm:

1. All four open-summary values still match the pre-patch values.
2. Every Basket card still shows only Orders and Remaining Amount.
3. Empty Basket stages are visible but visually subdued.
4. Search is directly above the grid with no large empty block.
5. The grid still owns scrolling and the selected summary remains visible.
6. Buttons, keyboard navigation, filters, sorting, Copy/Paste, Undo/Redo, and Save behave exactly as before.

## Rollback

Before committing, restore the four files from the last accepted Git commit:

```powershell
git restore -- Components/Pages/WorkOrders.razor Components/Pages/WorkOrders.razor.css wwwroot/app.css wwwroot/js/tabulatorBasketDashboard.js
```

Do not create a stable Tag until automated tests pass and the visual result is accepted.

## Verification performed while preparing the candidate

- JavaScript syntax check passed for `tabulatorBasketDashboard.js`.
- CSS brace-balance checks passed for both edited CSS files.
- The existing `data-testid` hooks and business labels were preserved.

Not performed in this environment:

- .NET Build.
- SQL Server integration tests.
- Playwright browser tests against the running application.
