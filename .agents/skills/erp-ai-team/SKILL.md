---
name: erp-ai-team
description: Orchestrate ERP Prototype product/review missions and V2 qualification tests from one Codex thread. V2.1 stabilizes the harness with Windows-native deterministic gates, fast deterministic-only tests, evidence packs, and phase timing while preserving reviewer prompts/oracles. Review/test mode never modifies runtime code.
---

# ERP Prototype AI Team — Local Orchestrator V2.1 (Stabilized Harness)

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

Before any V2 test mission, use the Windows-native deterministic gate entry point:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command ValidateSuite -Suite .ai/test-missions/test-suite-v2.yaml -Oracles .ai/test-missions/oracles-v2.yaml`

Python versions remain fallback/reference only. Do not spend model time rediscovering a Python runtime merely to run deterministic gates.

If validation fails, stop with `TEST_HARNESS_BLOCKED`.

### 2.1 V2.1 fast dispatch

After reading root `AGENTS.md` and this skill, if the command is `AIT-04` or `AIT-10`, **do not read project docs, Project Brain, reviewer prompts, or spawn any model agent.** Immediately run:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/run_deterministic_test.ps1 -TestId <AIT-04|AIT-10> -RepoRoot <repo>`

The script owns suite validation, repo-before/repo-after evidence, the negative gate, Lead-not-started evidence, oracle routing check, phase timing, and final result. The parent only reports the script result. This fast path exists to prevent a zero-Agent test from consuming minutes of LLM planning.

## 3. Preflight — current commit and Project Brain

Resolve the exact current commit with `git rev-parse HEAD` and retain it for every artifact/finding.

Run Project Brain validation with the Windows-native deterministic gate before spawning reviewers:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command ValidateBrain -RepoRoot <repo>`

For `AIT-01` only, the existing PartialAmount mapper/canary remains a Python tool. `AIT-01` already has a qualification baseline, so do not rerun it merely as preflight for unrelated tests. If `AIT-01` is explicitly rerun and no Python runtime is available, stop that canary rather than replacing the mapper with LLM judgment.

Do not pass prior AI-team reports to reviewers. A repeatability test means rediscovering facts independently, not replaying the previous conclusion.

## 4. Deterministic Cleanliness Gate — mandatory

Before any reviewer/product test starts, create one **OS-temp evidence directory outside the repository** and capture repository state through:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command CaptureRepo -RepoRoot <repo> -Output <temp>/repo-before.json`

The fingerprint covers HEAD, tracked/staged working state, and untracked file paths/content hashes. A pre-existing dirty tree is allowed; the requirement is the **same state after the mission**.

After reviewers/Lead finish, capture/compare again and persist the evidence:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command CompareRepo -RepoRoot <repo> -Baseline <temp>/repo-before.json -Output <temp>/repo-after-and-cleanliness.json`

If it fails, the overall mission verdict is `FAIL` even if reviewer conclusions were good.

Every run must leave an auditable temp evidence pack containing, when applicable: `repo-before.json`, repo-after/cleanliness result, routing, each Finding Gate result, completion gate result, Lead started/not-started state, phase timing, and final result. Reviewer JSON and Mission artifacts remain outside the repository.

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

Before Lead integration, run deterministic completion validation through the Windows-native gate:

`powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command ValidateCompletion -Required <selected roles...> -Passed <roles whose reports passed Finding Gate...> -Output <temp>/completion-gate.json`

If a required reviewer failed or is missing:

- do not create a fake placeholder report;
- do not return normal PASS;
- normally stop before Lead with `FAIL` or `DEGRADED` only when the mission explicitly permits degraded evidence.

## 9. Finding Gate — mandatory

For every returned reviewer report:

1. Write the raw JSON only to OS temp.
2. Run the Windows-native Finding Gate:

   `powershell -NoProfile -ExecutionPolicy Bypass -File ERPPrototype/Tools/AITeam/AITeamGate.ps1 -Command ValidateReport -Report <raw.json> -RepoRoot <repo> -ExpectedSha <sha> -ExpectedMission <mission> -LeadView <lead.json> -Output <temp>/finding-gate-<role>.json`

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

At mission start and end, record UTC timestamps and persist phase timing in the temp evidence pack.

Record at minimum:
- mission ID/name and commit SHA;
- preflight duration;
- routing duration;
- reviewer batch wall-clock duration (and per-reviewer duration only when Codex exposes it reliably);
- Finding/Completion Gate duration;
- Lead duration;
- final cleanliness duration;
- selected/completed reviewer roles;
- Lead verdict;
- Cleanliness/Finding results;
- routing score when a V2 oracle is evaluated.

A visible Codex `Reconnecting` period is transport/UI telemetry, not automatically reviewer reasoning time. Do not invent a split if the app does not expose it.

**Do not estimate token count or credits.** If Codex directly exposes usage/credits to the parent, copy only observed values. Otherwise report `usageTelemetry: unavailable`.

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

Use the V2.1 fast deterministic runner only. No reviewers, Lead, Project Brain reading, or model reasoning beyond dispatch. The test passes only if the actual Windows-native Finding Gate rejects the malformed report, Lead remains not-started, and repo-before/repo-after match.

### AIT-10 — reviewer failure policy

Use the same V2.1 fast deterministic runner. Do not burn model credits merely to crash an Agent. The actual completion gate receives a required set with one missing reviewer; normal PASS/Lead flow must remain blocked and repo state must match.

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

## 15.1 V2.1 stabilization boundary

V2.1 deliberately changes **harness execution only**. It does not change reviewer prompts, test mission objectives, oracles, or known benchmark answers. This prevents overfitting the team to AIT-01/AIT-04.

If a new harness optimization would alter what a reviewer is asked to conclude, defer it until after the next independent benchmark.

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
