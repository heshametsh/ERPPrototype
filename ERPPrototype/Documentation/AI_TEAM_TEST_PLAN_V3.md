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

## V3.1 low-friction / cost-observability refinement

- Every `$erp-ai-team test <id>` must dispatch through `AITeamDispatch.ps1` as the first tool action. The model does not reread AGENTS/SKILL/config/docs before deterministic tests.
- The AI Team evidence root remains outside the repository, but `Setup-AITeamCodexSandbox.ps1` can add that exact directory as a Codex `writable_root` so routine evidence writes do not require repeated approval prompts.
- Blanket auto-review is not enabled by default. It may invoke an approval subagent and is unnecessary when the required write boundary is known precisely.
- Every completed run writes `metrics.json` with orchestration time, phase timings, reviewer/Lead timings, trace event count, artifact count/bytes, and observability warnings.
- Weekly allowance percentage / billable usage is never scraped or guessed by the harness. Record it only if Codex exposes it directly; otherwise treat the product Usage & billing meter as the authoritative external measurement.
- Optimization target: deterministic tests should have zero reviewers/Lead and minimal model preamble. Expensive review missions must justify every selected specialist.

## V3.2 Windows runtime hardening

AIT-04 on commit `c948abf` proved the functional deterministic gates but exposed two harness-runtime defects on the real Windows environment: locale-sensitive timestamp re-parsing during run finalization, and prior reliance on `System.IO.Path.GetRelativePath`, which is not available in Windows PowerShell 5.1/.NET Framework.

V3.2 therefore requires:

- machine timestamps are emitted and normalized as invariant ISO-8601 UTC;
- trace/run duration calculations prefer stored UTC ticks and only fall back to invariant parsing;
- repository-relative paths use a PowerShell-5.1-safe helper;
- finalization failure must never leave a recorded run permanently `RUNNING`; a minimal emergency FAIL closure is required;
- a zero-model local compatibility smoke test validates manifest generation and run finalization before the next qualification test;
- the V3.1 deterministic dispatcher, stable run directory, trace/metrics history, and narrow Codex writable root remain part of the same cumulative patch.

These changes affect the harness only. They do not change any qualification oracle, reviewer conclusion, ERP runtime code, or expected AIT-04 behavior.


## V3.3 — Local-first execution and real usage telemetry

V3.3 changes **where orchestration starts**, not the qualification oracle:

- Normal command: `erp-ai-team test AIT-xx` from PowerShell.
- AIT-04/AIT-10 execute entirely in deterministic PowerShell/Python code. Opening the Codex app is not required and no model call is permitted.
- Review/product tests call Codex CLI only after deterministic preflight proves a model is required.
- Codex CLI is authenticated with the user's ChatGPT plan; API billing is not required for this local path.
- One low-effort router call selects the smallest useful engineering specialist set. Product-mode missions go directly to the Product Partner.
- Selected reviewers run independently; Lead runs only after Finding + Completion gates pass.
- Ordinary `codex exec` is used rather than `codex exec review`, because machine-readable schema validation is part of the harness contract.
- `--json` event logs are kept per model call. `turn.completed` usage is aggregated into `model-usage.json` and `metrics.json` so direct input/cached/output token usage can be measured instead of guessed.
- Weekly allowance percentage is not scraped or inferred. Optional UI snapshots can be recorded manually with `erp-ai-team allowance <remainingPercent>`.

### Why

The V3.2 AIT-04 harness itself completed in about one second, but launching the same deterministic test through a Codex chat still moved the visible weekly allowance. V3.3 reverses control:

`PowerShell dispatcher -> deterministic work -> only then Codex when reasoning is necessary.`

The AI is no longer paid to discover that AI was unnecessary.

### First acceptance sequence

1. Install the local command once with `Setup-AITeamLocalCommand.ps1`.
2. Run `erp-ai-team doctor`.
3. Run AIT-10 locally and verify it produces zero direct model tokens.
4. Before the first model benchmark, install/login Codex CLI once with `erp-ai-team setup-codex`.
5. Record the visible weekly remaining percentage manually, run AIT-02 once, then record the percentage again.
6. Inspect `model-usage.json`, per-role event logs, reviewer durations, routing, and the visible allowance delta before deciding whether the team is economical enough for normal project work.

## V3.3.4 — Structured-output preflight before model allowance

AIT-02 exposed a zero-token API rejection because the router response schema used a `const` without an explicit `type`. V3.3.4 makes schema compatibility a deterministic prerequisite:

- Router, reviewer, Lead, and Product response schemas are validated locally before any Codex process is launched.
- The exact `const-without-type` failure class is kept as a negative compatibility canary.
- Unsupported Structured Outputs constructs used by the harness are rejected locally (`oneOf`, `uniqueItems`, unsupported formats, missing `additionalProperties:false`, or object properties missing from `required`).
- Local business/gate validation remains authoritative for constraints intentionally removed from the model schema, such as routing uniqueness and Product http/https URL checks.
- Usage telemetry distinguishes a Codex process attempt from a completed model turn and from an API rejection before generation.

Qualification rule: if `erp-ai-team doctor` or `Test-AITeamRuntimeCompatibility.ps1` reports a Structured-output schema failure, do not run a model-backed mission until it is corrected.

## V3.3.6 — Historical paid router smoke (superseded by V3.4)

Before the first full model-backed engineering benchmark, use `erp-ai-team smoke-router AIT-02`.

The smoke is intentionally narrower than `erp-ai-team test AIT-02`:

- it performs deterministic suite/mission/cleanliness preflight first;
- it permits exactly one Mission Router Codex attempt;
- it launches zero reviewers and never launches Lead;
- it validates the router Structured Output and local role constraints;
- only after the router returns does the harness evaluate the hidden routing oracle;
- it records direct token/event/timing telemetry and rechecks repository cleanliness;
- a transport/schema failure is FAIL, while a structurally valid router result that misses the hidden routing oracle is PASS_WITH_GAPS so transport cost can be separated from routing quality.

This paid-router smoke was useful to prove transport and revealed the router-cost problem. V3.4 supersedes it: normal routing is local, and the AI router is fallback-only.

## V3.4 routing economy gate

Before another full model-backed qualification mission, run `erp-ai-team smoke-router AIT-02`. In V3.4 this command is a pure local-router smoke: expected route is `change-mapper + revo + regression`, AI fallback must be false, reviewers/Lead must remain zero, and Codex attempts/tokens must remain zero. The Windows compatibility test also evaluates every non-deterministic V3 qualification mission against the hidden routing oracle after local routing and fails before any model launch if the local router regresses.

## V3.4.1 single-reviewer smoke gate
Before the first full multi-reviewer model mission, run one selected reviewer only (for AIT-02, `revo`) with `erp-ai-team smoke-reviewer AIT-02 revo`. This validates reviewer execution, structured output, Finding Gate, evidence anchors, cleanliness, timing, and direct token telemetry while deliberately skipping sibling reviewers and Lead. It is a qualification smoke, not a substitute for the full mission.
