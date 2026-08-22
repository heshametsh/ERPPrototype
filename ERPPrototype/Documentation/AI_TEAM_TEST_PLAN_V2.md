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
