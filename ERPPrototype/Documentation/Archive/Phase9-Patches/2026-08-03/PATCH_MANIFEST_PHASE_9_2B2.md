# ERP Prototype — Phase 9.2B2

## Commercial Visual Hierarchy Candidate

This patch must be installed over the current tested Phase 9.2B1 / Phase 9.2A18-R1 workspace.

## Scope

Visual-only refinement of the Work Orders page. No database, calculation, filtering, save, keyboard-navigation, or business-rule changes.

### 1. Stronger visual hierarchy

- Keeps `Save` as the single primary action.
- Changes `Copy Selected Cells` to a clear secondary action.
- Uses a stronger, consistent blue / slate / teal / amber palette.

### 2. Summary cards

- Each KPI now has a distinct but controlled visual identity.
- `Remaining Amount` is more prominent using teal, stronger border contrast, and a slightly larger value.
- `Remaining Amount` is **not** shown as a warning because no warning threshold business rule has been approved.

### 3. Work-order search

- Positioned at the right side directly above the sheet.
- Width: up to 420px.
- Stronger two-pixel border, visible focus ring, white surface, and a CSS search icon.
- Keeps the same 34px height to protect visible grid capacity.

### 4. Grid readability

- Dark slate/blue column header provides a clear product focal point.
- Stronger zebra striping for long-row scanning.
- Clearer hover, selected-cell, editing-cell, grid-line, and row-number states.
- Row heights are unchanged.

### 5. Basket groups

- Stronger group borders and header contrast.
- Clearer alternating rows and values.
- Existing balanced dynamic distribution remains unchanged.

## Files replaced

```text
Components\Pages\WorkOrders.razor.css
wwwroot\app.css
```

## Installation

Extract the ZIP in the folder that contains `ERPPrototype.csproj` and allow replacement of the two files above.

Do not run `Update-Database`.

## Verification

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected result:

```text
Integration: 17/17 PASS
Browser Stress: 55/55 PASS
ERPPrototype automated verification: PASS
```

## Visual acceptance checklist

- Search is clearly visible on the right directly above the grid.
- `Remaining Amount` is the most prominent financial KPI without looking like an error.
- Summary cards are visually distinguishable at a glance.
- Zebra striping remains visible across 15+ displayed rows.
- The dark grid header does not obscure sort/filter icons.
- At least 15 work-order rows remain visible.
- Selected footer does not cover the last grid row.

## Local package validation

- CSS parsed successfully with zero syntax errors.
- Opening and closing brace counts match in both CSS files.
- Full project and browser tests must still be executed in the user environment.
