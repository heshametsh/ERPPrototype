# Phase 9.2A12 — Compact Basket Mini Tiles (Candidate)

## Base
Apply over the current Phase 9.2A11 working copy.

## Purpose
Replace the compressed multi-column Basket matrix appearance with compact,
button-shaped summary tiles while keeping the Basket summaries read-only.

## Business behavior unchanged
- Only Basket stages containing at least one work order are shown.
- A stage appears when its first work order enters it.
- A stage disappears when its final work order leaves it.
- Every visible stage still shows Work Order count and Remaining Amount.
- No Basket click filtering or navigation is added.
- Search, save, filters, sorting, Undo/Redo, header totals, and Selected totals
  are unchanged.

## Visual result
Each active Basket appears as one compact two-line tile:

- First line: Basket name.
- Second line: `أوامر: <count>` and `المتبقي: <amount>`.

The tiles automatically fill the available width and wrap only when needed.
They use the restrained border radius and outline language of the toolbar
buttons, but keep a normal cursor and no click behavior.

## Files
- `wwwroot/app.css`

## Database
No migration or backfill is required.

## Verification
Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected existing safety net:
- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- Overall verification: PASS

Also verify visually that active Basket summaries are readable, do not imply a
click action, and leave the Work Orders sheet with sufficient height.
