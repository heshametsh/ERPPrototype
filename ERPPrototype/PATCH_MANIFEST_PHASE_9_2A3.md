# Phase 9.2A3 — All Basket Stages Visible Grid

**Status:** Candidate — requires local Build, automated Stress tests, and a visual check before acceptance.

## Base

Apply this patch only over the current accepted working version where:

- Phase 9.2A1 Basket calculations passed.
- The value-filter browser helper correction is present.
- Phase 9.2A2 visual changes are currently installed and the Stress suite passed `54/54`.

This patch changes the Basket layout only. It does not change the dashboard calculations or the current colour palette.

## What changes

The Basket dashboard no longer uses a horizontal scrolling strip.

All 13 workflow stages remain visible at the same time and wrap into a responsive grid:

- Wide desktop: 7 cards in the first row and 6 in the second.
- Smaller desktop: 5 or 6 cards per row.
- Tablet: 4 or 2 cards per row.
- Mobile: one card per row.

Every stage remains visible even when its values are zero.

Each card still displays only:

- `Orders`
- `Remaining Amount`

## What does not change

- Basket counts and Remaining Amount calculations.
- The order of workflow stages.
- Header totals.
- Search and linked Excel-style filters.
- Financial sorting.
- Save, Copy/Paste, Undo/Redo, insert, and delete.
- Selected-row totals.
- Database schema and migrations.
- Current colours and visual identity.

## Automated protection added

The existing Basket dashboard browser check now also verifies that:

1. Every configured Basket card is inside the visible dashboard area.
2. The dashboard has no horizontal overflow.
3. The cards wrap into multiple rows rather than a hidden scrolling strip.

The browser check count remains `54/54` because these assertions strengthen the existing Basket dashboard check instead of adding a duplicate scenario.

## Files

- `wwwroot/app.css`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`

## Installation

Extract the ZIP directly inside the inner project folder that contains `ERPPrototype.csproj`, then allow the four files above to be replaced.

There is no migration or data backfill. Do **not** run `Update-Database`.

## Verification

Run from the solution repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

```text
Integration tests: 17/17 PASS
Browser checks: 54/54 PASS
ERPPrototype automated verification: PASS
```

## Manual visual check

Confirm that:

1. All 13 Basket stages are visible without dragging a horizontal scrollbar.
2. On a wide desktop they form two rows, approximately `7 + 6` cards.
3. Long Arabic stage names remain readable on up to two lines.
4. Empty stages remain visible.
5. The sheet still has enough usable height and the Selected summary remains visible.
6. No Dashboard card click filters or changes the sheet.

## Rollback

Before committing, restore the four files from the last accepted Git commit:

```powershell
git restore -- wwwroot/app.css ERPPrototype.E2ETests/WorkOrdersPage.cs ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs ERPPrototype.E2ETests/Phase9FoundationRunner.cs
```

Do not create or move a stable Tag until the automated tests pass and the layout is accepted visually.

## Verification performed while preparing the candidate

Passed in this environment:

- CSS brace-balance check.
- C# brace and delimiter lexical checks for all changed test files.
- Patch file-scope review: no runtime calculation, database, migration, or JavaScript business logic was changed.
- Archive content and SHA-256 verification.

Not performed in this environment:

- .NET Build.
- SQL Server integration tests.
- Playwright browser tests against the running application.
