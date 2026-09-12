# AI CONTROL CENTER — ERP Prototype

Purpose: stable router for project continuity. It is not project state and must not duplicate changing implementation facts.

## Refresh order

Before a material ERP answer/action:

1. Read `AI_CURRENT_STATE.md`.
2. Read the latest relevant `ERPPrototype/Documentation/AI_WORK_LOG.md` entries.
3. Read live Git when repository state matters: branch, HEAD, status, diff, stashes.
4. Read only the canonical code/docs needed by the current mission.
5. For Grid behavior/architecture, perform the focused Tabulator → installed RevoGrid Community → relevant Pro evidence → ERP ownership reference pass.
6. For workflow/learning questions, read `AI_WORK_METRICS.csv` and `AI_WORK_CYCLE.md`.

## Authority order

1. Live Git/worktree + current code + executed test evidence.
2. Latest user-approved behavior/instruction.
3. `AI_CURRENT_STATE.md`.
4. Canonical project documentation/decisions.
5. `AI_WORK_LOG.md` chronology.
6. Historical handoffs/chat summaries.

## Memory roles

- `AI_CURRENT_STATE.md` — compact logical state only. No mirrored live Git HEAD/status.
- `AI_WORK_LOG.md` — append-only chronology and failure/decision receipts.
- `AI_WORK_METRICS.csv` — factual per-mission learning data.
- `AI_WORK_CYCLE.md` — one compact engineering cycle and root-cause guardrails.
- `AI_LIVE_MEMORY_PROTOCOL.md` — synchronization/closure rules.
- `AI_GRID_REFERENCE_MATRIX.md` — focused Grid comparison record.
- `AGENTS.md` — stable engineering/communication contract.

## Material-event rule

A user-run command/package/test result, behavior decision, code change, rollback, blocker, scope correction, or checkpoint is a material event.

Before another modifying candidate:

- classify the result;
- re-anchor from the actual result and current Git;
- if automation suggests a PRODUCT defect, show Expected vs Actual and evidence to the user before changing product behavior;
- update Current State when current truth changed;
- append a Work Log receipt;
- update the canonical owner only when that owner's truth changed.

After two consecutive Tooling/Package failures on the same blocker, stop chaining packages and require a fresh exact-state status/diff/snapshot before a third candidate.

## Product/test boundary

Test hardening does not authorize employee-visible product changes. If a missing capability is found, classify it separately; for existing Work Orders behavior, recover the Tabulator/Revo/ERP contract and get user approval before runtime implementation.

## Acceptance and closure

Automated PASS never implies user hands-on acceptance.

At a major evidence milestone, handoff, checkpoint, or mission closure:

1. prune Current State to current truth;
2. synchronize only affected canonical owners;
3. run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`;
4. for a completed mission, require one factual Metrics row;
5. stop on checker `FAIL`.

The checker is a mechanical guardrail, not a second source of product truth.

## Communication

Default to concise Egyptian Arabic with cause/effect first: what happened, why it matters, and what decision follows. Do not dump implementation detail unless it materially changes the decision.
