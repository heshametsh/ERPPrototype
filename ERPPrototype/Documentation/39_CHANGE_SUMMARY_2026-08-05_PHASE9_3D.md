# Phase 9.3D — Remove Legacy Status and Notes

**Date:** 2026-08-05  
**Status:** Accepted — Release Build PASS, destructive migration applied, and SQL Server Integration `25/25` PASS.

## Final business decision

The Work Orders sheet has seven protected business columns only:

1. Work Order Number
2. Work Type
3. Assignment Date
4. Work Order Value
5. Partial Amount
6. Remaining Amount
7. Basket

Every other department-specific field must use the custom-column system. The two legacy free-text fields are removed rather than migrated into custom columns.

## Destructive schema change

Migration `20260805173000_RemoveLegacyWorkOrderStatusAndNotes`:

- drops both legacy columns from `WorkOrders`;
- permanently deletes their existing values;
- deletes obsolete saved width rows for their old field keys.

The Down migration can recreate empty columns, but it cannot restore deleted values.

## Code removal

The legacy fields are removed from:

- EF entity, model configuration, and model snapshot;
- query and save DTOs;
- field registry, normalization, validation, and update application;
- Blazor request/result mapping;
- Tabulator columns, filters, dirty tracking, clipboard snapshots, validation, layouts, and row defaults;
- Integration/E2E seed data and scenarios;
- current implementation and regression documentation.

## Verification gate

1. Release Build passes.
2. Apply the migration to the real development database.
3. Core Integration suite reports `25/25 passed`.
4. Open Work Orders and confirm only the seven protected columns plus department custom columns are present.
