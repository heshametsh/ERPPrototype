# Patch Manifest — Phase 9.3E

**Purpose:** immutable custom-column types, automatic custom filters / Money sorting, and lightweight persisted Hide/Unhide.

## Database and server

- `Data/ApplicationDbContext.cs`
- `Data/CustomColumnService.cs`
- `Data/DepartmentColumnLayoutService.cs`
- `Data/Entities/DepartmentColumnLayout.cs`
- `Data/WorkOrderService.cs`
- `Migrations/20260805183000_AddDepartmentColumnVisibility.cs`
- `Migrations/ApplicationDbContextModelSnapshot.cs`

## Browser behavior

- `wwwroot/js/tabulatorAggregates.js`
- `wwwroot/js/tabulatorClipboardHistory.js`
- `wwwroot/js/tabulatorColumnLayouts.js`
- `wwwroot/js/tabulatorCustomColumns.js`
- `wwwroot/js/tabulatorFilters.js`
- `wwwroot/js/tabulatorLifecycle.js`

No permanent toolbar control, watcher, polling loop, server round-trip, or new JavaScript bundle is added.

## Automated tests

- `ERPPrototype.IntegrationTests/IntegrationTestRunner.cs`
- `ERPPrototype.IntegrationTests/WorkOrderSaveIntegrationTests.cs`

The Core suite remains 25 cases. Existing custom type-change coverage is converted into an immutability test, and the department layout test now verifies Hide/Unhide persistence and isolation.

## Documentation

- `START_HERE_ERP_PROTOTYPE.md`
- `Documentation/00_DOCUMENTATION_INDEX.md`
- `Documentation/03_CURRENT_IMPLEMENTATION.md`
- `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
- `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
- `Documentation/08_DECISIONS_LOG.md`
- `Documentation/36_CHANGE_SUMMARY_2026-08-04_PHASE9_3A.md`
- `Documentation/38_CHANGE_SUMMARY_2026-08-05_PHASE9_3C.md`
- `Documentation/39_CHANGE_SUMMARY_2026-08-05_PHASE9_3D.md`
- `Documentation/40_CHANGE_SUMMARY_2026-08-05_PHASE9_3E.md`

## Package verification

- `STATIC_VERIFICATION_PHASE_9_3E.txt`
- `SHA256SUMS_PHASE_9_3E.txt`

## Local gate

```powershell
dotnet build ".\ERPPrototype.csproj" --configuration Release

dotnet tool run dotnet-ef database update `
  --project ".\ERPPrototype.csproj" `
  --startup-project ".\ERPPrototype.csproj" `
  --configuration Release `
  --no-build

dotnet run `
  --project ".\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj" `
  --configuration Release
```
