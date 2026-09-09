# AI Live Memory Protocol — ERP Prototype

Purpose: keep active project truth synchronized without relying on conversational recall.

## Control center + live memory + canonical owners

Root `AI_CONTROL_CENTER.md` is the stable refresh/router.

`AI_CURRENT_STATE.md` is the compact current snapshot. It is rewritten and pruned.

`AI_WORK_LOG.md` is chronological and append-only during an active mission.

Material truth also has canonical owners:

- behavior/business rule → `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` and/or `05_WORK_ORDERS_GRID_BEHAVIOUR.md`;
- accepted decision → `08_DECISIONS_LOG.md`;
- test/evidence milestone → `06_REGRESSION_TEST_CHECKLIST.md`;
- Grid/reference status → `AI_GRID_REFERENCE_MATRIX.md`;
- workflow lesson → `AI_WORK_CYCLE.md`;
- mission closure metrics → `AI_WORK_METRICS.csv`.

## Before every ERP-project response/action

1. Follow `AI_CONTROL_CENTER.md` when available.
2. Read `AI_CURRENT_STATE.md`.
3. Read the latest relevant `AI_WORK_LOG.md` entries.
4. Apply the newest user message as the newest behavior authority.
5. Recover missing material facts from Git/code/test evidence instead of guessing.

## After every material event

Update `AI_CURRENT_STATE.md` and append `AI_WORK_LOG.md`.

When the event changes a canonical behavior/decision/test/reference/workflow truth, update the owning document in the same step.

## Manual-first acceptance

For user-visible ERP behavior, after the candidate is safe to open, record the user's hands-on result before assistant/automated closure regression. Safety/read-only/backup checks may precede manual use when they protect real data. Automated PASS evidence does not imply manual acceptance.

## Cross-document integrity gate

After a major evidence milestone, before handoff/context export, and before checkpoint/mission closure:

1. synchronize all affected canonical documents;
2. run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`;
3. stop on `FAIL`;
4. even after structural `PASS`, perform a semantic scan for contradictory active acceptance surfaces, superseded pending gates, and encoding corruption;
5. corruption detection must ignore historical examples inside Markdown code spans/blocks while still rejecting the same corruption in live prose.

## Pruning

At checkpoints, remove superseded proposals, solved blockers, obsolete pending evidence, and duplicated chronology from `AI_CURRENT_STATE.md`.

Keep chronology in `AI_WORK_LOG.md`.

## External local changes

The assistant cannot detect edits made on the user's machine outside the current tool environment. Refresh reality with Git status/diff or a new context package whenever local code changes.

## Measurement

Count `StateSyncMisses` when an already-approved active fact was omitted from Current State.

Count `StaleStateCorrections` when Current State or a canonical owner is found to disagree with current Git/code/test evidence.

## Periodic reminder upload

During the same chat, the user may re-upload only `AI_CONTROL_CENTER.md` to force a refresh from the already-available live state/log. A full package is needed again only when referenced files are unavailable, a new chat starts, or local project code changed outside the assistant-visible state.
