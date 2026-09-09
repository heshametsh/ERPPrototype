# LIVE AI / CURRENT-STATE ENTRY POINT — 2026-09-06

Before using older handoff sections in this file:

1. read root `AI_CONTROL_CENTER.md`;
2. read root `AI_CURRENT_STATE.md`;
3. read the latest relevant `AI_WORK_LOG.md` entries;
4. use current Git/code/test evidence when narrative text conflicts.

For CC-YEAR-001, user-visible acceptance follows the manual-first rule: user hands-on validation first, assistant/automated closure regression second.

---

# CURRENT DOCUMENTATION GUIDE - 2026-09-04

**Accepted product checkpoint:** `bdc37fe`
**Official source of truth:** current Git repository

Current-state documents:

1. `03_CURRENT_IMPLEMENTATION.md`
2. `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
3. `08_DECISIONS_LOG.md`
4. `09_REFACTOR_ROADMAP.md`
5. `10_RELEASE_READINESS_PLAN.md`
6. `50_B12_GATE5C1_ACCEPTANCE_2026-09-03.md`
7. `51_REVO_GATE_BUG_HISTORY_2026-09-04.md`

Older change summaries, handoffs and audits are historical evidence. They must not override the current B12/5C-1 state when they describe B10/B11, Gate 5A or Real DB Save as future work.

---

# CURRENT DOCUMENTATION CHECKPOINT OVERRIDE - 2026-09-04

**Accepted product checkpoint:** `bdc37fe`
**Accepted documentation checkpoint:** `66a3f03`
**Accepted Revo reference routes:** `/work-orders-revogrid-gate5b12` and `/work-orders-revogrid-gate5c1`

The official Git repository is the source of truth. `ERPPrototype_B12_TEST` is historical review material, not a development source.

Current accepted behavior includes B11 snapshot-safe Save, B12 real DB Save, RowVersion concurrency rejection, edit-while-Save preservation, persisted Delete/re-add identity, cross-year transactional Save, Selection Core V4R3 and Gate 5C-1 visible aggregates.

`51_REVO_GATE_BUG_HISTORY_2026-09-04.md` is the durable problem/root-cause/fix history created before retiring old root Gate/Lab manifest files. Exact original artifacts remain recoverable from Git history.

Older "Current State" sections below that describe B10/B11 as the latest state or Real DB Save as future work are historical.

---

# 00 — Documentation Index

**Status:** Current / Approved
**Last update:** 2026-08-30
**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
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
| `Archive/Project-History/Acceptance-History/47_GATE5B10_ACCEPTANCE_2026-08-30.md` | Gate 5B-10 implementation/acceptance evidence and exact next boundary |
| `03_CURRENT_IMPLEMENTATION.md` | what exists in current baseline |
| `05_WORK_ORDERS_GRID_BEHAVIOUR.md` | Work Orders behavior independent of Tabulator/Revo |
| `06_REGRESSION_TEST_CHECKLIST.md` | mandatory regression and real-browser acceptance |
| `08_DECISIONS_LOG.md` | chronological decision record |
| `09_REFACTOR_ROADMAP.md` | current Revo/cutover/ERP roadmap |
| `10_RELEASE_READINESS_PLAN.md` | production qualification gates |
| `13_TECHNOLOGY_EVOLUTION.md` | Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid |
| `ERP_AUDIT_PROTOCOL.md` | independent-review method |

## 3. Current State — 2026-08-30

- `/work-orders` remains the live Tabulator route until accepted Revo cutover.
- RevoGrid Community 4.25.2 remains the selected replacement.
- accepted isolated Revo candidate is `/work-orders-revogrid-gate5b10` at code checkpoint `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`.
- Gates 5B-7 through 5B-9 remain present: persistence identity, selection context, Structure Workspace, Custom Column structural History and range fill.
- Gate 5B-10 adds Plain/Ctrl/Shift whole-row/whole-column selection without replacing Revo native cell focus/range/keyboard/editing/virtualization ownership.
- row selection is identity-based on `ClientKey`; column selection is identity-based on `prop`.
- Filter-pruning is implemented: filtered-out selected rows leave row selection and are not reselected merely because the Filter is cleared.
- Sort preserves selected Work Order identity; Scroll/virtualization preserves and repaints visible selection.
- right-click inside semantic selection preserves it; year/dataset switch clears it.
- Gate 5B-9 regression + Gate 5B-10 real-browser journey + user manual browser verification all passed before acceptance.
- Revo still has **no production database Save binding or `/work-orders` cutover**.
- next bounded mission is snapshot-safe Save, then real DB Save and end-to-end `RowVersion` concurrency/recovery.

## 4. Historical / Evidence Material

- `11_CHANGE_SUMMARY_...` onward: historical implementation checkpoints.
- `Review/`: prior audit/performance evidence.
- `Documentation/Archive/`: historical workflows and retired AI-team infrastructure.
- `wwwroot/grid-shootout/`: Grid qualification/lab evidence, not production runtime.
- older Gate/lab/event-probe pages are evidence/diagnostics unless current implementation says otherwise.

Do not treat historical/lab artifacts as current production architecture merely because they remain in the repository.

## Latest Accepted Checkpoint

- `50_B12_GATE5C1_ACCEPTANCE_2026-09-03.md` — Accepted B12 Real DB Save + Gate 5C-1 Visible Aggregates official checkpoint.