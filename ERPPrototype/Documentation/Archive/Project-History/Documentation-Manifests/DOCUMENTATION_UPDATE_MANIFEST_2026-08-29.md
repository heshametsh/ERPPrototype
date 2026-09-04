# Documentation Update Manifest — 2026-08-29

**Status:** Current documentation reconciliation
**Repository baseline reviewed:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**Purpose:** reconcile canonical/current documentation with the stable Gate 5B-9 repository and record the approved next selection/filter behavior without rewriting historical evidence.

## Evidence reviewed before update

Current repository code/tests:

- `Components/Pages/WorkOrdersRevoGridGate5B7.razor`
- `Components/Pages/WorkOrdersRevoGridGate5B8.razor`
- `Components/Pages/WorkOrdersRevoGridGate5B9.razor`
- `Components/Pages/WorkOrdersRevoGridNativeGate5A.razor(.cs)`
- `wwwroot/js/revoGridGate5B1.js`
- `wwwroot/js/revoGridPersistenceIdentity.js`
- `wwwroot/js/revoGridSelectionContext.js`
- `wwwroot/js/revoGridColumnSelection.js`
- `wwwroot/js/revoGridRowStructure.js`
- `wwwroot/js/revoGridColumnWorkspace.js`
- `wwwroot/js/revoGridStructureCommands.js`
- `wwwroot/js/revoGridStructureMenu.js`
- `ERPPrototype.E2ETests/Gate5B5TraceRunner.cs`
- `ERPPrototype.E2ETests/Gate5B9StructureRunner.cs`
- `ERPPrototype.IntegrationTests/WorkOrderSaveIntegrationTests.cs`
- Git history through `202cf3f`.

## Current implementation facts recorded

- live `/work-orders` remains Tabulator 6.5.0.
- isolated Revo candidate is `/work-orders-revogrid-gate5b9`.
- B7 persistence identity is present, but real Revo DB Save is not.
- B8 selection context is present.
- B9 Structure Workspace/range-fill is present.
- production Revo still imports exact 4.25.2 URLs from jsDelivr; self-hosting remains open.
- no rejected B10 selection implementation is present in the stable checkpoint.

## New approved behavior recorded for the next mission

- Revo remains owner of native cell range/focus/edit/keyboard/virtualization.
- ERP may add semantic Ctrl/Shift whole-row/whole-column selection only.
- Filter removes filtered-out rows from future row-selection scope; clearing the Filter does not auto-reselect them.
- Scroll does not prune selection; Sort preserves stable Work Order identity.
- Delete/Clear/Paste/structural row commands must recheck final row/cell targets against the current filtered result.
- already-dirty changes remain saveable if a later Filter hides their row.
- disjoint Ctrl multi-cell ranges remain postponed.
- B10 acceptance must prove visible selection under virtualization, not just internal store state.

## Documents updated

- `../START_HERE_ERP_PROTOTYPE.md`
- `00_DOCUMENTATION_INDEX.md`
- `01_PROJECT_CONTEXT.md`
- `03_CURRENT_IMPLEMENTATION.md`
- `04_ARCHITECTURE_AND_DEPENDENCIES.md`
- `05_WORK_ORDERS_GRID_BEHAVIOUR.md`
- `06_REGRESSION_TEST_CHECKLIST.md`
- `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
- `08_DECISIONS_LOG.md`
- `09_REFACTOR_ROADMAP.md`
- `10_RELEASE_READINESS_PLAN.md`
- `46_FINAL_LEAD_REVIEW_2026-08-26.md` — post-review execution-status header only; original review findings remain tied to `a74c9c9`.
- repository `AGENTS.md`.

## Historical material intentionally not rewritten

- prior change summaries.
- archived AI-Team/Native workflow evidence.
- old audit reports.
- Grid shootout/lab evidence.
- historical handoff sections below current overrides.
- `46_FINAL_LEAD_REVIEW_2026-08-26.md` findings themselves.

Historical documents remain valid evidence for their original baselines and must not be read as current implementation state when a newer override exists.
