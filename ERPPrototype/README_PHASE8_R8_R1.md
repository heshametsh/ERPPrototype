# ERPPrototype Phase 8.8-R1 Patch

Apply this cumulative patch **over `Phase8.7-Stable` only**.

## Purpose

Extract read-only Work Orders sheet queries into `Data/WorkOrderQueryService.cs` while preserving the existing `WorkOrderService.LoadSheetAsync` facade and every save rule.

## Files to replace/add

- `Program.cs`
- `Data/WorkOrderService.cs`
- `Data/WorkOrderQueryService.cs` (new)
- documentation files included in the patch

## Practical example

Changing year reads employee scope, available years, and ordered rows through Query Service. Editing and saving an order still uses the original WorkOrderService transaction.

## Build

```powershell
dotnet clean; dotnet build
```

## Test

Run section V of `Documentation/06_REGRESSION_TEST_CHECKLIST.md`. Do not Commit or Tag until runtime testing passes.

## Rollback

Restore the replaced files from `Phase8.7-Stable` and remove `Data/WorkOrderQueryService.cs`. No database rollback or migration is required.
