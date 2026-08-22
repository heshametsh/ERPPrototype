---
name: erp-ai-team
description: Orchestrate ERP Prototype product/review missions and V2 qualification tests from one Codex thread. Use native Codex subagents for bounded independent reviewers, deterministic evidence/completion/cleanliness gates, a separate Lead, and concise user-facing results. Review/test mode never modifies runtime code.
---

# ERP Prototype AI Team — Local Orchestrator V2

This skill is the repo-local operating layer for the ERP Prototype AI team.

The user should issue one request in one Codex thread. The parent coordinates the rest. The user must not need to manually open reviewer chats.

## 0. Safety and authority

- Read root `AGENTS.md` first.
- Current checked-out code at the current Git commit is authority for **implemented reality**.
- Approved Decisions are authority for **what should happen**, not proof that it is implemented.
- Review/test missions are strictly read-only for repository files.
- Only a later explicit implementation mission may authorize one Implementer to modify runtime code.
- Maximum **three concurrent reviewer subagents**. No nested subagents.
- Multiple implementation agents are forbidden.

## 1. Supported commands

Interpret these natural forms:

- `$erp-ai-team test AIT-01` — run one qualification mission from `.ai/test-missions/test-suite-v2.yaml`.
- `$erp-ai-team test <id>` — same for any listed V2 mission.
- `$erp-ai-team review <objective>` — run a normal review mission with dynamic routing.
- `$erp-ai-team product <objective>` — use Product & ERP Partner track; do not force engineering reviewers.

If the user says `Run the PartialAmount AI Team Canary`, map it to `AIT-01` for backward compatibility.

Do not run the entire 10-mission qualification suite in one giant invocation. Run one mission at a time so failures are attributable and cost/credit use stays bounded.

## 2. V2 qualification-suite isolation

Router-visible mission inputs live in:

- `.ai/test-missions/test-suite-v2.yaml`

Evaluation-only expectations live in:

- `.ai/test-missions/oracles-v2.yaml`

**Do not read `oracles-v2.yaml` before routing and reviewer completion.** It exists to reduce test contamination. After the mission has completed, the parent may read only the matching oracle entry to score the run.

Before any V2 test mission, run the deterministic suite validator:

- `py -3 ERPPrototype/Tools/AITeam/validate_test_suite.py .ai/test-missions/test-suite-v2.yaml --oracles .ai/test-missions/oracles-v2.yaml`
- fall back to `python` only if `py -3` is unavailable.

If validation fails, stop with `TEST_HARNESS_BLOCKED`.

## 3. Preflight — current commit and Project Brain

Resolve the exact current commit with `git rev-parse HEAD` and retain it for every artifact/finding.

Run Project Brain validator before spawning reviewers:

- `py -3 ERPPrototype/Tools/ProjectBrain/validate_project_brain.py`
- or equivalent `python` command.

For `AIT-01`, also run the deterministic PartialAmount mapper/canary as tooling evidence:

- `py -3 ERPPrototype/Tools/ProjectBrain/change_mapper_v1.py`

Do not pass prior AI-team reports to reviewers. A repeatability test means rediscovering facts independently, not replaying the previous conclusion.

If Python is unavailable, stop rather than silently replacing deterministic gates with LLM judgment.

## 4. Deterministic Cleanliness Gate — mandatory

Before any reviewer/product test starts, capture the repository state to an **OS temporary file outside the repository**:

`repo_state_guard.py capture --repo-root <repo> --output <temp>/repo-before.json`

Use `py -3` or `python`.

The fingerprint covers:
- HEAD;
- staged/unstaged tracked diff against HEAD;
- untracked file paths and content hashes.

This supports a pre-existing dirty working tree: the requirement is **same state after the mission**, not necessarily clean at start.

After all reviewers/Lead finish — and before reporting PASS — run:

`repo_state_guard.py compare --repo-root <repo> --baseline <temp>/repo-before.json`

If it fails, the overall mission verdict is `FAIL` even if reviewer conclusions were good.

Reviewer JSON and temporary Mission artifacts must go to an OS temp directory such as `%TEMP%/erp-ai-team-<mission>-<sha>/`, never into runtime/project files.

