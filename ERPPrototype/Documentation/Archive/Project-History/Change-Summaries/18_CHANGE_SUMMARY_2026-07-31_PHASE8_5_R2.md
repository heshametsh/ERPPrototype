# 18 — Phase 8.5-R2 Save Reconciliation Without Full Grid Refresh

**Status:** Accepted after focused runtime and performance regression
**Apply over:** Phase 8.5-R1

## What the user experienced

After a full-column Paste and Save, vertical navigation became heavy. Changing to another year and returning made the sheet fast again.

The performance report confirmed the difference:

- Before the year switch, ArrowDown/ArrowUp p95 was around 142–145 ms.
- After returning to the year, ArrowDown p95 fell to about 72.9 ms with no Long Tasks in that measurement window.
- During Save, the browser reapplied 4,952 complete rows to the visible grid and `save.delta.update-rows` alone took about 1.12 seconds.

## Business explanation

The values pasted by the employee were already visible before pressing Save.

Example: the employee pastes a Notes column into 4,952 work orders. After the database accepts the save, the only common server-side change may be an internal version stamp used to prevent one employee from overwriting another employee's newer change.

The grid does not need to repaint Work Order Number, Type, Date, Basket, Status and Notes for every row when those sheet values are already correct.

## What changes now

After Save, the client compares the server result with the values currently visible in the sheet:

- Hidden technical values, such as the concurrency version, are merged into the existing row data without repainting the row.
- A visible cell is refreshed only when the server returned a value different from what the user already sees.
- The list of sheet fields is discovered from the current grid columns rather than hard-coded names, so the same logic can support future custom columns.

## Future custom-column example

A user later adds an Estimated Value column and pastes 4,952 values.

If the server accepts exactly those values, Save updates only the hidden technical version for each record. It does not repaint all visible rows. If the server normalizes one value, only that sheet value is refreshed.

## Required test

1. Paste one full non-identity column across about 4,952 rows.
2. Save.
3. Immediately test ArrowDown and ArrowUp without changing year.
4. Download the performance report.
5. Confirm `save.delta.plan-mutations.updateRows` and `save.delta.update-rows.rows` are near zero when sheet values did not change on the server.
6. Confirm `technicalFieldWrites` is present and identity checks remain zero.
7. Change year and return only as a comparison, not as a required recovery step.

Do not Commit or Tag before this test passes.
