# 30 — Change Summary — Phase 9.0C

**Status:** Acceptance candidate
**Date:** 2026-08-01
**Scope:** 1,000-row browser coverage and stress baseline; no production database or business-rule change.

## What changed

- E2E seeding now creates 1,000 Work Orders per year for two years.
- Smoke, Full, and Stress suites run against the same realistic 1,000-row sheet size.
- Full verifies virtual scrolling to row 1,000, search/clear, edit/save/refresh persistence, and 1,000-row year switching.
- Stress inserts 1,000 rows into an existing 1,000-row sheet, then verifies Undo, Redo, and final clean-state restoration.
- Stress writes timing evidence to `phase9-1000-row-stress-metrics.json`.
- SQL integration stress adds, updates, and deletes 1,000 rows through `WorkOrderService`.

## Important boundary

The first Stress run establishes a hardware-specific baseline. Correctness and completion are enforced immediately, but arbitrary performance thresholds are not introduced before real measurements exist.

## Acceptance command

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Headed
```

Expected acceptance markers:

```text
Result: 11/11 passed.
Result: 25/25 browser checks passed.
ERPPrototype automated verification: PASS
```
