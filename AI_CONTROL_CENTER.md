# AI CONTROL CENTER — ERP Prototype

Purpose: a small router into the live project. It is not project state and must not duplicate changing implementation facts.

## Start every material ERP mission

1. Run `ERPPrototype/Tools/AI/Get-AIContext.ps1` against the live repository.
2. Treat its output as working-memory bootstrap, not as product truth by itself.
3. Resolve any conflict between live Git/code/evidence and narrative memory before modifying anything.
4. Read only the mission-relevant code, tests, decisions, and evidence after bootstrap.

## Authority order

1. Live worktree/current code + executed evidence.
2. Latest user-approved behavior/decision.
3. `AI_CURRENT_STATE.md`.
4. Canonical project documentation.
5. `AI_WORK_LOG.md` chronology.
6. Historical chats/handoffs.

A dirty local worktree is candidate truth until classified. Never overwrite it merely because remote Git is older or cleaner.
## Decision depth follows risk

For high-risk Grid/Save/History/DB/concurrency/year-scope work:

**Behavior -> focused reference -> ownership -> break pass -> user decision -> implementation.**

For Grid reference work, compare only what is relevant:
- accepted Tabulator behavior/reference;
- exact installed RevoGrid Community source/API;
- relevant public Revo Pro UX/architecture concepts;
- ERP's existing owner of the state/behavior.

Pro is an idea/reference source, never a parity target or proprietary implementation source. Routine labels/CSS/test-harness fixes do not require a full reference pass.

## Failure boundary

Before Product edits, apply the single **General modification gate** owned by `ERPPrototype/Documentation/AI_WORK_CYCLE.md`. It chooses evidence by risk instead of creating a new gate framework per feature. Expected is frozen before code changes; defect evidence must be independent of the Product state it judges; the same gate must move RED -> GREEN.

For visible interactions, rendered DOM/geometry + real input is mandatory and Grid/provider/store values are supplementary only. `UNCLASSIFIED` RED blocks Product edits. Two failed Product corrections on one interaction force source/runtime forensics before a third. Keep `AUTOMATION_GREEN`, `MANUAL_PENDING`, and `ACCEPTED` separate.

Classify every red result before changing product code:
`PRODUCT`, `TEST/HARNESS`, `BUILD/STALE`, `TOOLING`, or `ENVIRONMENT`.

Test hardening never authorizes a new employee-visible feature. If automation suggests a product defect, show Expected vs Actual + evidence before changing behavior.

## Memory owners

- `AI_CURRENT_STATE.md` — compact current logical truth.
- `AI_WORK_LOG.md` — material chronology and decision/failure receipts.
- `AI_WORK_METRICS.csv` — one factual row per completed mission.
- `AI_EXECUTION_LOG.csv` - raw per-step local execution telemetry; use it to find time sinks and repeated failure classes without bloating chat context.
- `AI_WORK_CYCLE.md` — permanent execution method and learning rules.
- `AI_LIVE_MEMORY_PROTOCOL.md` — compatibility pointer only; no duplicate rules.
## Learning loop

At mission closure:
1. update Current State only if logical truth changed;
2. append only material Work Log events;
3. add one factual Metrics row;
4. run the memory consistency checker;
5. create the local checkpoint after required evidence and acceptance; push/sync remote state only when the current delivery decision authorizes it.

Do not create a permanent rule from one unusual failure. After five completed Metrics missions, review the pattern and change at most one workflow rule for the next five missions.

## Communication

Default to concise Egyptian Arabic: what happens -> why it matters -> recommended decision. Technical detail stays in the background unless it changes the decision.
