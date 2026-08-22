# ERP Prototype — AI Team V3 Qualification & Tuning Plan

**Status:** qualification/test-only. No autonomous runtime implementation is authorized.

## Why V3

V2 proved the basic multi-reviewer design and deterministic gates. V2.1 proved a fast deterministic path: AIT-04 dropped from minutes of orchestration overhead to a ~1.4 second harness run.

The next weaknesses are operational visibility and reviewer quality:
- evidence lived in random Temp directories;
- there was no persistent run index or trace;
- a Codex user could not see exactly where time was spent;
- ordinary prompt/config tuning could force unnecessary Skill/restart churn;
- reviewer reports proved evidence *location* but did not force disconfirming checks or coverage disclosure;
- Lead output was not deterministically schema-gated;
- Product Partner had no dedicated structured contract;
- exact routing oracles were unnecessarily brittle.

V3 fixes those without changing ERP runtime code.

## V3 operating goals

1. One Codex command; no manual reviewer chats.
2. Qualification benchmarks start from a clean Git worktree so their evidence is reproducible.
3. Fixed evidence root under `%LOCALAPPDATA%\ERPPrototype\AI-Team`.
4. Every run has `trace.jsonl`, `latest.json`, and persistent `runs-index.jsonl`.
5. Every run records a harness manifest so prompt/config revisions are auditable.
6. Deterministic tests remain true fast paths with zero model reviewers.
7. Reviewers start narrow and expand only when evidence requires it.
8. Zero findings is acceptable; filler findings are not.
9. Every finding includes a disconfirming/challenge check.
10. Lead reopens evidence for material facts instead of trusting persuasive reviewer prose.
11. Product Partner is a separate product-design track and can recommend not building a feature.
12. Qualification routing rewards necessary coverage and economy, not one hard-coded exact team when alternatives are safe.

## Current qualification sequence

1. `AIT-04` — recheck deterministic Finding Gate under V3 run tracking.
2. `AIT-10` — deterministic missing-reviewer gate.
3. `AIT-02` — known multi-cell Delete benchmark.
4. `AIT-03` — legacy contamination trap.
5. `AIT-05` — small-change routing economy.
6. `AIT-06` — Save/data-integrity review.
7. `AIT-07` — performance/measurement review.
8. `AIT-09` — confirmation-bias resistance.
9. `AIT-08` — Product Partner gap review.
10. `AIT-01` can be rerun later as a repeatability benchmark; do not rerun it as generic preflight.

## What to inspect after every run

User-facing summary should always show:
- result;
- observed elapsed time;
- exact evidence directory;
- exact trace path;
- selected reviewers;
- gate status;
- next action.

For tuning, inspect `trace.jsonl`:
- preflight duration;
- routing duration;
- reviewer start/end;
- Finding/Completion Gates;
- Lead;
- cleanliness;
- oracle evaluation.

Do not optimize from one total duration number when phase evidence exists.

## Trust rule

Do not call the team trusted because tests pass. Look for:
- independent rediscovery;
- correct current-vs-decision-vs-legacy separation;
- semantic evidence quality;
- narrow but complete routing;
- no false PASS under missing evidence;
- no repo changes in read-only missions;
- improved or stable review depth while unnecessary context/time falls.

A benchmark failure is useful; do not tune prompts to memorize the oracle answer.
