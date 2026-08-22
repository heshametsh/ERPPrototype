---
name: erp-ai-team
description: Run ERP Prototype AI review/product qualification and real review missions from one Codex thread with dynamic specialists, deterministic evidence gates, persistent run tracking, and one-writer implementation policy.
---

# ERP Prototype AI Team — Orchestrator V3.0

The user issues one command in one Codex thread. The parent orchestrates the team; the user must not open reviewer chats manually.

## 0. Always load current operating config

For every invocation:
1. read root `AGENTS.md`;
2. read `.ai/team-config.json`;
3. use the paths/version from that config for this run.

`SKILL.md` is intentionally stable. Routing tuning, role prompts, schemas, qualification suite/oracles, and most harness behavior live in config/scripts and are read fresh each run. Do not require a Codex restart merely because one of those files changed. A refresh/new thread is only potentially needed when this Skill contract itself changes.

The current workspace snapshot is authority for implemented reality. HEAD commit anchors it; `repo-before.json` fingerprints any pre-existing dirty state. Approved Decisions are normative intent, not proof of implementation.

Review/test/product missions are read-only. Only a later explicit implementation mission may authorize one Implementer to modify runtime code.

## 1. Commands

- `$erp-ai-team test AIT-xx`
- `$erp-ai-team review <objective>`
- `$erp-ai-team product <objective>`
- `$erp-ai-team latest` -> show latest run metadata/path through `AITeamRun.ps1 -Command Latest`

Do not run the whole qualification suite as one opaque batch while the team is still being tuned.

## 2. Immediate dispatch rule

For `test` commands, inspect `.ai/team-config.json` first.

If the requested ID is listed in `qualification.fastDeterministicTests`, do **not** open the suite, Project Brain, project documentation, role prompts, or spawn model agents. Immediately run:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/run_deterministic_test.ps1 -TestId <id> -RepoRoot <repo>`

Report the script result and the printed evidence/trace paths. No extra project search.

This fast path exists because a zero-Agent test must not spend model minutes planning.

## 3. Persistent run lifecycle for non-deterministic missions

Before project investigation, start the tracked run:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamRun.ps1 -Command Start -RepoRoot <repo> -MissionId <id-or-REVIEW/PRODUCT> -MissionName <name> -Mode <review|product>`

Capture the printed `AI_RUN_DIR`. All mission artifacts go there, outside the repository.

The run directory must contain as applicable:
- `run.json`
- `harness-manifest.json`
- `trace.jsonl`
- `mission.json`
- `repo-before.json`
- `routing.json`
- raw reviewer/product reports
- Finding/Product Gate results
- Lead report + Lead Gate
- completion gate
- repo-after + cleanliness
- routing oracle/evaluation for tests
- `phase-timing.json`
- `result.json`
- `summary.txt`

The global state root also keeps `latest.json` and `runs-index.jsonl`.

