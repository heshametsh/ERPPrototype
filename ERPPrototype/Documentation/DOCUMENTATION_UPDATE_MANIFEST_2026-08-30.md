# Documentation Update Manifest — 2026-08-30

**Status:** Gate 5B-10 acceptance reconciliation
**Starting repository checkpoint:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**Purpose:** record the accepted Gate 5B-10 implementation and move the active roadmap to snapshot-safe Save without rewriting historical evidence.

## Evidence incorporated

- accepted Gate 5B-10 source and tests.
- Gate 5B-9 real-browser regression PASS.
- Gate 5B-10 real-browser scenarios 01-09 PASS.
- user manual browser acceptance on 2026-08-30.
- Revo Community source/API review used during B10 design.
- Gate 5B-10 failure traces used to remove test races and the unsafe full-column-list repaint approach.

## Current facts recorded

- live `/work-orders` remains Tabulator until Revo cutover.
- isolated accepted Revo route is `/work-orders-revogrid-gate5b10`.
- B10 is implemented as a narrow Revo plugin/semantic extension, not a second full selection engine.
- Revo remains owner of native cell focus/range, keyboard/editing and virtualization.
- whole-row/whole-column selection uses `ClientKey`/`prop` identity.
- Filter pruning, Sort identity preservation, virtualization repaint, right-click preservation and dataset-switch clearing are accepted.
- real Revo DB Save is still not connected.
- next bounded mission is snapshot-safe Save.

## Documents updated

- repository `AGENTS.md`.
- `../START_HERE_ERP_PROTOTYPE.md`.
- `00_DOCUMENTATION_INDEX.md`.
- `01_PROJECT_CONTEXT.md`.
- `03_CURRENT_IMPLEMENTATION.md`.
- `04_ARCHITECTURE_AND_DEPENDENCIES.md`.
- `05_WORK_ORDERS_GRID_BEHAVIOUR.md`.
- `06_REGRESSION_TEST_CHECKLIST.md`.
- `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`.
- `08_DECISIONS_LOG.md`.
- `09_REFACTOR_ROADMAP.md`.
- `10_RELEASE_READINESS_PLAN.md`.
- `46_FINAL_LEAD_REVIEW_2026-08-26.md` post-review status header only.
- `47_GATE5B10_ACCEPTANCE_2026-08-30.md`.

## Historical material intentionally preserved

The 2026-08-29 documentation reconciliation and older audit/handoff sections remain historical evidence for their original checkpoints. They are not rewritten to pretend they described B10 before B10 was accepted.
