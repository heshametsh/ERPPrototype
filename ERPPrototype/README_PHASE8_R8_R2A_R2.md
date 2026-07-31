# Phase 8.8-R2A-R2 — Integration Identity Model Configuration Fix

## Problem confirmed

The integration runner created `ApplicationDbContext` directly with only SQL Server options. `IdentityDbContext` obtains `IdentityOptions.Stores.SchemaVersion` from EF Core's **application service provider** while building its model. Without that provider, Identity fell back to schema Version1.

The production application explicitly uses:

```csharp
options.Stores.SchemaVersion = IdentitySchemaVersions.Version3;
```

The last migration snapshot was therefore correct. The six reported operations (drop `AspNetUserPasskeys` and widen Identity columns) were false differences caused only by the standalone test harness.

## Fix

`ERPPrototype.IntegrationTests/IntegrationTestDatabase.cs` now creates a small application service provider containing the same Identity schema Version3 option and passes it through `UseApplicationServiceProvider(...)` before constructing the test DbContext.

The provider is disposed when the isolated test database finishes. The pending-model diagnostic remains active and will still stop the run if a real model/migration drift exists later.

## Not changed

- No migration was added or edited.
- No real database is updated.
- No production `Program.cs`, `ApplicationDbContext`, `WorkOrderService`, page, or JavaScript file changed.
- Passkey support and current Identity column lengths remain intact.

## Run

From the solution folder:

```powershell
dotnet run --project .\ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Expected final result:

```text
Result: 6/6 passed.
Phase 8.8-R2A integration safety net: PASS
```