Trace important phases/roles with:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamRun.ps1 -Command Trace -RunDir <run> -Event <event> -Phase <phase> -Role <role> -Status <status> -Detail <detail>`

Trace start/end, not every file read.

## 4. Qualification isolation

Router-visible missions come from the configured V3 suite. Evaluation-only expectations come from the configured V3 oracle.

Before reviewers:
- run `ValidateSuite` through `AITeamGate.ps1`;
- do not open/read the oracle content in model context.

The deterministic gate script may parse the oracle; that does not expose its contents to reviewers.

Only after reviewer completion/Lead/cleanliness may the parent evaluate that test's success/failure signals. Routing shape should be scored deterministically with `ScoreRouting`.

Historical V2 suite/oracles are benchmark history only.

## 5. Preflight and Cleanliness Gate

For non-deterministic engineering/product missions:

1. resolve full `git rev-parse HEAD`;
2. run Project Brain validation:
   `AITeamGate.ps1 -Command ValidateBrain -RepoRoot <repo>`;
3. capture repository state to `<run>/repo-before.json`:
   `AITeamGate.ps1 -Command CaptureRepo ...`.

For qualification tests, obey `qualification.requireCleanStart` from config (V3 default: true) so benchmark evidence is exactly tied to one commit. Normal review/product missions may start dirty when intentional, but the baseline fingerprint must be carried in the Mission Packet and match at the end.

Do not rerun the Python PartialAmount canary as generic preflight. It is a dedicated trust test only when explicitly requested.

## 6. Mission Packet — small, saved, temporary

Create `<run>/mission.json` matching `.ai/schemas/mission-packet.schema.json`.

Include:
- exact full commit SHA;
- `workspaceFingerprint` from `repo-before.json`;
- objective;
- Required Behaviors in employee/program terms;
- Decision references/pointers only;
- explicit exclusions;
- web policy.

For qualification missions use only router-visible mission information. Do not use oracle content or old AI-team reports.

Validate the saved packet before routing:

`AITeamGate.ps1 -Command ValidateMission -Report <run>/mission.json -ExpectedSha <fullsha> -Output <run>/mission-gate.json`

The Mission Packet is ephemeral. It never becomes project truth and never supplies historical ChangeImpact to a future mission.

## 7. Context economy

Do not read all project docs before routing.

Use:
- `AGENTS.md`;
- the Mission Packet;
- the small Project Brain index/alias data relevant to the objective;
- specific Decision sections referenced by the mission;
- current code discovered from the objective.

Each reviewer applies `.ai/prompts/_reviewer-common.md` plus its role prompt. Initial inspection should normally remain within the configured file budget and expand only for a concrete unresolved dependency/evidence gap.

Saving tokens means avoiding repeated known context, not reducing depth on uncertain/high-risk evidence.

## 8. Dynamic routing

Use `.ai/team-config.json` as the role registry.

Choose the smallest useful specialist set from current evidence/risk. Maximum concurrent reviewers and waves come from config.

Typical logic:
- trivial isolated cosmetic/text change -> no specialist or one targeted reviewer;
- Revo mechanics -> Revo + regression, with mapper/architecture only when shared-path/ownership uncertainty exists;
- cross-layer/shared editing -> mapper + relevant ownership/risk reviewers;
- persistence/security/concurrency -> data-integrity-security plus only needed supporting roles;
- large-grid/reconnect/offline -> performance-reliability plus relevant supporting roles;
- product design -> Product Partner track first; engineering begins only after behavior approval.

Record `<run>/routing.json` with:
- selected roles;
- why each is needed;
- materially plausible roles intentionally excluded and why;
- reviewer count/waves.

For test missions, route from objective only, before any oracle evaluation.

## 9. Independent reviewer execution

Spawn selected engineering reviewers concurrently up to config maximum.

Each receives only:
- exact mission name/full SHA;
- Mission Packet;
- `.ai/prompts/_reviewer-common.md`;
- its role prompt path;
- no sibling reports;
- no prior AI-team reports/old ChangeImpact hints;
- no subagents;
- web only when Mission Packet permits it;
- output schema `.ai/schemas/reviewer-findings.schema.json`.

Trace each reviewer with exact events `REVIEWER_START` and `REVIEWER_END` (role field = selected role) so `trace-summary.json` can calculate per-reviewer wall-clock duration.

Reviewer output rules:
- zero findings is valid;
- maximum configured material findings;
- concrete coverage/unresolved items;
- every finding includes current evidence, impact, concrete verification, and a disconfirming `challenge`.

Close child reviewers promptly.

## 10. Finding Gate and completion

For each raw reviewer JSON written to `<run>/<role>.raw.json`, run:

`AITeamGate.ps1 -Command ValidateReport -Report <raw> -RepoRoot <repo> -ExpectedSha <fullsha> -ExpectedMission <mission> -ExpectedRole <role> -LeadView <run>/<role>.lead.json -Output <run>/finding-gate-<role>.json`

The gate validates:
- schema/required fields;
- exact mission;
- exact full SHA;
- expected role;
- real repository `file:line`;
- non-empty evidence detail;
- duplicate finding IDs;
- coverage shape;
- evidence line digest.

It proves structure/location, not semantic truth.

After all selected roles, run `ValidateCompletion`. Missing required reviewers cannot yield normal PASS and cannot be replaced with fake placeholders.

## 11. Lead — targeted semantic verifier, not voter

Only after Finding + Completion gates pass, trace `LEAD_START`, then spawn Lead with:
- `.ai/prompts/lead-integrator.md`;
- exact mission/full SHA;
- validated `.lead.json` reports only;
- no confidence telemetry;
- no old mission reports.

Lead must reopen at least one cited evidence location for every material agreed fact, and inspect only disputed/high-risk evidence beyond that. It must not reread the whole project.

Lead returns `.ai/schemas/lead-report.schema.json`. Save raw report and run:

`AITeamGate.ps1 -Command ValidateLead -Report <lead.json> -RepoRoot <repo> -ExpectedSha <fullsha> -ExpectedMission <mission> -Output <run>/lead-gate.json`

After Lead returns, trace `LEAD_END` with its gate/verdict status.

No product/business choice is made for the user. If one remains, Lead sets exactly one focused decision question.

## 12. Product Partner track

Product missions use only `product-erp-partner` unless engineering review is separately requested later.

The partner reads current product evidence narrowly, challenges the requested idea, proposes at most four high-value opportunities, includes concrete employee/manager examples, and may explicitly recommend not building something.

When web is allowed, external Excel/ERP patterns must be separated from project facts.

Save the report and validate it with:

`AITeamGate.ps1 -Command ValidateProduct -Report <product.json> -RepoRoot <repo> -ExpectedSha <fullsha> -ExpectedMission <mission> -Output <run>/product-gate.json`

No implementation follows automatically.

## 13. Post-mission gates and test scoring

Before closing any read-only mission:
1. capture current repo state to `<run>/repo-after.json`;
2. compare with `repo-before.json` and save cleanliness result;
3. if qualification test, run deterministic `ScoreRouting` against the hidden oracle after reviewers complete;
4. evaluate success/failure signals without rewriting reviewer conclusions to fit the oracle;
5. save `phase-timing.json` and `result.json`.

A Cleanliness failure forces overall FAIL.

## 14. Telemetry and observability

Record only observable facts:
- orchestration start/end;
- preflight;
- routing;
- each reviewer wall-clock start/end when parent can observe it;
- gates;
- Lead;
- cleanliness;
- selected/completed roles;
- final verdict;
- usage/credits only if Codex exposes them directly.

`trace.jsonl` is the audit trail for "what is it doing now/where did time go?".

Do not infer transport/reconnecting time as reviewer reasoning time.

## 15. Finish every run

Finish with:

`AITeamRun.ps1 -Command Finish -RunDir <run> -Result <...> -Summary <short>`

Even on failure, preserve the run directory and record FAIL/BLOCKED when possible.

Final response to the user must include:
1. النتيجة;
2. أهم 2–5 نقاط في منطق البرنامج;
3. جودة الفريق/gates;
4. observed elapsed time;
5. exact evidence directory;
6. exact trace path;
7. user decision only if one exists;
8. one next step.

The user must never have to search Temp directories to find artifacts.

## 16. Implementation policy

Review/product/test mode never changes runtime code.

A real approved implementation mission uses exactly one Implementer. Reviewers remain read-only. The Implementer receives only approved behavior, current Change Map, scope exclusions, and required verification. No parallel implementation agents.

After implementation: deterministic build/tests first, then targeted independent regression/code review.

## 17. Qualification order

Use the V3 suite one mission at a time:
AIT-01 -> AIT-04 -> AIT-10 -> AIT-02 -> AIT-03 -> AIT-05 -> AIT-06 -> AIT-07 -> AIT-09 -> AIT-08.

Do not call the team trusted after one canary. The purpose is to discover weaknesses and improve the system, not to force PASS.
