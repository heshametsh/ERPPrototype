# Phase 9.0C-R1 — Real User Cell Edit Path

This patch changes browser-test infrastructure only.

## Problem

The stress test used Tabulator's internal `cell.setValue()` API after virtual scrolling. Under a 1,000-row dataset the target cell could exist in Tabulator data while its DOM element was not currently rendered, causing Tabulator to try to render into `false`.

## Fix

`WorkOrdersPage.SetCellValueAsync` now follows the real user path:

1. Scroll to the requested row.
2. Wait until the target cell is rendered and connected to the document.
3. Double-click the cell, matching the grid's configured edit trigger.
4. Fill the visible Tabulator editor.
5. Press Enter to commit the edit.
6. Wait until Tabulator data reports the committed value.

No production code, business rule, JavaScript, migration, or database schema is changed.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Headed
```

Expected final result:

```text
Result: 11/11 passed.
Result: 25/25 browser checks passed.
ERPPrototype automated verification: PASS
```
