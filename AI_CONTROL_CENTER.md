# AI CONTROL CENTER — ERP Prototype

Purpose: this is the stable reminder/router file for the active chat. It is intentionally small and can be re-uploaded unchanged whenever the user wants to force a memory refresh.

This file is **not** the project state and must not duplicate changing implementation facts.

## Mandatory refresh when this file is received or referenced

Before answering the ERP-project request:

1. Read `AI_CURRENT_STATE.md` completely.
2. Read the latest relevant entries in `ERPPrototype/Documentation/AI_WORK_LOG.md`.
3. Read `AGENTS.md` for the stable engineering and communication contract.
4. If the question concerns Grid behavior/architecture, read the relevant part of `ERPPrototype/Documentation/AI_GRID_REFERENCE_MATRIX.md` and perform the required Tabulator / RevoGrid Community / RevoGrid Pro reference pass.
5. If the question concerns workflow quality or repeated mistakes, inspect `ERPPrototype/Documentation/AI_WORK_METRICS.csv` and `ERPPrototype/Documentation/AI_WORK_CYCLE.md`.
6. Treat the newest user message as the newest authority for product behavior. If it changes an approved decision, synchronize the live state and append a work-log receipt before moving on.
7. If test review exposes a missing or weaker user-visible capability, classify it first as a **test gap**, **parity gap**, or **new product behavior**. Do not implement it inside a test-hardening pass. For an existing Work Orders capability, perform the feature-specific Tabulator/Revo/ERP reference pass and surface the behavior to the user before changing product code.

## Authority order

When information conflicts:

1. Current Git/worktree + current code + executed test evidence.
2. Latest user-approved behavior.
3. `AI_CURRENT_STATE.md`.
4. Current project documentation/decision records.
5. `AI_WORK_LOG.md` chronology.
6. Historical handoffs/chat summaries.

## What each file is for

- `AI_CURRENT_STATE.md` — compact live memory: current mission, approved behavior, implemented/tested/unproven state, protected WIP, open risks, next action. Rewrite and prune it.
- `ERPPrototype/Documentation/AI_WORK_LOG.md` — append-only chronological receipt of important decisions, implementation results, tests, failures, and checkpoints.
- `ERPPrototype/Documentation/AI_WORK_METRICS.csv` — measurements used to learn from multiple missions and improve the workflow.
- `ERPPrototype/Documentation/AI_WORK_CYCLE.md` — the engineering cycle: establish truth → behavior contract → ownership → break pass → smallest slice → evidence → adversarial diff review → manual acceptance → checkpoint.
- `ERPPrototype/Documentation/AI_GRID_REFERENCE_MATRIX.md` — focused comparison record for Tabulator, installed RevoGrid Community, RevoGrid Pro evidence, and ERP ownership decisions.
- `AGENTS.md` — stable rules for engineering, testing, state discipline, and how to explain results to the user.

## Same-chat rule

Do not ask the user to upload all these files repeatedly if they were already made available in the current chat. This control-center file can be re-uploaded periodically as a **refresh trigger**. On receipt, reread the existing live state/log files instead of relying on conversational recall.

If a referenced live file is genuinely unavailable, say exactly which file is unavailable and reconstruct the minimum state from available evidence. Do not pretend it was read.

## State synchronization rule

After every material event — approved behavior, code change, test result, rollback, blocker, scope change, accepted checkpoint, or change in next action — update `AI_CURRENT_STATE.md` and append the material receipt to `AI_WORK_LOG.md`.

Do not treat that two-file update as sufficient when the event changes a canonical project truth. Route the same event to the owning document:

- behavior/business rule → `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` and/or `05_WORK_ORDERS_GRID_BEHAVIOUR.md`;
- accepted architectural/product decision → `08_DECISIONS_LOG.md`;
- test/evidence milestone → `06_REGRESSION_TEST_CHECKLIST.md`;
- Grid/reference status → `AI_GRID_REFERENCE_MATRIX.md`;
- workflow mistake/lesson → `AI_WORK_CYCLE.md`;
- mission closure → one factual row in `AI_WORK_METRICS.csv`.

At checkpoints, prune resolved/superseded detail from `AI_CURRENT_STATE.md`. Do not prune the chronological log.

## Memory integrity gate

At every major evidence milestone, handoff/context export, and before any checkpoint/mission closure:

1. synchronize all affected canonical documents;
2. run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`;
3. if it reports `FAIL`, stop and repair documentation drift before advancing;
4. only a `PASS` allows the workflow to continue.

`AI_CURRENT_STATE.md` is a live snapshot, not chronology. Dated receipts, superseded `PENDING` statements, and old expected test counts belong only in `AI_WORK_LOG.md`.

## If the user asks "ذاكرتك فيها إيه؟"

Answer from the refreshed live state, not from chat recall. Summarize only:

- current mission;
- approved behavior that still matters;
- what exists now;
- what is actually tested;
- what is still unproven/open;
- protected WIP that must not be lost;
- next action.

Keep the answer concise, logical, understandable to a non-programmer, and use a few fuller paragraphs rather than many short stacked lines.

## Communication reminder

Default response style: concise but complete. Explain what happens in the program, why it matters, and the recommended decision. Use concrete ERP examples when useful. Avoid implementation noise, repeated history, and fragmented line-by-line writing unless the user asks for structured detail.
