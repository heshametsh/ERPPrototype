# B12 + Gate 5C-1 Acceptance — 2026-09-03

## Status

ACCEPTED OFFICIAL CHECKPOINT

The accepted state now lives in the official Git repository.
The former ERPPrototype_B12_TEST copy is no longer the source of truth.

## Gate 5B-12 — Real Database Save

Accepted behavior:

- Gate 5B-11 snapshot semantics remain the Save foundation.
- Save persists through the existing WorkOrderService and SQL Server.
- Large Save generations use a bounded streamed persistence projection.
- Server results reconcile back to the same ClientKey.
- Newer edits made while Save is active remain Dirty.
- New rows receive database Id and RowVersion after Save.
- Persisted Delete, Undo during Save, and fresh re-add preserve correct identity.
- Cross-year Save requires confirmation and moves the row transactionally.
- Concurrency rejection keeps the employee's Dirty changes.

Reference route:

/work-orders-revogrid-gate5b12

## Gate 5C-1 — Visible Aggregates

Accepted behavior:

- Totals are calculated from RevoGrid visible rows.
- Core Money fields are included.
- Custom Money columns are included automatically.
- Filter Apply/Clear updates visible totals.
- Filter working-snapshot behavior remains unchanged.
- Money edits, Undo/Redo, Insert/Delete, year switch and Save reconciliation stay synchronized.
- Ordinary non-money edits do not introduce a second filter/aggregate model.

Reference route:

/work-orders-revogrid-gate5c1

## Acceptance Evidence

The Employee Real Workday Master passed scenarios 00 through 17 on the official Git branch on 2026-09-03.

Coverage includes:

- Login
- Selection
- Sort and Filter
- Clipboard
- Undo/Redo
- Row structure
- Visible aggregates
- Custom Money
- Validation
- SQL Update
- Save snapshot isolation
- New row Save
- Persisted Delete
- Cross-year Save
- 1,200-row streamed Save
- SQL concurrency rejection
- Arabic UI corruption guard

Result:

EMPLOYEE REAL WORKDAY MASTER: PASS

## Development Rule From This Checkpoint

Future development must continue from the official Git repository.

Do not continue feature development in ERPPrototype_B12_TEST.