# Phase 8.7-R2 — Save Request and Result Separation

**Date:** 2026-07-31
**Base:** `Phase8.7-R1-Stable`
**Status:** Accepted after focused build and runtime regression.

## What the employee sees

No intentional change. Save, duplicate rejection, year movement, new-row identity, deletion, Arabic messages, and performance measurements must remain the same.

## Why this step exists

R1 put the whole save journey in one file. R2 separates two different business questions inside that journey:

1. **What will be saved?** Read dirty/deleted rows, reject a blank new row or invalid date, then classify Added / Changed / Deleted and destination year.
2. **What happened after the service call?** Translate duplicate or concurrency results, map temporary rows, remove moved/deleted rows, merge saved versions, and create the final status message.

## Work Orders examples

### Notes edit

Request preparation creates one changed-row request containing the changed field. Result preparation sees the saved record, updates the internal row version, and keeps the visible Notes value already shown in the sheet.

### Duplicate pair

The service remains the authority that rejects the global pair. Result preparation maps that decision to Work Order Number and Work Type cells and creates the same Arabic message.

### New row

Request preparation classifies the temporary row as Added. After persistence, result preparation maps the negative temporary Id to the real database Id and prevents a duplicate visible row.

### Assignment Date in another year

Request preparation records the destination year. Result preparation removes the row from the current sheet, updates the available-year list, and creates the same moved-row success message.

## Files

- Modified: `Components/Pages/WorkOrders.Save.cs`
- Added: `Components/Pages/WorkOrders.SaveRequest.cs`
- Added: `Components/Pages/WorkOrders.SaveResult.cs`
- Updated: project documentation and regression checklist.

## Non-goals

- No database or migration change.
- No `WorkOrderService` contract change.
- No JavaScript change.
- No permission, uniqueness, concurrency, routing, field-level, or message change.
- No performance optimization claimed by this extraction.

## Acceptance

Run section T in `06_REGRESSION_TEST_CHECKLIST.md`. Roll back if any employee-visible result, row identity, year destination, error marking, stage name, or persistence result differs from R1.
