# Phase 9.2A1 — Basket Dashboard Foundation (Candidate)

**Base required:** `Phase-9.1D-Stable` at commit `56a43b881cdb58cab2e8afdfc6a0e7258fa3fa5e` or the equivalent tested working tree.

**Status:** Candidate until the full automated suite passes on the developer machine.

## Business result

A compact, display-only Basket dashboard is added above the Work Orders toolbar for the current department and selected year.

Every standard Basket card displays only:

- `Orders`: number of work orders in that Basket.
- `Remaining Amount`: total calculated remaining amount in that Basket.

The Basket cards intentionally do **not** display `Work Order Value`.

The existing header summary remains unchanged and still displays:

- `Open Work Orders`
- `Work Order Value`
- `Partial Amount`
- `Remaining Amount`

## Behaviour

- All standard workflow Baskets are shown, including stages with zero work orders.
- Dashboard order follows `WorkOrderBuskets.All`.
- Dashboard scope is the complete current department/year sheet.
- Search, filters and sorting do not change dashboard totals.
- Changing a work order's Basket moves its count and Remaining Amount immediately.
- Financial edits update Remaining Amount immediately.
- Undo/Redo, insert/delete and save/reload trigger consistent recalculation.
- Cards are display-only; clicking them does not filter or modify the sheet.
- A new incomplete row without a valid Basket is not assigned to a dashboard card until a Basket is selected.

## Performance design

- Initial/full operations use one linear pass over the in-memory year rows.
- A normal single-row financial or Basket edit updates the two affected cards by delta; it does not scan the entire sheet.
- Filter-only changes do not recalculate the fixed Basket dashboard.
- Cards use a horizontal track so all workflow stages remain available without adding several permanent rows above the grid.

## Files

- `Components/App.razor`
- `Components/Pages/WorkOrders.razor`
- `wwwroot/app.css`
- `wwwroot/js/tabulatorAggregates.js`
- `wwwroot/js/tabulatorBasketDashboard.js` (new)
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `Tools/Invoke-ERPTests.ps1`

## Automated coverage added

The browser suite verifies that:

1. Every standard Basket renders a card.
2. The seeded 1,000 work orders appear in `تحت التنفيذ`.
3. The card total equals calculated `Remaining Amount`.
4. `Work Order Value` is not displayed in Basket cards.
5. Moving one order to `انتهاء امر العمل` transfers both count and Remaining Amount.
6. Undo restores both Basket cards.
7. Search changes the grid but not the fixed Basket dashboard.

Expected results:

- Smoke: `10/10 PASS`
- Full: `47/47 PASS`
- Stress: `54/54 PASS`
- Integration Stress: `17/17 PASS`

## Installation

Extract the ZIP directly into the inner project directory that contains `ERPPrototype.csproj`, then approve file replacement.

No database migration or backfill is included. Do not run `Update-Database` for this patch.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Do not create a commit or tag before all checks pass and the dashboard is visually accepted.

## Manual visual check

- The existing open-work-order summary must remain unchanged.
- Basket cards must show `Orders` and `Remaining Amount` only.
- The cards must be readable using the horizontal dashboard scrollbar.
- Clicking a Basket card must do nothing to the grid.
- The grid must retain enough usable vertical space.

## Rollback

Before committing, restore the stable baseline with:

```powershell
git restore --source Phase-9.1D-Stable --staged --worktree -- ERPPrototype
```

## Static verification completed in the preparation environment

- JavaScript syntax check: PASS for all project-owned JS files.
- Basket calculation/delta harness: PASS.
- 40,000-row calculation harness: PASS in approximately 11 ms in Node.js (not a browser runtime claim).
- Changed C# lexical structure check: PASS.
- No runtime .NET, SQL Server or Playwright execution was available in the preparation environment.
