# Phase 8.6-R1 — Grid Lifecycle Module Extraction

Apply this cumulative patch over the user-tested Phase 8.5-R2 project.

## Business result

The Work Orders sheet now has one explicit lifecycle owner. Changing year or leaving the page uses the same cleanup route before another sheet is created. No business rule or visible grid behavior is intentionally changed.

## Apply

Replace the included files, then run:

```powershell
dotnet clean; dotnet build
```

## Test

Use section Q in `Documentation/06_REGRESSION_TEST_CHECKLIST.md`. Focus on five repeated year switches, leaving and returning to the page, deep-row resize, Copy/Paste/right-click once per action, and no red Console errors.

Do not create a new tag until the focused lifecycle regression passes.
