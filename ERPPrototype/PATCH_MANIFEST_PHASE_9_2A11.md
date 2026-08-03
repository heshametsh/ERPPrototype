# Phase 9.2A11 — Tight Basket Summary Columns

## Base

Apply this patch over the current Phase 9.2A10 project.

## Change

Only `wwwroot/app.css` is changed.

The Basket summary keeps its current behavior:

- Only Basket stages containing work orders are shown.
- A stage appears when its first work order enters it.
- A stage disappears when its final work order leaves it.
- Orders and Remaining Amount calculations are unchanged.

The layout now behaves like a compact Excel range:

- Each summary group sizes to its content instead of stretching across the page.
- Fixed narrow columns are used for Basket name, order count, and remaining amount.
- Gaps between the three values are removed.
- Thin cell separators preserve readability.
- Groups wrap automatically when the viewport is too narrow.

## Database

No migration and no `Update-Database` command are required.

## Verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected automated result remains:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS

Manual visual check:

- Basket name, Orders, and Remaining Amount are close together like adjacent Excel cells.
- There is no horizontal page overflow.
- Search stays directly above the sheet.
- Selected totals remain separate below the sheet.
