# Phase 9.0 — Browser Automation Foundation

**Date:** 2026-07-31
**Status:** Implemented candidate; developer-machine acceptance pending
**Base:** `Phase8.9-Stable`

## Goal

Create the first repeatable browser journey before adding the remaining Work Orders sheet features, so future changes are protected by visible user-flow checks rather than repeated manual tours.

## Added

- `ERPPrototype.E2ETests`: standalone .NET 10 console project.
- Microsoft Playwright 1.61.0.
- A temporary SQL Server/LocalDB database helper using the real migrations and Identity Schema Version 3.
- Deterministic E2E seed data: Employee scope plus current-year and previous-year rows.
- A local Release web-process host on a random loopback port.
- Browser journey: Login → Work Orders → branch/department scope → current year → previous year.
- Success screenshot; failure screenshot and Playwright trace.
- `Tools/Invoke-Phase9Foundation.ps1`: one command for the existing 10 integration checks plus the four browser checks.

## Isolation

The runner supplies a unique temporary connection string through environment variables. It does not read or write the normal development database. The app process is stopped before the temporary database is deleted.

## Production impact

Normal environments are unchanged. `Program.cs` skips HTTPS redirection only when `ASPNETCORE_ENVIRONMENT=E2ETest`, because the disposable loopback process uses a random HTTP port. No Work Order business rule, migration, JavaScript module, or normal page behavior changed.

## First-run dependency

Playwright requires a matching browser binary. If Chromium is not present, the runner uses Playwright's official install API to place it in the current user's Playwright browser cache. The browser binary is not committed and is excluded from clean source archives.

## Acceptance

From the Solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

Required final markers:

```text
Result: 10/10 passed.
Result: 4/4 browser checks passed.
Phase 9.0 automated foundation verification: PASS
```

Do not commit or tag Phase 9.0 until the developer-machine run passes.
