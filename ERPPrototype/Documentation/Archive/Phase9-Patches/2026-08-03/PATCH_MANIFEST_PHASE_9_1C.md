# Phase 9.1C — Financial Filters and Single-Column Sorting Candidate

## Base required

Apply this patch only to the accepted **Phase 9.1B Stable** working tree:

- Integration: 17/17 PASS.
- Browser Stress: 42/42 PASS.
- The final Phase 9.1B selection-clear corrections are present.
- Git tag/checkpoint `Phase-9.1B-Stable` exists or an equivalent rollback copy is available.

This is a candidate patch. Do not commit or tag it until all verification gates pass.

## Scope

This candidate adds only the financial filtering/sorting slice:

- A filter icon beside each financial column header:
  - `Work Order Value`
  - `Partial Amount`
  - `Remaining Amount`
- Inclusive minimum and maximum amount filters.
- Minimum-only and maximum-only filters.
- A deliberate `Include blank values` option.
- Nonblank-only filtering by leaving both bounds empty and clearing `Include blank values`.
- Arabic/Persian digits and Arabic decimal/thousands separators are accepted.
- Filter bounds use the same away-from-zero halala rounding as editing and saving.
- Invalid input or Minimum > Maximum keeps the popup open and does not change the sheet.
- Filter Apply/Clear is included in the existing Undo/Redo filter-history model.
- Visible financial totals update after filtering while the selected-year totals remain fixed.
- An active `Remaining Amount` filter is re-applied when Work Order Value or Partial Amount changes.
- Financial sorting is verified as numeric, one column at a time, with the complete work-order row moving together.

Not included:

- Dashboard.
- Custom columns.
- Column layout persistence.
- Filters for every remaining text column.
- Database changes.

## Performance design

- Typing inside the amount popup does not scan the 1,000-row sheet.
- The table is filtered once only when the user presses `Apply`.
- Comparisons use integer halalas, not JavaScript floating-point amounts.
- No listener is added to individual cells.
- A source financial edit re-applies a currently active dependent filter only when required.
- Existing aggregate refresh remains coalesced.

## Files replaced

- `wwwroot/js/tabulatorFilters.js`
- `wwwroot/js/tabulatorTest.js`
- `wwwroot/js/tabulatorLifecycle.js`
- `wwwroot/js/tabulatorClipboardHistory.js`
- `wwwroot/js/tabulatorPerformance.js`
- `wwwroot/app.css`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `Tools/Invoke-ERPTests.ps1`

The ZIP also carries the accepted final Phase 9.1B versions of:

- `wwwroot/js/tabulatorAggregates.js`
- `wwwroot/js/tabulatorValidation.js`

They preserve the corrected behavior when the final Tabulator range is cleared.

## Database

No migration and no backfill are required.

Do **not** run:

```powershell
Update-Database
```

## Installation

Extract the ZIP directly into the folder containing `ERPPrototype.csproj`, then allow replacement of the included files.

## Automated verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

```text
Integration tests: 17/17 PASS
Browser checks: 47/47 PASS (Stress)
ERPPrototype automated verification: PASS
```

The five added browser checks verify:

1. Inclusive Work Order Value range filtering with English and Arabic formatted amounts.
2. Clearing the financial range restores all rows and visible totals.
3. Partial Amount can exclude blank rows and then return to the full year.
4. Work Order Value sorts numerically ascending through the header with one sorter.
5. Descending sort replaces the prior direction and moves the complete row identity.

The test runner count is also corrected to the actual totals:

- Smoke: 9.
- Full: 40.
- Stress: 47.

## Manual judgment after automated PASS

Check only these visual/UX points:

1. The filter icon is visible beside the sort indicator for all three financial columns.
2. Enter `60,000.50` to `65,000.75` and confirm only the matching rows remain.
3. Clear the filter and confirm the whole year returns.
4. Click the Work Order Value title twice and confirm the whole rows move ascending then descending.
5. Confirm the filter popup is readable and does not move the page unexpectedly.

## Static verification completed in the preparation environment

Passed:

- JavaScript syntax checks for every project-owned JS file.
- Focused 1,000-row financial filter harness: range = 6 rows; nonblank partial = 333 rows.
- Arabic amount parser harness.
- Numeric amount sorter harness: minimum `50,000`; maximum `2,045,000.75`.
- Filter-history clone independence/equality harness.
- Git diff whitespace check.
- C# delimiter/structure balance check for changed test files.

Not performed in the preparation environment:

- .NET Build.
- SQL Server Integration execution.
- Playwright browser execution.

Those claims must come only from the user's Windows/SQL Server environment.

## Acceptance rule

Do not commit or tag until:

- Release Build: 0 errors and 0 warnings.
- Integration: 17/17 PASS.
- Browser Stress: 47/47 PASS.
- Manual visual check is acceptable.

## Rollback

Restore `Phase-9.1B-Stable` or replace these files with the Phase 9.1B Stable versions.
