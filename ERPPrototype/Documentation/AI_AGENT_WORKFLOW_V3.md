# ERP Prototype — AI Agent Workflow V3.2

**Status:** Approved MVP design under live validation  
**Scope:** Entire ERP Prototype project  
**Principle:** tools collect facts; AI interprets them; the user owns product decisions; one implementer writes runtime code.

## 1. Two separate tracks

### Product track — permanent Product & ERP Partner
The Product Partner works with the user before engineering when product behavior is still open.

Its job is to:
- challenge and improve proposed features;
- proactively identify missing capabilities and workflow gaps;
- compare relevant behavior with Excel and established ERP products when useful;
- explain alternatives in employee/manager behavior, not implementation jargon;
- recommend removing/simplifying a feature when a better product design exists.

It does not choose implementation architecture and does not write runtime code.

V1 proactive triggers are event-based, not automatic analytics:
- start of a new module;
- completion of a meaningful module/feature cluster;
- after roughly 3–5 related features in one area;
- a repeated employee workflow explicitly reported by the user;
- a design question where external Excel/ERP patterns may materially improve the product.

Do not build usage analytics only to trigger this Agent in V1.

### Engineering track — after desired behavior is clear

`Request -> Current-code Change Map -> Mission Routing -> Independent Specialist Review -> Deterministic Finding Gate -> Lead synthesis -> User decision when needed -> Single Implementer -> Deterministic Verification -> Independent Review -> Project Brain Update`

### V3.2 operational observability

Every non-trivial AI-team mission is also a tracked run outside the repository.

Default state root:
`%LOCALAPPDATA%\ERPPrototype\AI-Team`

Each run owns a stable evidence directory with:
- exact commit and harness/prompt hashes;
- Mission Packet;
- routing decision;
- reviewer reports/gates;
- Lead/Product report gates;
- repo-before/repo-after cleanliness evidence;
- `trace.jsonl` for phase/role start-end events;
- timing/result/summary.

`latest.json` points to the current/latest run and `runs-index.jsonl` keeps historical run metadata. This is operational telemetry, not Project Brain/product truth.

The goal is to optimize the phase that is actually slow instead of guessing from one total Codex duration.

### Stable Skill, live tuning files

`.agents/skills/erp-ai-team/SKILL.md` is the stable orchestration contract.
`.ai/team-config.json`, role prompts, schemas and harness scripts are read fresh for each mission.

Ordinary role/routing/prompt tuning should not require restarting Codex. A refresh is only potentially needed when the Skill contract itself changes.

### Reviewer quality contract

Independent reviewers share `.ai/prompts/_reviewer-common.md`:
- start narrow; expand only for a concrete evidence gap;
- zero findings is acceptable;
- every material finding must include a disconfirming/challenge check;
- coverage/unresolved scope is explicit;
- current `file:line` evidence is required before a current-code fact reaches Lead.

Lead does not merely trust schema-valid evidence metadata. It reopens at least one cited source for each material agreed fact to perform a targeted semantic evidence check.

## 2. Project Brain — source of reusable knowledge, not an Agent

The Project Brain prevents every Agent from rediscovering stable project knowledge.

### Human/normative documentation
- `08_DECISIONS_LOG.md` — what the system **should** do; full decision meaning and rationale.
- behavior/ownership documents such as `05_WORK_ORDERS_GRID_BEHAVIOUR.md` — human-readable contracts.

### Machine-readable V1 data
Under `Documentation/brain/`:
- `decisions-index.yaml` — pointer/index only; it never repeats decision text;
- `field-aliases.yaml` — logical field identities across C#, JSON/JS, RevoGrid and database names.

V1 uses JSON-compatible YAML to avoid a YAML parser dependency while keeping one human-readable structured file.

### Single-source rule
The full decision text exists once in `08_DECISIONS_LOG.md` under a stable neutral ID such as `DEC-040`.
Structured files only index/reference it.

Do not encode mutable classification in the ID. Use separate scope metadata instead.

### Decision versus implementation reality
A Decision is normative and stays valid until explicitly superseded.
`lastKnownImplementation` is only the last verified implementation state at a specific commit.

Example:
- Decision: invalid Work Orders values may remain visible but Save is blocked (`DEC-040`).
- Implementation reality: the unified RevoGrid client validation foundation may still be planned.

Tests/current-code review prove whether current code still implements a Decision; the Brain does not continuously re-verify itself.

### Partial migration
V1 Decision Index migration is deliberately incremental.
If `migrationStatus` is `partial`, absence from the index is **not** proof that no decision exists. Fall back to `08_DECISIONS_LOG.md` for areas not yet indexed.

Do not block the first Canary on a big-bang migration of all historical decisions.

## 3. Commit binding

Every Change Map, Finding, Mission Packet, review artifact, alias verification and implementation observation records the Git commit SHA it was produced from.

Evidence from an older commit is historical evidence only; it is never silently treated as current proof.

