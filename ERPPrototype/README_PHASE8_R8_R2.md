# Phase 8.8-R2 — Save Plan Builder

This patch extracts deterministic Work Order save input preparation into `WorkOrderSavePlanBuilder` while keeping authorization, global uniqueness, SQL RowVersion, year-movement execution, add/update/delete, transaction, commit, and rollback together in `WorkOrderService`.

Run from the solution folder:

```powershell
dotnet run --project .\ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Acceptance:

```text
Result: 10/10 passed.
Phase 8.8-R2 automated save safety net: PASS
```

Do not commit/tag until all ten tests pass.
