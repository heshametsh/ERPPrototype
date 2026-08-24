# ERP Prototype — Native V1 Agent Entry Point

## Status

Architecture V1 is frozen. This file is the active repository contract for engineering work.

The current code, migrations, tests, and the checked-out Git snapshot are the authority for implemented reality. `ERPPrototype/Documentation/08_DECISIONS_LOG.md` is the normative decision record.

## Active Native V1 surface

Only these AI-engineering pieces are active:

- this file, including the Native V1 risk gate;
- `ERPPrototype/Documentation/08_DECISIONS_LOG.md`;
- `.ai/prompts/native-reviewer-v1.md`, the single neutral reviewer contract;
- `ERPPrototype/Tools/AITeam/NativeV1/NativeV1Receipt.psm1`, which fingerprints Git-visible state and writes Candidate Receipts/events;
- `ERPPrototype/Tools/AITeam/NativeV1/Test-NativeV1.ps1`, deterministic local checks for that small capability.

The former Project Brain, V2/V3 qualification material, routing, Lead, CLI reviewer, sandbox/transport, evidence-pack, collector, learning-engine, database, and dashboard infrastructure is historical only under `ERPPrototype/Documentation/Archive/AI-Team-V3/`. It is not an active dependency and must not be revived as a compatibility path.

The host-protected `.agents/skills/erp-ai-team/SKILL.md` is also deprecated/historical and MUST NOT be used for Native V1 work. It describes the archived legacy AI-team harness, not the active Native V1 contract.

## Before substantial work

Read only the documents relevant to the task, normally beginning with:

1. `ERPPrototype/Documentation/02_AI_DECISION_PRINCIPLES.md`
2. `ERPPrototype/Documentation/03_CURRENT_IMPLEMENTATION.md`
3. `ERPPrototype/Documentation/06_REGRESSION_TEST_CHECKLIST.md`
4. `ERPPrototype/Documentation/08_DECISIONS_LOG.md`

For an independent Native reviewer, use only `.ai/prompts/native-reviewer-v1.md` and the current workspace evidence it names. Do not read archived AI-team reports or use them as hypotheses.

## Native V1 risk gate

1. Capture the full `git rev-parse HEAD` and the Git-visible state before work.
2. Identify the change type and risk in employee/business terms. Do not infer a product rule from code or telemetry.
3. Stop before implementation if the request changes a frozen architecture boundary, security/data/concurrency rule, offline behavior, persistence authority, or user-visible business behavior without an explicit approved decision.
4. Keep one clear owner for each responsibility. Do not add a router, lead, child reviewer, harness, transport, collector, database, dashboard, or replacement framework.
5. Local code may fingerprint state and store supplied observations, but it must not select reviewers, classify findings, accept candidates, or make engineering judgments.
6. After an approved change, run only appropriate deterministic/local checks, compare the final Git-visible state with the captured baseline, and do not run an AI reviewer unless separately requested.

## Candidate Receipt contract

Candidate Receipt is the unit of learning. The writer stores only supplied observations:

`receiptId`, `mission`, `baseSha`, `candidateSha`, `changeType`, `risk`, `mainDecision`, `reviews[]`.

Each review may contain `reviewId`, `protocolVersion`, `requestedReviewerModel`, `actualReviewerModel`, `reviewerResult`, `findingCount`, `findingIds`, `tokens`, `cachedTokens`, `toolCalls`, `time`, and `reviewerThread/session`. Missing telemetry is `null`. Later events are factual records only: `CONFIRMED_FINDING`, `REJECTED_FINDING`, `KNOWN_DEFECT`, and `REQUIREMENT_CHANGED`.

## Protected Work Orders behavior

Unless an approved task explicitly changes it, preserve Excel-like edit, keyboard navigation, range selection, copy/paste, row insert/delete, filtering, sorting, Undo/Redo, Sheet History, Dirty/Baseline separation, year isolation, ERP-owned Remaining Amount rules, server authority, security, RowVersion/concurrency, and the frozen visual baseline.

RevoGrid Community native behavior comes first for grid mechanics. Add ERP-owned logic only for ERP business rules or behavior RevoGrid does not own. Do not modify RevoGrid source. Old Tabulator code is historical context, not design authority for new RevoGrid work.

## Stop conditions

Stop and report before implementation when evidence conflicts on a material rule, the change would replace a working core component, a new dependency/service/framework is proposed, security/data integrity/concurrency/offline behavior could materially change, or a new product decision is required.

Important outcomes must be explained briefly in Arabic with a concrete ERP example. For example: إذا تغيّر صف أمر عمل، فالـReceipt يسجل الـSHA والقرار وما شوهد فقط؛ لا يقرر الكود أن التعديل آمن.
