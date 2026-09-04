# Documentation Update Manifest — 2026-08-26

**Purpose:** Canonicalize the 14-review synthesis, approved Business decisions, current engineering workflow, and the post-review Gate 5B-6 Validation milestone.

## New canonical documents

- `Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`
- `Documentation/46_FINAL_LEAD_REVIEW_2026-08-26.md`

## Current-source reconciliation

Updated current documents:

- `AGENTS.md`
- `START_HERE_ERP_PROTOTYPE.md`
- `Documentation/00_DOCUMENTATION_INDEX.md`
- `Documentation/01_PROJECT_CONTEXT.md`
- `Documentation/03_CURRENT_IMPLEMENTATION.md`
- `Documentation/04_ARCHITECTURE_AND_DEPENDENCIES.md`
- `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
- `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
- `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
- `Documentation/08_DECISIONS_LOG.md`
- `Documentation/09_REFACTOR_ROADMAP.md`
- `Documentation/10_RELEASE_READINESS_PLAN.md`

## Reconciled facts

- 14-review / Final Lead Review evidence remains tied to baseline `a74c9c9`.
- current accepted engineering HEAD is `6a6f3ce`.
- Gate 5B-6 Unified Validation is implemented/accepted.
- next Revo foundation step is persistence identity/`RowVersion`, then snapshot-safe Save and real DB Save.
- the former Native V1 workflow is historical, not an active engineering gate.
- important Grid behavior requires automated real-browser evidence plus the user's manual browser acceptance.

## Separation rule

The documentation distinguishes:

1. current implemented code;
2. accepted target Business behavior;
3. historical review evidence;
4. remaining future work.

This reconciliation changes no application runtime, database migration, or production behavior.
