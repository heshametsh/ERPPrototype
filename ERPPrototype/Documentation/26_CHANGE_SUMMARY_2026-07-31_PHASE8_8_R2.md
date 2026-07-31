# Phase 8.8-R2 — Work Order Save Plan Extraction

**Date:** 2026-07-31
**Status:** Accepted; automated runner passed 10/10 on the developer machine
**Base:** Phase 8.8-R1 plus user-passed Phase 8.8-R2A safety net

## Goal

Separate deterministic input preparation from authorized transactional database execution without changing save behavior.

## New boundary

`Data/WorkOrderSavePlanBuilder.cs` now owns:

- validating the selected work year;
- normalizing changed-field sets;
- preserving all `Id == 0` rows and deduplicating repeated negative temporary Ids;
- ignoring completely blank new rows;
- separating new, existing changed, and existing deleted records;
- rejecting changed/deleted overlap;
- normalizing identity digits and editable text;
- validating required values, lengths, basket, and assignment year;
- rejecting missing/invalid RowVersion before database access;
- returning `WorkOrderSavePlan` or an existing `WorkOrderSaveResult` failure.

## Still atomic inside WorkOrderService

- employee authorization and department scope;
- global duplicate detection and the database unique index;
- loading current update/delete entities;
- database RowVersion enforcement;
- destination DisplayOrder queries;
- applying year movement and editable fields;
- add/update/delete persistence;
- one transaction, commit, rollback, and database error mapping.

The execution section from DbContext creation through persistence/catches is unchanged except that the shared target-year helper is called from the builder.

## Automated safety net

The runner now contains ten tests:

- four direct save-plan tests;
- the original six real SQL Server integration tests.

Acceptance requires `Result: 10/10 passed.` No manual grid retest is required because R2 changes no page, JavaScript, query, database schema, or visible behavior.

## Next

After 10/10 PASS, Phase 8.9 performs final consolidation, documentation cleanup, complete automated/manual regression selection, and the final Phase 8 stable checkpoint. No further WorkOrderService R3/R4 split is planned.
