# Phase 9.2A4 — Compact Dashboard and Reserved Selection Footer

**Status:** Candidate — requires local Build, Stress automation, and a visual check before acceptance.

## Base

Apply this patch only over the current working version where Phase 9.2A3 is installed:

- All 13 Basket stages are visible without horizontal scrolling.
- The Phase 9.2A dashboard calculations passed.
- The current Stress browser suite passed `54/54` before this change.

## Business purpose

The Work Orders sheet must remain the main working surface.

This patch solves two layout problems:

1. The Basket dashboard consumed too much vertical space, leaving too few visible sheet rows.
2. The `Selected` totals bar floated over the bottom of the sheet and could hide the active bottom cell during keyboard navigation.

## What changes

### Compact Basket dashboard

- All Basket stages remain visible.
- The wide-desktop layout remains two rows, approximately `7 + 6` cards.
- Basket cards are reduced from roughly 94px to about 67px high.
- Titles still allow up to two lines.
- `Orders` and `Remaining Amount` remain visible.
- Colours and calculations are unchanged.

### Compact header summary and toolbar

- The four open-work-order summary cards are slightly shorter.
- Vertical gaps around the dashboard and search toolbar are reduced.
- The saved sheet area is returned to Tabulator.

### Selected totals become a real sheet footer

The Selected totals bar is no longer `position: fixed` and no longer overlays the grid.

A dedicated reserved footer exists below the Tabulator card:

- The grid height calculation always reserves the footer space.
- The footer appears inside that reserved area when cells are selected.
- The last visible row and active cell stay above the footer.
- Showing or hiding the Selected totals does not resize or jump the grid.

The footer still displays:

- `Selected Work Orders`
- `Selected Work Order Value`
- `Selected Partial Amount`
- `Selected Remaining Amount`

## What does not change

- Basket counts or Remaining Amount totals.
- Header summary calculations.
- Search or linked Excel-style filters.
- Financial sorting.
- Save, Copy/Paste, Undo/Redo, insert, or delete.
- Database schema, migrations, or development data.
- Current colour palette.

## Automated protection added

The browser suite now verifies that:

1. Every Basket stage remains visible without horizontal overflow.
2. Basket cards remain compact (`<= 82px` high).
3. The Selected totals footer is visible inside the viewport.
4. The footer is below the grid card.
5. The footer does not cover the Tabulator table holder or its last visible cells.

Expected browser counts become:

- Full: `48/48`
- Stress: `55/55`

## Files

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`
- `wwwroot/js/tabulatorLifecycle.js`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `Tools/Invoke-ERPTests.ps1`

## Installation

Extract the ZIP directly inside the inner project folder that contains `ERPPrototype.csproj`, then allow the files above to be replaced.

There is no migration or data backfill. Do **not** run `Update-Database`.

## Verification

Run from the solution repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

## Manual check

1. Confirm that all Basket cards remain visible.
2. Confirm that the Basket dashboard is noticeably shorter than Phase 9.2A3.
3. Use Arrow Down until the active cell reaches the bottom visible row.
4. Select cells so the Selected totals footer appears.
5. Confirm that the active bottom cell remains completely visible above the footer.
6. Confirm that Save and the other action buttons remain visible and unchanged.

## Rollback

Before committing, restore the changed files from the last accepted Git commit:

```powershell
git restore -- Components/Pages/WorkOrders.razor Components/Pages/WorkOrders.razor.css wwwroot/app.css wwwroot/js/tabulatorLifecycle.js ERPPrototype.E2ETests/WorkOrdersPage.cs ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs ERPPrototype.E2ETests/Phase9FoundationRunner.cs Tools/Invoke-ERPTests.ps1
```

Do not commit or create a stable Tag until the automated tests pass and the layout is accepted visually.

## Verification performed while preparing the candidate

Passed in this environment:

- JavaScript syntax check for `tabulatorLifecycle.js`.
- XML parsing for all project files.
- C# brace-balance checks for changed test files.
- CSS brace-balance checks.
- Static Chromium layout simulation at 1920×1080:
  - 13 Basket cards visible in 2 rows.
  - No horizontal overflow.
  - Maximum Basket card height about 67px.
  - Selected footer starts below the grid card and remains inside the viewport.
- Archive content and SHA-256 verification.

Not performed in this environment:

- .NET Build.
- SQL Server integration tests.
- Playwright tests against the running ERP application.
