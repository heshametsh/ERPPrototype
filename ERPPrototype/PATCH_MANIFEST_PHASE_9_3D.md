# PATCH MANIFEST — Phase 9.3D

**Target root:** `C:\Users\SinDbaD\source\repos\ERPPrototype\ERPPrototype`  
**Extraction rule:** replace files directly; the ZIP has no outer project folder.

## Destructive warning

Applying migration `20260805173000_RemoveLegacyWorkOrderStatusAndNotes` permanently deletes all existing values stored in the old `WorkOrders.Status` and `WorkOrders.Notes` columns. This is the approved business decision.

## Scope

- Remove the two fields from database schema and active code.
- Remove their grid columns, filters, validation, dirty tracking, layouts, clipboard/history state, and automated scenarios.
- Keep the seven protected columns only.
- Preserve the Phase 9.3C custom-column lifecycle and Phase 9.3B width behavior.

## Required local gate

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

Expected Integration result: `25/25 passed`.
