# Phase 8.8-R2A-R1 — Pending Model Diagnostics

This diagnostic patch does not suppress EF Core's pending-model warning and
does not change the operational database model.

It adds a detailed report to the integration-test runner. When `MigrateAsync`
detects a mismatch between `ApplicationDbContext` and the latest migration
snapshot, the runner prints the exact migration operation types and their
important public properties.

Run from the solution root:

```powershell
dotnet run --project .\ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Send the complete `Pending EF model changes detected...` section. Do not add
or apply a migration until the operation list has been reviewed.