## 5. Mission Packet — ephemeral only

Build a compact Mission Packet in parent working context containing:

- mission/test ID and name;
- exact current commit SHA;
- user objective;
- Required Behaviors expressed as employee/program behavior, not guessed technical paths;
- relevant Decision IDs/pointers;
- explicit exclusions;
- preflight status.

The Packet is not Project Brain and is never reused as current truth in a later mission.

Historical ChangeImpact must never be used as a routing hint.

## 6. Dynamic routing

For a normal review mission, choose the **smallest useful** reviewer set from current evidence and risk.

Available engineering specialists:

- `change-mapper` -> `.ai/prompts/change-mapper-reviewer.md`
- `behavior-legacy` -> `.ai/prompts/behavior-legacy-reviewer.md`
- `revo` -> `.ai/prompts/revo-reviewer.md`
- `architecture` -> `.ai/prompts/architecture-reviewer.md`
- `regression` -> `.ai/prompts/regression-reviewer.md`
- `data-integrity-security` -> `.ai/prompts/data-integrity-security-reviewer.md`
- `performance-reliability` -> `.ai/prompts/performance-reliability-reviewer.md`

Product track:

- `product-erp-partner` -> `.ai/prompts/product-erp-partner.md`

Routing principles:

- Tiny isolated visual/text request: do not summon a full specialist team.
- Revo grid mechanics: Revo + regression; add mapper/architecture only when shared path/ownership uncertainty warrants them.
- Validation/shared editing foundation: mapper + architecture + regression, and add Revo/legacy/data integrity only when the mission scope actually needs their evidence. Because max concurrency is 3, use a second targeted review wave only if unresolved evidence requires it.
- Persistence/security: mapper/architecture/data-integrity-security as appropriate.
- Large-grid/reconnect/offline/performance: performance-reliability plus only the relevant supporting roles.
- Product ideation: Product Partner first; engineering starts after behavior is approved.

For V2 test missions, choose reviewers from the mission objective **without reading the oracle**. Record the selected role names in parent context before spawning them. Only after completion may the oracle evaluate routing economy.

## 7. Independent reviewer execution

Spawn selected reviewers concurrently, up to three.

Each child must receive:

- exact mission name;
- exact commit SHA;
- compact Mission Packet;
- its role prompt path;
- explicit read-only instruction;
- no sibling reports;
- no old audit/ChangeImpact routing hints;
- no subagents;
- no web unless that mission explicitly permits it;
- output requirement: one JSON object matching `.ai/schemas/reviewer-findings.schema.json`, maximum 5 material findings.

Do not paste entire documentation files into child prompts. Give pointers; let each role read only what it needs.

Close completed child agents promptly.

## 8. Reviewer completion gate — mandatory

Every role selected by the parent is required unless the Mission Packet explicitly marked it optional **before spawning**.

Before Lead integration, run deterministic completion validation using:

`validate_reviewer_completion.py --required <selected roles...> --passed <roles whose reports passed Finding Gate...>`

If a required reviewer failed or is missing:

- do not create a fake placeholder report;
- do not return normal PASS;
- normally stop before Lead with `FAIL` or `DEGRADED` only when the mission explicitly permits degraded evidence.

## 9. Finding Gate — mandatory

For every returned reviewer report:

1. Write the raw JSON only to OS temp.
2. Run `validate_agent_report.py` with:
   - `--repo-root` current repo;
   - `--expected-sha` exact current SHA;
   - `--expected-mission` exact mission name;
   - `--lead-view` a temp output path.
3. The deterministic gate checks required fields, mission/SHA, and real `file:line` locations.
4. `confidenceTelemetry` is stripped from Lead view.

The gate proves metadata/evidence location exists. It does **not** prove the claim is semantically correct; Lead still interprets evidence.

Confidence telemetry must never be shown to Lead, ranked, or used for acceptance. If retained later for calibration, store it separately from substantive judgment.

## 10. Lead integration

Only after all required reviewers pass Finding Gate and completion gate, spawn a separate Lead Integrator subagent.

Give it:

