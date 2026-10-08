# ERP Prototype — Engineering Entry Point

## Bootstrap

Before substantial project work:

- follow `AI_CONTROL_CENTER.md` when available;
- read `AI_CURRENT_STATE.md` and the latest relevant Work Log receipts;
- read live Git for branch/HEAD/status/diff/stashes when repository state matters;
- resolve conflicts in favor of current Git/code/executed evidence and the latest user-approved behavior.

`AI_CURRENT_STATE.md` is logical working memory, not proof of implementation and not a mirror of live Git status.

## Engineering model

Engineering judgment stays with the main reviewer working from the real repository. Scripts, Build, tests, browser automation, and diagnostics are evidence tools; they do not replace judgment.

Before changing code:

- explain employee/business behavior first;
- identify the existing owner of each truth;
- prefer the smallest complete change;
- identify rollback and the evidence needed;
- do not silently invent a new business rule.

### Live-worktree-first modification rule

Before modifying any tracked project file:

- read the exact current file from the authorized live device/worktree and work from that version, never from an old chat snapshot or stale exported copy;
- read live local Git status/HEAD/diff so intentional dirty candidate work is preserved rather than overwritten;
- make the smallest coherent change on top of what actually exists locally;
- use GitHub/remote Git only when the user explicitly asks for it or when a remote accepted-baseline comparison is materially needed; do not fetch remote state as a routine prerequisite;
- after a coherent accepted change and its required evidence, checkpoint it according to the current delivery decision, then synchronize only the memory owners whose logical truth changed.

If narrative memory conflicts with the live local worktree/current code/executed evidence, the live local evidence wins and the memory documents must be corrected.
Keep the workflow proportional to the risk. Do not require preview packages or architecture ceremony for routine test/harness corrections. For Grid/library behavior, inspect version-matched source/API when the design actually depends on that lifecycle or contract.


## Verification

### General modification gate

Before any Product runtime/schema/business edit, use the single project-wide modification gate in `ERPPrototype/Documentation/AI_WORK_CYCLE.md`. The gate is risk-adaptive, not feature-specific: freeze Expected first, prove the current defect with an independent oracle, classify RED before Product code changes, and require the same oracle to move RED -> GREEN.

For employee-visible interactions, internal Grid/provider/store state is never sufficient by itself. Use real browser input plus rendered DOM/geometry tied to stable `prop`/FieldKey identity; measure before/during/after when the interaction can jump on release. Any `UNCLASSIFIED` RED blocks Product edits. Two consecutive failed Product corrections on the same interaction block a third patch until source/runtime forensics is redone.

Keep acceptance states distinct: `GATE_RED`, `AUTOMATION_GREEN`, `MANUAL_PENDING`, `ACCEPTED`. A broad regression does not claim coverage for a focused feature gate it did not actually run.

Classify every red result before changing product code:

- **PRODUCT** — runtime/business defect;
- **TEST/HARNESS** — assertion, fixture, navigation, or test-contract defect;
- **BUILD/STALE** — wrong/stale compiled or loaded artifact;
- **TOOLING** — package/script/probe defect;
- **ENVIRONMENT** — missing/unavailable external runtime or infrastructure.

Do not use one class as evidence for another.

When an automated test appears to expose a **PRODUCT** defect, show the exact Expected vs Actual, the evidence, and the proposed classification to the user before changing product code. If the failure is TEST/HARNESS, BUILD/STALE, TOOLING, or ENVIRONMENT, correct only that layer.

Use the lowest evidence layer that proves the risk, then move upward as needed: build/static → deterministic tests → real SQL/integration → browser E2E → user hands-on acceptance.

For user hands-on runs after source changes, enforce runtime freshness: stop the listener, remove relevant `bin/obj`, build the real project, abort on Build failure, run without `--no-build`, open a new browser tab, and verify loaded JS/Razor version when relevant.

Generated project PowerShell must target Windows PowerShell 5.1 unless a newer runtime is explicitly verified. Packages must preflight root/shell/source/scope before copying and provide rollback on later failure.

## Test/product scope guard

A verification pass may improve tests, diagnostics, fixtures, and documentation. It must not add/remove/redesign employee-visible product behavior.

If test review finds a missing Work Orders capability:

1. stop at the product boundary;
2. classify test gap vs parity/product gap;
3. inspect the exact legacy Tabulator behavior/code/tests;
4. inspect installed RevoGrid Community mechanics and relevant official evidence;
5. explain the recovered behavior to the user and get approval;
6. implement the smallest approved parity slice separately.

## Grid reference rule

For Grid behavior/architecture changes, compare:

1. current Tabulator ERP behavior/code/tests;
2. installed RevoGrid Community integration plus official source/docs/examples;
3. relevant RevoGrid Pro docs/examples, and source only when actual licensed access exists;
4. ERP ownership/business rules.

Prefer native Grid mechanics when they preserve the ERP contract. Do not modify RevoGrid source. ERP owns business semantics, validation, financial rules, Dirty/Save meaning, permissions, persistence identity, business history, and specialist workflows.

## Protected Work Orders behavior

Unless an approved mission changes it, preserve:

- Excel-like edit/navigation/selection;
- Paste and partial-paste-at-end;
- range Clear/Delete/Backspace;
- Insert/Delete rows;
- Undo/Redo and Sheet History;
- Dirty/Baseline separation;
- unified validation and ERP financial/Remaining rules;
- year isolation and server authority;
- RowVersion/concurrency;
- frozen UI dimensions;
- Scroll preserves selection; Sort preserves selected Work Order identity;
- Filter-pruned rows leave row selection and must not be silently targeted by new mutations;
- dirty changes made before a later Filter hides a row remain eligible for Save.

## Review/stop conditions

Use independent hostile review for substantive behavior/data/security/concurrency work when risk justifies it.

Stop before implementation when evidence conflicts on a material rule, a working owner would be replaced, a new dependency/framework is proposed, or security/data/concurrency/business behavior would materially change without user approval.

## Memory discipline

Do not duplicate detailed memory rules here. `AI_CONTROL_CENTER.md` routes the active memory owners, `AI_WORK_CYCLE.md` owns synchronization/closure mechanics, and `AI_LIVE_MEMORY_PROTOCOL.md` remains a compatibility pointer only.

At closure, Current State must be compact, the Work Log must preserve the material receipts, and completed-mission Metrics must exist. Git truth is always read live instead of copied into Current State.

## Communication

Talk to the user in natural Egyptian Arabic by default. The user follows logic well but does not need implementation noise.

Preferred flow: **what happened → why it matters → what decision follows → practical example when useful**.

Keep every fact that changes understanding/risk/decision, remove repetition, distinguish exists/proposed/tested/inferred, and mention low-level file/class detail only when needed for a concrete diagnosis or next action.
