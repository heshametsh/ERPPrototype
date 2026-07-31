# Phase 8.8-R1 — Work Order Read Query Extraction

**Status:** Implemented; focused build/runtime regression pending.

## Why this step exists

`Data/WorkOrderService.cs` owned both opening a sheet and the much more sensitive save transaction. The read path is a clean first boundary because it only verifies employee scope and returns available years plus ordered rows.

## What changed

- Added `Data/WorkOrderQueryService.cs`.
- Moved the implementation of both `LoadSheetAsync` overloads into the query service.
- Registered `WorkOrderQueryService` as scoped in `Program.cs`.
- Kept both public `WorkOrderService.LoadSheetAsync` overloads as forwarding facades, so the Work Orders page and code-behind require no change.

## What did not change

- Employee scope criteria: active user, password already changed, Employee role, assigned department.
- Year validation: 2000–2100.
- Available-year query and inclusion of current/requested year.
- Selected-year filter and ordering by `DisplayOrder`, then `Id`.
- Lightweight `WorkOrderSheetRow` projection.
- `open.server.*` performance stage names.
- Save request preparation, field validation, global `(WorkOrderNumber + WorkTypeCode)` uniqueness, year routing, transaction, RowVersion concurrency, deletes, adds, updates, or result mapping.

## Practical example

Opening 2026 now delegates from the existing service facade to Query Service, which returns only the employee department's 2026 rows. Changing Notes and pressing Save still uses the original save implementation and transaction.

## Files

- `Data/WorkOrderQueryService.cs` — new.
- `Data/WorkOrderService.cs` — stable forwarding facade; save implementation unchanged.
- `Program.cs` — scoped DI registration.
- Documentation and focused regression checklist.

## Required test

Run section V in `06_REGRESSION_TEST_CHECKLIST.md`: compare labels, year list, row counts/order, repeated year switching, `open.server.*` stages, one safe Save, and no DI/Console error.

## Rollback

Restore `Data/WorkOrderService.cs`, `Program.cs`, and documentation from `Phase8.7-Stable`; remove `Data/WorkOrderQueryService.cs`. No migration or database rollback is required.
