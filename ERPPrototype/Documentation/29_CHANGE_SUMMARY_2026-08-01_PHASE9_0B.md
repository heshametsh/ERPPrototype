# Phase 9.0B — Browser Automation Hardening

**Date:** 2026-08-01
**Status:** Implemented candidate; developer-machine acceptance pending
**Base:** Phase 9.0 runtime PASS (`10/10` SQL + `4/4` browser)

## Goal

Turn the first Playwright journey into a durable test platform before adding broader Work Orders scenarios or financial/custom-column features.

## Changes

- Added stable `data-testid` hooks for Login and the primary Work Orders controls without changing visible UI.
- Added reusable `LoginPage` and `WorkOrdersPage` Page Objects.
- Added explicit readiness checks for authenticated navigation and the registered Tabulator table/state.
- Added `Smoke` and `Full` suites; Full is the default.
- Added a shared browser session that owns Chromium launch/install, isolated context, screenshot, trace, and cleanup.
- Added diagnostics for page errors, same-origin HTTP 5xx responses, console errors, and failed requests.
- Retain only the latest 10 `TestArtifacts` run directories.
- Added canonical `Tools/Invoke-ERPTests.ps1`; the Phase 9.0 script remains a compatibility wrapper.

## Scope

Full currently contains nine infrastructure/foundation checks. It does not yet test editing, saving, inserting, deleting, Undo/Redo, Copy/Paste, or duplicate UI handling. Those are the next Phase 9.0C scenarios.

## Production impact

No migration, schema, Work Order business rule, save path, query behavior, or JavaScript behavior changes. Razor receives non-visual test attributes only. The E2E process remains isolated from the developer and production databases.

## Acceptance

From the Solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

Required final markers:

```text
Result: 10/10 passed.
Result: 9/9 browser checks passed.
Phase 9.0B Full browser suite: PASS
ERPPrototype automated verification: PASS
```
