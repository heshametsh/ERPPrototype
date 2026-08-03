# Phase 9.2A5 — Compact Top Layout (Candidate)

## Base

Apply this patch only over the current project state that already contains:

- Phase 9.2A4 compact Basket grid.
- Phase 9.2A4-R1 reserved Selected totals row.
- Phase 9.2A4-R2 dashboard layout synchronization.

The patch was prepared from the user-supplied `ERPPrototype(25).zip` plus R2.

## Goal

Recover vertical space for the work-order sheet without changing business logic.

## Changed files

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

No C#, service, database, migration, financial rule, filter, save, or dashboard calculation was changed.

## Visual changes

1. The Work Order search box moves into the command header next to the save status.
2. The old search/validation toolbar row is removed.
3. When no validation error exists, the validation area consumes zero height.
4. Open summary cards become slightly shorter.
5. On desktop widths of 1700px or more, all 13 Basket cards fit in one compact row.
6. Between 1201px and 1699px, Basket cards use a centered 7 + 6 two-row layout.
7. The Selected totals footer remains a separate reserved row below Tabulator.
8. The existing R2 layout synchronization remains unchanged and recalculates the sheet height after the dashboard renders.

## Business behavior preserved

- Dashboard: Orders + Remaining Amount per Basket.
- Header open totals.
- Search, filters, sorting, editing, clipboard, Undo/Redo and Save.
- Selected totals footer.
- No Basket card click filtering.

## Installation

Extract the ZIP directly into the folder containing `ERPPrototype.csproj` and approve replacement.

Do not run `Update-Database`; there is no migration.

## Automated verification

Run from the solution folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected existing result:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- Overall verification: `PASS`

## Manual visual checks

1. Search appears in the upper command area rather than in a separate row.
2. No blank strip remains between the Basket dashboard and the sheet when there are no validation errors.
3. At a 1920px-wide desktop window, all Basket cards appear in one row.
4. The sheet has more visible rows than before.
5. Selecting a cell shows the Selected totals below the sheet, and the footer does not cover the final visible row.
6. Trigger one validation error and confirm the validation navigator appears between the dashboard and the sheet.

## Rollback

Restore the three changed files from the last accepted Git checkpoint, or run:

```powershell
git restore --source HEAD --worktree -- Components/Pages/WorkOrders.razor Components/Pages/WorkOrders.razor.css wwwroot/app.css
```

Use the Git command only before committing this candidate.
