# Phase 8.8-R2A — Work Order Save Integration Safety Net

## Purpose

This patch adds a small executable SQL Server integration-test project before the Phase 8.8-R2 save-planning extraction. It does not change `WorkOrderService`, browser JavaScript, database migrations, or production behavior.

The tests run against a new temporary database with a random name, apply the real project migrations, seed isolated users/departments, call the real `WorkOrderService`, then delete the temporary database.

## Added project

```text
ERPPrototype.IntegrationTests/
```

The project is intentionally a console test runner rather than a new unit-test framework dependency. A failing assertion or database rule exits with code `1`; six successful scenarios exit with code `0`.

## Covered rules

1. An Employee cannot modify a work order in another department.
2. `(WorkOrderNumber + WorkTypeCode)` remains globally unique across departments and years.
3. A stale SQL Server RowVersion is rejected.
4. Assignment Date routes a work order to the matching year.
5. Add + Update + Delete succeed atomically and return consistent saved/deleted records.
6. A forced SQL constraint failure rolls back all updates and additions in the save operation.

## Run

From the ERPPrototype root:

```powershell
dotnet clean; dotnet build; dotnet run --project .\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Expected final output:

```text
Result: 6/6 passed.
Phase 8.8-R2A integration safety net: PASS
```

## Database isolation

Default test server:

```text
(localdb)\MSSQLLocalDB
```

The runner does not use the application database name. It creates a database beginning with:

```text
ERPPrototype_IntegrationTests_
```

and deletes it after the run.

To use another SQL Server instance, define a base connection before running:

```powershell
$env:ERP_TEST_SQLSERVER_CONNECTION = "Server=.;Integrated Security=true;TrustServerCertificate=true"
```

Use `--keep-database` only when diagnosing a failed test:

```powershell
dotnet run --project .\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release -- --keep-database
```

## Acceptance

Do not start Phase 8.8-R2 and do not create a stable tag until all six tests pass on the developer machine.
