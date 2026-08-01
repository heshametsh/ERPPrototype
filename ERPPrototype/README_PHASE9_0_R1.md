# Phase 9.0-R1 — E2E Database Seed Fix

## Purpose

Fix the isolated browser-test database setup after the migration has already inserted the four standard department types.

## Changes

- Reuse the existing standard Connections department type instead of inserting a duplicate row.
- Delete the temporary E2E database automatically if migration or seed setup fails, unless diagnostic `--keep-database` mode was requested.

## Production impact

None. This patch changes only the E2E test database setup. It does not modify migrations, production data, work-order behavior, or the web UI.

## Verification

From the solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

Expected final result:

```text
Result: 10/10 passed.
Phase 8.8-R2 automated save safety net: PASS
Result: 4/4 browser checks passed.
Phase 9.0 browser automation foundation: PASS
Phase 9.0 automated foundation verification: PASS
```
