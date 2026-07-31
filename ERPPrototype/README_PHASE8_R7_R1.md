# ERPPrototype Phase 8.7-R1 Patch

Apply over `Phase8.6-R2-Stable`.

This patch extracts the existing Blazor save workflow into `Components/Pages/WorkOrders.Save.cs`. It does not intentionally change runtime behaviour.

## Work logic

When the employee presses Save, one file now owns the complete journey: read changed rows, prepare additions/updates/deletions, call the service, map duplicate or concurrency errors, move orders between years, merge returned rows, and show the final Arabic message.

Page opening and year switching remain in `WorkOrders.razor.cs`.

## Build

```powershell
dotnet clean; dotnet build
```

Then run section S in `Documentation/06_REGRESSION_TEST_CHECKLIST.md`. Do not commit or tag until runtime tests pass.
