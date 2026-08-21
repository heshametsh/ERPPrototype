# Gate 5A — RevoGrid Native Rebuild — 2026-08-20

## Status

New-from-scratch Gate 5A replacement.

The previous Gate 5A implementation is intentionally discarded, not patched.

## What is reused

Only the existing business/server read path:

`WorkOrderService.LoadSheetAsync(userId, workYear)`

This preserves:
- employee scope;
- branch/department scope;
- real work-year data;
- real Work Orders;
- real custom-column definitions.

## What is NOT reused

- Tabulator saved column widths;
- Tabulator saved hidden state;
- Tabulator row height;
- Tabulator header height;
- Tabulator font sizing;
- Tabulator grid CSS;
- Tabulator layout assumptions;
- previous Gate 5A UI/CSS/JS.

## RevoGrid baseline rule

The new page starts from RevoGrid Community 4.25.2 behavior.

- Native theme row/header/font dimensions.
- New RevoGrid-only semantic starting column widths.
- Community native `stretch = true`.
- Native range, resize, filter, clipboard and RTL.
- No Save to database.
- No Hide/Show ERP layer yet.
- No custom visual parity work yet.

The purpose is to establish a clean RevoGrid baseline before adding ERP features.

## Route

`/work-orders-revogrid-gate5a`

The production `/work-orders` route remains unchanged.

## Approved year behavior — 2026-08-20

- Every new Work Orders page open starts on the **current Saudi business year**.
- The last manually selected year is **not persisted**.
- During the same open session, the employee can switch to any available year.
- The year selector is re-created after every authoritative server load so the
  visible selector value always matches the dataset currently shown.
- If a year switch fails, the selector is re-created back to the actual loaded year.
- Saudi business year is derived from UTC+3, matching Asia/Riyadh business time.

