# 19 — Change Summary — Phase 8.6-R1 Grid Lifecycle Module

**Date:** 2026-07-31
**Status:** Accepted after focused user browser regression
**Base:** Phase 8.5-R2 accepted behavior

## What changed

Created `wwwroot/js/tabulatorLifecycle.js` and moved the existing lifecycle ownership into it without intentionally changing behavior. The module owns:

- grid-session state construction;
- desktop viewport height and page-scroll lock;
- document/window listener cleanup;
- pending timeout and animation-frame cancellation;
- popup/auto-scroll detachment;
- Tabulator instance disposal and public destroy.

`tabulatorTest.js` remains the initializer and feature coordinator.

## Why

Year switching and final page disposal previously depended on lifecycle code mixed inside the large coordinator. A later navigation or resize refactor is safer only after creation and cleanup have one visible owner.

## Work Orders example

When an employee changes from the 2026 sheet to the 2025 sheet, the 2026 sheet must stop listening to Arrow keys, Copy, Paste, right-click, and Resize before 2025 opens. Otherwise one user action could reach an old hidden sheet and the new visible sheet.

## Files changed

- `Components/App.razor`
- `wwwroot/js/tabulatorTest.js`
- `wwwroot/js/tabulatorLifecycle.js`
- project documentation listed in the patch

## Static verification

- Node syntax check passed for all project JavaScript files.
- The public `tabulatorTest` function set remained identical: 41 methods before and 41 after module registration.
- Lifecycle module registered 9 methods.
- Runtime smoke test created the grid state and confirmed `initialize`, `createGridState`, `disposeTableInstance`, and `destroy` remain available.

## Not verified here

- `.NET clean/build` because the execution environment has no .NET SDK.
- Browser behavior, year switching, page navigation, viewport restoration, or lifecycle resource counts.

## Rollback

Restore the files from the Phase 8.5-R2 checkpoint or revert this patch. No database or migration change is included.
