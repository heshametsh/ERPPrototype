# Phase 8.8-R2A — Work Order Save Integration Safety Net

**Date:** 2026-07-31  
**Status:** Implemented; runtime execution pending  
**Base:** User-tested Phase 8.8-R1 project

## Why this step exists

The remaining `WorkOrderService` refactor touches the most sensitive business boundary: authorization, global uniqueness, SQL Server RowVersion, year routing, add/update/delete, and one transaction. Manual grid regression proves the employee workflow, but it cannot reliably prove cross-department requests, stale concurrent writes, or whole-transaction rollback.

R2A adds a narrow safety net before moving any save-preparation code.

## What was added

A standalone executable project:

```text
ERPPrototype.IntegrationTests/
```

It references the real application project and uses:

- the real `ApplicationDbContext`;
- the real SQL Server provider;
- the real migrations;
- the real `WorkOrderService` and `WorkOrderQueryService`;
- a temporary isolated database with a random name.

No production service, migration, JavaScript module, page, or business rule was changed.

## Covered scenarios

1. Employee update against another department is rejected and leaves the row unchanged.
2. Global duplicate identity is rejected across a different department and year.
3. A stale RowVersion cannot overwrite a newer database value.
4. Assignment Date moves the record to its destination WorkYear.
5. One request can add, update, and delete and returns consistent results.
6. A forced SQL constraint failure returns Database failure and rolls back every update/add in the same save.

## Build isolation

Because SDK projects include `**/*.cs` recursively, `ERPPrototype.csproj` explicitly excludes `ERPPrototype.IntegrationTests` source/content. The web application therefore does not compile or publish the test runner.

## Run command

```powershell
dotnet clean; dotnet build; dotnet run --project .\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Acceptance requires:

```text
Result: 6/6 passed.
Phase 8.8-R2A integration safety net: PASS
```

## Next step

After R2A passes, Phase 8.8-R2 may extract only pure input normalization, validation, and save-plan preparation. Authorization, global duplicate checks, RowVersion, SQL queries, transaction, persistence, commit, and rollback remain together inside `WorkOrderService`.
