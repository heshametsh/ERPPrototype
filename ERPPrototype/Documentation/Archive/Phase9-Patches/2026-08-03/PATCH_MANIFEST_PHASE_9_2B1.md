# ERP Prototype — Phase 9.2B1 Final Slate / Blue Theme (Candidate)

## Base required

Apply this patch only after the currently tested Phase 9.2A18-R1 state:

- Integration tests: 17/17 PASS
- Browser Stress: 55/55 PASS
- Active Basket groups are balanced and visually separated.
- Search remains directly above the sheet.
- Selected totals remain in a reserved row below the grid.

## Scope

This is a visual-only theme pass for the Work Orders screen. It does not change:

- database schema or migrations;
- Work Order calculations;
- Basket calculations or distribution;
- save behavior;
- filters or sorting;
- Undo / Redo;
- keyboard navigation;
- grid row height, header height, dashboard height, or Selected-footer height.

## Files replaced

1. `Components/Pages/WorkOrders.razor.css`
2. `wwwroot/app.css`

## Visual changes

### Workspace palette

A consistent, low-glare Slate / Blue palette replaces the mixed legacy colors:

- Page background: soft blue-gray.
- Main surfaces: white.
- Table header: light slate-blue.
- Borders: reduced-contrast blue-gray.
- Primary action and active states: calm medium blue.
- Remaining Amount accent: muted teal.
- Partial Amount accent: muted amber.

### Page header and controls

- Secondary buttons use white surfaces and quiet slate borders.
- Copy uses a soft-blue treatment.
- Save uses one flat primary blue instead of a gradient.
- Year selector, status pill, and focus states use the same palette.
- No dimensions or toolbar positions are changed.

### Open Work Orders summary

- Keeps the current compact four-item layout.
- Removes the heavy outer gradient/frame.
- Uses white metric surfaces with restrained accent strips:
  - Open Work Orders: blue
  - Work Order Value: slate
  - Partial Amount: amber
  - Remaining Amount: teal

### Active Basket groups

- Keeps the exact A18 balanced layout and group boundaries.
- Uses clearer group borders, a light header surface, quiet alternating rows, and stronger text contrast.
- Does not change the number of rows or the automatic appearance/disappearance of active Baskets.

### Work Orders sheet

- Uses a calm slate-blue column header.
- Alternating rows remain subtle.
- Hover, selected cells, editing outline, filter state, and scrollbars use one coherent blue system.
- Existing grid dimensions are preserved so the visible-row count should not decrease.

### Selected totals

- Remains in the reserved row below the sheet.
- Styled as one Excel-like status strip with internal separators instead of four heavy cards.
- Does not cover the last visible cell.

### Filter popups

- Search inputs, checkbox accent, primary/secondary buttons, hover states, borders, and focus rings now match the Work Orders palette.

## Installation

Extract the ZIP directly into the folder containing `ERPPrototype.csproj` and allow the two files to be replaced.

Do not run `Update-Database`; this patch contains no database changes.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected automated result:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

Manual visual gate on the same desktop resolution:

1. At least the same number of Work Order rows remains visible as before the patch.
2. Search remains directly above the sheet.
3. Basket group distribution and height are unchanged.
4. Selected totals remain below the sheet and do not overlap the last cell.
5. Buttons, summary, Basket groups, grid, selection, and filter popup share one coherent Slate / Blue palette.
6. Text remains clear during prolonged use; no essential label uses low-contrast muted text.

## Static verification completed here

- Both CSS files parsed with `tinycss2`: 0 parse errors.
- Lexical brace validation: PASS.
- Diff whitespace validation: PASS.
- No JavaScript, C#, migration, or test-count changes.

Runtime Build, SQL Server, and Playwright verification must be completed on the user's Windows development environment.