- `.ai/prompts/lead-integrator.md`;
- exact mission name/SHA;
- validated Lead-view reports only;
- no confidence telemetry;
- no old reviewer report from prior missions.

Lead rules:

- read-only;
- no web unless explicitly required for a product mission;
- no voting;
- reconcile by evidence;
- preserve unresolved disagreement;
- never choose an open business/product behavior for the user;
- return a compact structured result matching `.ai/schemas/lead-report.schema.json` when practical.

Close Lead after completion.

## 11. Telemetry — measure only what is real

At mission start and end, record UTC timestamps in parent context or OS temp and report elapsed wall-clock time.

Record:
- mission ID/name;
- commit SHA;
- selected reviewer roles;
- completed/passed reviewer roles;
- overall wall-clock duration;
- Lead verdict;
- Cleanliness Gate result;
- Finding Gate result;
- routing score when a V2 oracle is evaluated.

**Do not estimate token count or credits.** If Codex directly exposes usage/credits to the parent, it may be copied as observed telemetry. Otherwise report `usageTelemetry: unavailable`.

## 12. Test oracle evaluation — after the mission only

For `$erp-ai-team test AIT-xx`:

After reviewer completion/Lead/Cleanliness Gate, read only that mission's entry from `.ai/test-missions/oracles-v2.yaml`.

Score:

- routing expectation versus roles actually selected;
- success signals versus evidence-backed result;
- whether a false PASS occurred despite missing evidence;
- whether repo state remained unchanged.

Do not rewrite reviewer conclusions to make them match the oracle. A failed benchmark is valuable evidence about the team.

For `AIT-01` repeatability, compare only **material facts/gaps** with the prior human-known baseline after the independent run is complete. Do not feed the prior report into reviewers.

## 13. Deterministic-only test missions

### AIT-04 — malformed Finding Gate

Do not spawn reviewers. Create a deliberately malformed reviewer JSON in OS temp (for example missing `evidence`) and run `validate_agent_report.py`. The test passes only if the gate rejects it and no Lead is spawned.

### AIT-10 — reviewer failure policy

Do not burn model credits merely to crash an Agent. Deterministically simulate selected required roles and a passed set missing one role using `validate_reviewer_completion.py`. The test passes only if the completion gate fails and normal PASS/Lead flow is blocked.

## 14. Product Partner test

For `AIT-08`, use one Product & ERP Partner subagent, not engineering reviewers.

It may use external research only if available and useful, and must separate:
- current ERP Prototype facts;
- user workflow inference;
- external Excel/ERP patterns.

It must be willing to say "do not build this" or propose a simpler feature when justified.

No implementation.

## 15. Parent final response — user-first and concise

For a test/review mission, report in this order:

1. **النتيجة:** PASS / PASS_WITH_GAPS / DEGRADED / FAIL.
2. **المهم للمستخدم:** 2–5 short concrete bullets in business/program behavior.
3. **جودة فريق الـAI في الاختبار:** independence, evidence gate, cleanliness, routing economy.
4. **الوقت:** observed wall-clock duration; usage only if directly available.
5. **القرار المطلوب من المستخدم:** only if one truly exists; otherwise say none.
6. **الخطوة التالية المقترحة:** one next test/fix, not a long roadmap.

Technical evidence can follow only if the user asks or it is necessary to explain a failure.

Never say "no files were modified" unless the deterministic Cleanliness Gate passed.

## 16. Qualification policy before real use

Do not declare the AI Team production-trusted after one good canary.

Run qualification missions one by one. Recommended sequence:

1. AIT-01 repeatability canary.
2. AIT-04 Finding Gate negative test.
3. AIT-10 reviewer-failure gate test.
4. AIT-02 known-bug benchmark.
5. AIT-03 legacy contamination trap.
6. AIT-05 small-change routing economy.
7. AIT-06 Save/data-integrity review.
8. AIT-07 performance review.
9. AIT-09 confirmation-bias resistance.
10. AIT-08 Product Partner gap review.

Only after several different mission types pass should the user consider a tiny real implementation mission.

The purpose of testing is to improve the system, not to force every test to pass.
