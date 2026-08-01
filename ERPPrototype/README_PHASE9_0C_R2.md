# Phase 9.0C-R2 — Observe Mode and Current-Sheet Functional Coverage

## Status
Candidate. Accept only after the Stress suite reports:

- Integration tests: 11/11 PASS
- Browser checks: 33/33 PASS

## Purpose

This patch keeps the normal automated suites fast, while adding an optional
`Observe` mode that slows visible browser actions and displays an Arabic step
banner. It also closes the remaining current-sheet browser scenarios before
financial columns are introduced.

## Added browser scenarios

All Full and Stress browser runs now also verify:

1. A duplicate WorkOrderNumber + WorkTypeCode edit marks one row dirty.
2. Saving the duplicate is rejected and the validation navigator appears.
3. Correcting the duplicate allows a clean save.
4. Deleting one saved row reduces the 1,000-row sheet to 999 rows.
5. Saving and reloading confirms the deleted row does not return.
6. Changing Assignment Date to the previous year marks one row dirty.
7. Saving removes that row from the source year.
8. The destination year contains the moved row and 1,001 total rows.

The Stress suite still performs the 1,000-row insert, Undo, Redo, and final
Undo sequence before these functional mutations.

## Observe mode

Run the full pressure journey slowly and visibly:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Observe mode:

- opens Chromium visibly;
- slows Playwright actions;
- displays an Arabic banner describing the current step;
- pauses after important states such as search, save, 2,000-row insert,
  Undo/Redo, duplicate rejection, delete, and year movement.

It does not change the assertions or make the tests more lenient. Normal
Headless/Headed runs remain fast.

## Production impact

No business rule, migration, database schema, Tabulator production behavior,
or page design was changed. Changes are limited to the E2E test project and
the unified PowerShell test command.
