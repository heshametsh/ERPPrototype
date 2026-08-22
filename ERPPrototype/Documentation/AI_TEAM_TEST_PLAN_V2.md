# ERP Prototype — AI Team V2 Qualification Plan

**Status:** test-only; not approved for autonomous runtime implementation.

Goal: prove the local Codex AI Team is useful, independent, evidence-backed, economical, and read-only before it is trusted on real changes.

## What V2 adds

- Deterministic repository Cleanliness Gate before/after every review mission.
- Generic Finding Gate for multiple mission names.
- Deterministic required-reviewer completion gate.
- Wall-clock/role telemetry without inventing token counts.
- Concise user-first Lead output.
- A 10-mission qualification harness under `.ai/test-missions/`.
- Oracle isolation: routing/expected signals are not visible to the router/reviewers until the run is complete.

## Qualification order

1. `AIT-01` — repeat PartialAmount canary without feeding prior results.
2. `AIT-04` — malformed Finding report must be rejected deterministically.
3. `AIT-10` — missing required reviewer must block normal PASS.
4. `AIT-02` — rediscover known multi-cell Delete bug from current code.
5. `AIT-03` — prove Tabulator legacy is not confused with Revo runtime.
6. `AIT-05` — trivial UI request must not summon a full team.
7. `AIT-06` — persistence-sensitive Revo Save review.
8. `AIT-07` — measurable large-grid performance review.
9. `AIT-09` — ignore stale historical routing hints and rediscover current ownership.
10. `AIT-08` — Product & ERP Partner gap review, separate from engineering.

Tests run one at a time from one Codex thread, for example:

`$erp-ai-team test AIT-01`

No qualification test authorizes runtime code changes.

## Trust rule

A single successful canary is insufficient. The team becomes eligible for a tiny real implementation trial only after different mission classes demonstrate:

- useful independent findings;
- deterministic evidence/completion gates;
- unchanged repository state after review;
- sensible specialist routing;
- separation of current code, normative Decisions, legacy behavior, and external product patterns.

## V2.1 stabilization (after AIT-01 and AIT-04 baseline)

Observed baseline before stabilization:

- `AIT-01`: functionally successful but ~31 minutes wall-clock with 3 reviewers.
- `AIT-04`: functionally successful but ~4 minutes despite requiring zero reviewers.
- Codex repeatedly spent time locating a Python runtime before deterministic gates.
- Final evidence was not always persisted as a complete before/after artifact pack.

V2.1 changes the **test harness only**, not reviewer prompts or qualification oracles:

- Windows-native PowerShell gates become the local Codex-App default.
- `AIT-04` and `AIT-10` get a direct deterministic fast path with zero subagents and no Project Brain/document review.
- Every run must leave a temp evidence pack with before/after cleanliness evidence and gate/Lead state.
- Phase timing is recorded so transport/preflight/reviewer/Lead costs can be separated when the app exposes enough information.
- Python remains only where an existing evidence collector specifically requires it (currently the optional `AIT-01` PartialAmount mapper rerun).

The old AIT-01/AIT-04 timings remain the baseline; they are not erased or rewritten after stabilization.
