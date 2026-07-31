# Phase 8.6-R2 — Grid Interaction Module Extraction

Apply this cumulative patch over the user-tested Phase 8.6-R1 project.

## Business result

The live Work Orders sheet now has one explicit interaction binding owner. Changing year still disposes the old sheet through Lifecycle, then the new sheet receives exactly one keyboard, clipboard, pointer, context-menu, edit, and resize route.

No business rule or visible interaction is intentionally changed.

## Apply

Replace the included files, then run:

```powershell
dotnet clean; dotnet build
```

## Test

Use section R in `Documentation/06_REGRESSION_TEST_CHECKLIST.md`.

Focus on one action per user command after repeated year switching: Arrow, quick/text editing, Delete, Copy/Paste, Undo/Redo, right-click, Insert/Delete rows, and deep-row Resize. Confirm no `tabulatorInteractions` or red JavaScript error.

Do not create a new tag until the focused interaction regression passes.
