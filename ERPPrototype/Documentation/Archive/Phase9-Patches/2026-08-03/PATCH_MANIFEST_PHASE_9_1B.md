# Phase 9.1B — Financial Aggregates Candidate

## Base required

Apply this patch only after the accepted Phase 9.1A financial vertical slice:

- Integration: 17/17 PASS.
- Browser Stress: 38/38 PASS.
- `Work Order Value`, `Partial Amount`, and calculated `Remaining Amount` are working.
- The Phase 9.1A paste-selection fix is present.

This patch is cumulative for the final small Phase 9.1A fixes, so replacing all included files is safe even if those fixes are already present.

## Scope

This candidate adds only Phase 9.1B:

- Fixed summary bar below the sheet.
- Visible work-order count versus complete selected-year work-order count.
- Completely blank inserted rows are not counted as work orders until the user enters real content.
- Visible versus selected-year totals for:
  - Work Order Value.
  - Partial Amount.
  - Remaining Amount.
- Selected-row summary using unique work-order rows, even when the selected range is in Notes or another non-financial column.
- Summary updates after:
  - Financial edit.
  - Paste.
  - Undo/Redo.
  - Filter apply/clear.
  - Insert/Delete rows.
  - Save reconciliation and year movement.
- No Dashboard and no Custom Columns in this phase.

## Performance design

- One dedicated `tabulatorAggregates.js` module owns aggregation.
- No listener is added to every cell.
- A single financial cell edit updates totals by delta instead of scanning the full year.
- Paste, Undo/Redo, and structural batches trigger one coalesced refresh after the operation.
- Selection totals use only the unique rows in the current range.
- Filter changes recalculate only visible totals; the selected-year total remains cached.
- Money is summed as integer halalas in JavaScript.
- The summary remains outside Tabulator's horizontal column layout.

## Files added

- `wwwroot/js/tabulatorAggregates.js`
- `PATCH_MANIFEST_PHASE_9_1B.md`

## Files replaced

- `Components/App.razor`
- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.cs`
- `Components/Pages/WorkOrders.razor.css`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `wwwroot/js/tabulatorClipboardHistory.js`
- `wwwroot/js/tabulatorFieldChanges.js`
- `wwwroot/js/tabulatorFilters.js`
- `wwwroot/js/tabulatorInteractions.js`
- `wwwroot/js/tabulatorLifecycle.js`
- `wwwroot/js/tabulatorStructure.js`
- `wwwroot/js/tabulatorTest.js`

## Database

No migration and no SQL script are required for Phase 9.1B.
Do not run `Update-Database` for this patch.

## Installation

Extract the ZIP into the folder containing `ERPPrototype.csproj` and allow replacement of the included files.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

```text
Integration tests: 17/17 PASS
Browser checks: 42/42 PASS (Stress)
ERPPrototype automated verification: PASS
```

The four new browser checks cover:

1. Initial visible/year totals.
2. Filtered totals without changing year totals.
3. Live edit/paste totals before Save, including Undo/Redo consistency.
4. Summary of 20 selected unique work-order rows.

The existing 1,000-row structural test additionally verifies that 1,000 newly inserted blank rows do not inflate the business work-order count, while Undo/Redo remains consistent.

## Manual judgment after automated PASS

Only check the visual result:

- The summary bar remains visible below the grid.
- The grid still has enough working height.
- Selecting rows does not make the page jump.
- The text remains readable at the normal desktop window size.

## Acceptance rule

Do not commit or tag this phase until:

- Release build has 0 errors and 0 warnings.
- Integration is 17/17 PASS.
- Browser Stress is 42/42 PASS.
- The visual manual check is acceptable.

## Rollback

Restore the Phase 9.1A Stable Git tag or replace the files with the Phase 9.1A versions.
