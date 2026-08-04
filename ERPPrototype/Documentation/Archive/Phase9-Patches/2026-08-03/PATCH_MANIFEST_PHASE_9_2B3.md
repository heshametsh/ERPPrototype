# Phase 9.2B3 — Final Refinement Candidate

This cumulative visual patch is applied over **Phase 9.2B2**.

## Files replaced

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## Visual changes

1. **Financial meaning corrected**
   - `Partial Amount` now uses a restrained green treatment because it represents money already paid.
   - `Remaining Amount` now uses the gold emphasis because it represents outstanding value that still requires follow-up.
   - Remaining Amount remains the strongest financial metric without being shown as an error.

2. **Lighter active-cell selection**
   - Active-cell border reduced from a heavy 2px treatment to a clear 1px line.
   - Selection background is lighter.
   - Tabulator's range handle is reduced to 4px.
   - Editing remains distinguishable from ordinary selection.

3. **More modern Basket summary groups**
   - Softer 8px corners.
   - Slightly wider separation between groups.
   - Subtle shadow and top accent.
   - Softer internal separators and alternating backgrounds.
   - No height increase and no return to large cards.

4. **Current-sheet year control**
   - The Year selector is now a compact context control with a clearer border, background, focus state, and stronger year value.
   - It remains in the existing title row and does not create a new row.

5. **Selected summary separation**
   - A slightly stronger top separator distinguishes the fixed selection summary from the final grid row.

## Installation

Extract this ZIP into the folder that directly contains `ERPPrototype.csproj`, allowing the two files above to be replaced.

Do **not** run `Update-Database`; this patch contains no database or migration changes.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

- Integration: `17/17 PASS`
- Browser Stress: `55/55 PASS`
- `ERPPrototype automated verification: PASS`

Before committing, confirm visually that:

- gold is on Remaining Amount, not Partial Amount;
- the selected cell is clear but not heavy;
- Basket groups look separated and softer;
- the year selector is easy to notice;
- at least 15 Work Order rows remain visible.
