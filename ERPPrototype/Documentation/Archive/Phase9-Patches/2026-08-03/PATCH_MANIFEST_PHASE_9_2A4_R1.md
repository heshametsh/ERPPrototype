# Phase 9.2A4-R1 — Visible Reserved Selected Footer

**Status:** Candidate — requires Build + Integration + Browser Stress on the user's machine  
**Base required:** Phase 9.2A4 already installed  
**Database change:** None  
**Migration / Backfill:** None

## Problem confirmed

Phase 9.2A4 moved the Selected totals from a fixed overlay to normal document flow after the grid. The desktop Work Orders page deliberately locks document scrolling and gives the scrollbar to Tabulator only. A normal element after a viewport-height table can therefore fall outside the visible viewport.

The previous browser assertion was also too weak: it treated `hidden == false` as visible without requiring a rendered width, height, computed display/visibility, and real viewport intersection.

## Fix

The Tabulator card and Selected totals now live inside one viewport-sized `work-orders-grid-shell`:

- Row 1: Tabulator grid.
- Row 2: a permanently reserved 50px footer slot.
- The footer remains outside the grid and never overlays cells.
- The grid height is calculated from the shell's actual top position.
- The footer height, gap, card border, and viewport bottom gap are deducted explicitly.
- Document scrolling remains locked on desktop; only the grid scrolls.
- On mobile, normal document flow remains available.

## User-visible result

When rows are selected:

- `Selected Work Orders`, `Selected Work Order Value`, `Selected Partial Amount`, and `Selected Remaining Amount` appear directly below the grid.
- The footer is visible inside the browser viewport.
- The final visible Tabulator row and cell are not covered.
- Arrow-key navigation can reach the bottom visible row without hiding it behind the footer.

When no rows are selected, the 50px slot remains reserved but the totals content is hidden. This prevents the grid height from jumping when selection starts or clears.

## Files changed

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`
- `wwwroot/js/tabulatorLifecycle.js`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`

## Test correction

The browser layout check now requires all of the following:

- `hidden == false`.
- Computed `display` is not `none`.
- Computed `visibility` is not `hidden`.
- Opacity is greater than zero.
- Rendered width and height are non-zero.
- The footer intersects the viewport.
- The footer is below the grid card.
- The grid card and footer belong to the same reserved shell.
- The Tabulator holder does not extend into the footer.

## Static verification completed

- `node --check wwwroot/js/tabulatorLifecycle.js` — PASS.
- Diff whitespace checks — PASS.
- ZIP contains no `bin`, `obj`, `.vs`, `.git`, or local user files.

Runtime Build, SQL Server tests, and Playwright were not available in the packaging environment and are not claimed.

## Install

Extract the ZIP directly into the folder containing `ERPPrototype.csproj`, replacing files.

Do **not** run `Update-Database`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

Manual visual check:

1. Select one or more rows.
2. Confirm the Selected footer appears below the grid and inside the viewport.
3. Navigate down with Arrow Down to the lowest visible row.
4. Confirm the active cell is fully visible and not covered by the footer.
5. Clear selection and confirm the grid does not jump in height.

Do not Commit or Tag until the automated tests and manual visual check pass.
