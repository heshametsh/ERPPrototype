# Phase 9.2D2-R2 — Performance Active-Position Fix

## Scope

This cumulative hotfix is applied after Phase 9.2D2 and Phase 9.2D2-R1.

## Changed file

- `ERPPrototype.E2ETests/PerformanceBaselineBrowserTest.cs`

## Problem fixed

The Arrow performance run visibly reached row 1,000, but the harness reported that it had not reached the end region.

The harness was reading `state.activeCell`, which is refreshed by pointer selection but can remain stale while Tabulator moves the active range by keyboard. The visible selection was correct; only the harness position detector was wrong.

## Fix

Keyboard position is now derived from Tabulator's current active range (`getRanges()` / `getBounds()`), with `state.activeCell` retained only as a defensive fallback.

## Runtime impact

None. This patch changes the E2E performance harness only. Application runtime, database, migrations, and production JavaScript are unchanged.

## Required verification

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```
