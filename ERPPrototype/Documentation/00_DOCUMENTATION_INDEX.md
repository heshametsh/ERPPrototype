# 00 — Documentation Index

**Status:** Current / Approved  
**Last update:** 2026-08-26  
**Current accepted engineering HEAD:** `6a6f3cef807f58a41bcfefa7c08b2ebaf6220169`  
**14-review / Final Lead Review baseline:** `a74c9c908a2372b0e9141dcf7f6ef772bd6c07b3`

## 1. Trust Order

When documents disagree, use this order:

1. **Current code + migrations + tests at the same baseline** — what is actually implemented.
2. `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` — canonical approved Business/Product rules.
3. `46_FINAL_LEAD_REVIEW_2026-08-26.md` — current strategic synthesis and long-term roadmap.
4. `03_CURRENT_IMPLEMENTATION.md` — current implementation snapshot/overrides.
5. `05_WORK_ORDERS_GRID_BEHAVIOUR.md` — engine-independent Work Orders behavior contract.
6. `06_REGRESSION_TEST_CHECKLIST.md` — acceptance/testing contract.
7. `08_DECISIONS_LOG.md` — chronological accepted decisions.
8. `04_ARCHITECTURE_AND_DEPENDENCIES.md` / `09_REFACTOR_ROADMAP.md` / `10_RELEASE_READINESS_PLAN.md`.
9. Historical audit reports, change summaries and archived material.
10. Conversation history — useful context only; settled decisions must be transferred into the documents above.

**Rule:** do not reopen a settled Business question merely because an older audit listed it as unresolved. Check `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` first.

## 2. Start Here

| Document | Purpose |
|---|---|
| `../START_HERE_ERP_PROTOTYPE.md` | current engineering handoff and next step |
| `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` | **business source of truth** |
| `46_FINAL_LEAD_REVIEW_2026-08-26.md` | **long-term product/architecture synthesis** from 14 independent reviews |
| `03_CURRENT_IMPLEMENTATION.md` | what exists in current baseline |
| `05_WORK_ORDERS_GRID_BEHAVIOUR.md` | Work Orders behavior independent of Tabulator/Revo |
| `06_REGRESSION_TEST_CHECKLIST.md` | mandatory regression and real-browser acceptance |
| `08_DECISIONS_LOG.md` | chronological decision record |
| `09_REFACTOR_ROADMAP.md` | current Revo/cutover/ERP roadmap |
| `10_RELEASE_READINESS_PLAN.md` | production qualification gates |
| `13_TECHNOLOGY_EVOLUTION.md` | Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid |
| `ERP_AUDIT_PROTOCOL.md` | independent-review method |

## 3. Current State — 2026-08-26

- `/work-orders` remains live Tabulator route until Revo cutover.
- RevoGrid Community 4.25.2 is the selected replacement.
- isolated Gate 5B-6 contains Change Engine + Sheet History + Dirty + Paste + Range Clear + Filter/Sort + header selection + multi-row Insert/Delete + Remaining synchronization + Unified Validation.
- Range Clear was accepted at `a74c9c9`; Unified Validation was accepted at `6a6f3ce` after automated real-browser and user manual acceptance.
- Revo does **not** yet have production database Save/cutover.
- next major Revo step: **persistence identity/RowVersion**, then snapshot-safe Save contract and real Save.
- long-term direction: fast Master Sheet + one Work Order + specialist sub-workflows + manager control center.
- Business questions previously left open in older audits are now settled in `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

## 4. Historical / Evidence Material

- `11_CHANGE_SUMMARY_...` onward: historical implementation checkpoints.
- `Review/`: prior audit/performance evidence.
- `Documentation/Archive/`: historical workflows and retired AI-team infrastructure.
- `wwwroot/grid-shootout/`: Grid qualification/lab evidence, not production runtime.
- older Gate/lab/event-probe pages are evidence/diagnostics unless current implementation says otherwise.

Do not treat historical/lab artifacts as current production architecture merely because they remain in the repository.