Historical ChangeImpact is never used as a starting hint for a new Change Map. Each mission rediscovers current impact from current code to avoid confirmation bias.

## 4. Tool-assisted Change Mapper

The Change Mapper is an evidence collector/interpreter pair, not a dependency oracle.
It must start from repository evidence, not memory or an old Change Map.

Depending on the mission it inspects:
- C# entities/services/DTOs/page/component code;
- Razor components;
- JavaScript modules/events;
- RevoGrid columns/field keys/event bridges;
- EF Core configuration/migrations;
- Save/persistence paths;
- automated tests;
- documentation/manifests as context/evidence;
- Git diff/history when relevant.

### Repository-zone distinction
Search hits are not automatically dependencies.
The Mapper must distinguish at least:
- current/shared runtime code;
- RevoGrid target runtime;
- current/legacy Tabulator reference;
- labs/probes/shootout files;
- tests/verification;
- documentation/context;
- migration/database history.

Example: a `PartialAmount` hit in `grid-shootout/` is evidence/history, not a production dependency.

### Field alias resolution
One spelling is insufficient across layers.
`field-aliases.yaml` supplies last-known identities such as:
- C#: `PartialAmount`;
- JS/JSON/RevoGrid: `partialAmount`;
- database: `PartialAmount`.

The Registry assists discovery but never overrides current code.

### Alias mismatch rule
Interpret alias mismatches against the Mission Packet required behaviors:
- if the missing mapping prevents proving a path required by the mission, stop that engineering path and resolve it first;
- if the required path is already proven and the mismatch is outside it, report a warning.

DecisionScope alone is not sufficient to decide blocking because a required behavior may depend on a derived field outside the narrow product scope.

### Canary before trust
Initial Canary: `PartialAmount`.

The Mapper must demonstrate the known path across expected layers, including model/query/page mapping/Revo column/change bridge/browser financial rule/server financial validation/database/test evidence.

A documented implementation gap is not a Mapper failure. Example: Gate 5B-5 explicitly has no real database Save binding yet. The Mapper should report that gap instead of inventing a dependency.

If a known implemented layer is missed, the Mapper is not trusted for routing yet.

## 5. Mission Router / Orchestrator

The Orchestrator selects the **smallest useful** specialist set after seeing current-code evidence.
It does not run every specialist every time.

Examples:
- text/color-only change -> Implementer + targeted verification;
- Work Orders grid mechanics -> RevoGrid + Change Risk/QA, plus Architecture when shared ownership changes;
- Validation foundation -> Behavior/Legacy + RevoGrid + Architecture + Change Risk/QA + Data Integrity when Save rules are involved;
- persistence/security -> Architecture + Data Integrity/Security + Change Risk/QA;
- large-grid/reconnect/offline -> Performance/Reliability plus relevant architecture/data specialists.

Token budget grows with uncertainty/risk/evidence conflict, not a fixed allowance per Agent.

If reviewers conflict, open a small challenge review on the disputed fact only instead of rerunning the whole project review.

## 6. Specialist pool

Specialists are role templates invoked only when relevant:
- Product & ERP Partner;
- Behavior & Legacy Reviewer — ERP behavior + Tabulator lessons; Tabulator is never new-design authority;
- RevoGrid Specialist — Community native behavior/source + official Pro architecture/docs where relevant;
- Architecture & Code Quality Reviewer — duplication, unclear ownership, patch stacking, wrong boundaries, needless complexity;
- Change Risk & QA Reviewer — regression map before change and targeted verification after it;
- Data Integrity & Security Reviewer;
- Performance & Reliability Reviewer.

Independent reviewers use the same commit snapshot and do not read each other's findings before completing their own review unless explicitly assigned synthesis.

## 7. Finding Contract — deterministic gate before Lead context

Required fields:
- `FindingId`
- `CommitSha`
- `Claim`
- `Evidence`
- `Impact`
- `Verification`

A Finding does not enter Lead context if any required field is empty.

`Evidence` must contain at least one concrete source such as repository file:line/symbol, test result/name, database/schema evidence, RevoGrid source/docs, or a reproducible runtime observation.

The gate is deterministic code/schema validation. It proves only that evidence metadata exists; AI still judges meaning.

### Confidence telemetry
Agent self-reported confidence is **not** evidence and is not an acceptance rule.
If captured, it is telemetry only and must be hidden from the Lead during substantive judgment to reduce anchoring.
Evaluate calibration later per specialist when that specialist has enough real outcomes; do not use one fixed mission count for all roles.

## 8. Decision handling

The Lead synthesizes evidence-backed findings and presents material product choices to the user in business terms.
The user owns behavior/business-rule/product-semantic decisions.

### DecisionScope versus ChangeImpact
Do not store one broad generic `Tags` concept.

- `DecisionScope` = the durable functional meaning of the Decision (areas/components/logical fields). It is selected explicitly and stored in the Decision Index.
- `ChangeImpact` = what the implementation/current code touched at that commit. It belongs to the Mission/Change Map snapshot, not the permanent Decision entry.

