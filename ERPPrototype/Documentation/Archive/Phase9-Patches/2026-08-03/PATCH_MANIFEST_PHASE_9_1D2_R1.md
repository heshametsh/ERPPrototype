# Phase 9.1D2-R1 — Summary Visibility and Header Labels

**Base:** the currently accepted Phase 9.1D2 project on the user's machine.

## Purpose

This corrective patch addresses two visual defects that functional tests did not previously catch:

1. The open-work-order header summary labels and values were still visually attached because JavaScript-created child elements did not receive Blazor CSS-isolation attributes.
2. The selected-row summary existed in the DOM and its totals were correct, but it was placed after the grid while desktop document scrolling is locked. It was therefore outside the visible viewport.

## Changes

### Header summary

Labels are shortened to:

- `Work Orders`
- `Work Order Value`
- `Partial Amount`
- `Remaining Amount`

The business meaning is unchanged: all four values still represent open work orders only.

Dynamic summary-item styles were moved to `wwwroot/app.css`, where JavaScript-created elements can be styled reliably.

### Selected-row summary

The selected summary keeps all four existing metrics:

- `Selected Work Orders`
- `Selected Work Order Value`
- `Selected Partial Amount`
- `Selected Remaining Amount`

It now behaves like an Excel status bar and appears at the bottom of the visible browser viewport while a range is selected. It remains hidden when no real selection exists.

### Automated test strengthening

The existing selection test now verifies not only that the summary is unhidden and has correct data, but also that its bounding rectangle is actually inside the browser viewport. This prevents the same invisible-but-technically-present defect from passing again.

## Files

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`
- `wwwroot/js/tabulatorAggregates.js`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`

## Database

No migration and no backfill. Do not run `Update-Database`.

## Test

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected:

- Integration: `17/17 PASS`
- Browser Stress: `47/47 PASS`
- Build: no errors and no warnings

Manual visual check:

1. Header labels and values must be separated inside four compact cards.
2. Select 20 rows: the selected summary must be visible at the bottom of the current viewport.
3. Clear the selection: the selected summary must disappear.

Do not commit or tag until the automated and visual checks pass.