Never reuse old ChangeImpact as a hint for a new mission.

### Conflict check in V1
Before recording a new Decision, retrieve existing indexed decisions that share relevant DecisionScope and compare them explicitly.
If the Decision Index is still partial, also inspect the Decisions Log for that area.

Do not claim automatic semantic conflict detection in V1.

## 9. Mission Packet — temporary mission context only

A Mission Packet is ephemeral and must never become a source of product truth.
It contains:
- current base/commit;
- approved Decision IDs;
- Required Behaviors expressed as behavior, not presumed technical paths;
- relevant Brain facts/pointers;
- current Change Map;
- confirmed risks/findings;
- required verification;
- explicit scope exclusions.

Example:
`RB-01: When PartialAmount is invalid against WorkOrderValue, RemainingAmount must display blank. SourceDecision: DEC-040.`

The Mapper discovers the current technical path required to satisfy `RB-01`; the Packet must not pre-bake an old implementation route.

After the mission, the Packet may remain as historical evidence but must never be consulted as the current product rule instead of its source Decision.

## 10. Single Implementer

Only one implementation Agent may modify runtime code for an approved mission.
It must not broaden product behavior without returning to the Decision gate.

Reviewers are read-only.

## 11. Post-change verification

Use deterministic tools first where they are stronger than LLM judgment:
- build/compiler;
- unit/integration/E2E tests;
- database/schema checks;
- browser/runtime diagnostics;
- security/dependency tooling when relevant;
- `git diff` and changed-file inspection.

Then run an independent targeted code/regression review on changed code and current mapped dependents.

A green build is evidence, not proof of correct product behavior or architecture.

## 12. Project Brain update — one transaction

After an approved change passes verification:
1. record the final commit/SHA in mission evidence;
2. add/update full Decision text in `08_DECISIONS_LOG.md` only when a product/architecture Decision changed;
3. update the matching `decisions-index.yaml` entry in the **same Brain update**;
4. update field aliases only when current-code evidence proves the identity changed/was discovered;
5. keep DecisionScope durable; keep ChangeImpact with the mission snapshot;
6. explicitly compare touched Decision scopes for conflict;
7. run the deterministic Project Brain validator;
8. CI must run the validator so correctness does not depend on someone remembering a local script.

The validator checks structure/references/IDs/required metadata. It does not perform semantic conflict detection.

## 13. Deferred from MVP

Do not initially build:
- autonomous Evidence Judge Agent;
- proof/result cache that skips future reviews;
- automatic semantic decision-conflict engine;
- usage analytics solely for Product Partner triggers;
- a large Agent dashboard/platform;
- all-specialists-on-every-change orchestration;
- Markdown/YAML generators where one structured V1 file is sufficient.

Reconsider only after real missions show measurable need.

## 14. MVP success criteria

Use the workflow on 5–10 real project changes and measure:
- Change Map recall against known cross-layer dependencies;
- `PartialAmount` Canary completeness;
- stale/missing alias warnings and whether blocking classification was correct;
- Findings rejected mechanically for incomplete evidence;
- regressions caught before user testing;
- repeated context/tokens avoided by Brain routing;
- unnecessary specialists avoided;
- stale/conflicting decision records discovered during explicit scope comparison.

The system succeeds when repeated discovery falls while review depth stays equal or improves.

## 15. Initial Canary — PartialAmount

At baseline `04e0f1a`, the first test is intentionally smaller than the full Validation feature.

Expected current-code evidence includes:
- `WorkOrder.PartialAmount` entity/model;
- field registry/query path;
- Revo page row mapping to `partialAmount`;
- Revo column definition;
- Revo change bridge;
- browser derived Remaining rule;
- server financial validation;
- database constraint;
- integration tests.

The Canary must also recognize the documented Gate 5B-5 persistence gap: real Revo database Save/cutover is not implemented yet. Reporting that as a documented gap is success; inventing a Save path is failure.

## V3.3 execution refinement — local dispatcher owns cost

Normal AI-Team execution now begins outside the Codex desktop conversation:

1. `erp-ai-team` is a user-local PowerShell command installed once from the repository.
2. The deterministic dispatcher reads only machine config/suite metadata.
3. Deterministic missions run without starting Codex at all.
4. Model missions require Codex CLI authenticated through ChatGPT. The harness, not a parent chat, invokes model work.
5. A low-effort router selects the smallest engineering specialist set; product missions route directly to Product Partner.
6. Independent reviewers run read-only and concurrently up to the configured limit.
7. Finding/Completion gates run before Lead. Failed/missing reviewers cannot be replaced with placeholders.
8. Codex CLI JSON events are saved per call and direct token usage is aggregated. Weekly allowance percentage remains an external UI signal and is never guessed.
9. The same run directory retains routing, model events, model usage, gates, Lead/product output, cleanliness, trace, metrics, and final result.

This changes the control direction from `Codex -> discover whether AI is needed` to `deterministic harness -> invoke Codex only when AI is needed`.
