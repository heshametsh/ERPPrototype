# AI Work Cycle — ERP Prototype

Purpose: one small repeatable engineering cycle. Git/code/test evidence remains authority; memory records continuity and learning without becoming a second product model.

## Core cycle

### 0. Establish truth

Read Current State, live Git, current code, and the latest relevant executed evidence. State what exists now versus what is only proposed/reported.

### 1. Behavior contract

Describe employee-visible behavior and explicit non-goals before design. Ask the user only when materially different product behaviors remain possible.

### 2. Reference and ownership

For Grid missions, run the focused Tabulator → installed RevoGrid Community → relevant Pro evidence → ERP ownership pass when the behavior/API decision depends on it.

Identify the existing owner of each truth (year/dataset, identity, selection, Dirty/Baseline, History, Save authority, database/concurrency). Reject a second owner unless evidence proves it is necessary.

Do not turn reference research into a blanket implementation gate. Routine test/harness corrections should move directly once their failure class and owner are clear.

### 3. Break pass

Before code, try the mission-relevant failure families: filter/sort/hidden rows, history/baseline, edit-while-save, save failure, concurrency, cross-year, delete/re-add identity, virtualization/large data, partial transaction failure.

Do not mechanically run every family for every mission.

### 4. Smallest complete slice

Map affected runtime/test/migration files and rollback. Implement one independently provable end-to-end slice. Do not mix unrelated cleanup/features.

### 5. Evidence

Use the lowest layer that proves the risk, then continue upward when needed:

1. build/static;
2. deterministic/unit/self-test;
3. real SQL/integration for persistence/transactions/concurrency;
4. browser E2E for user-visible Grid behavior;
5. user hands-on acceptance when required.

A Build PASS is not product acceptance. Automated PASS is not manual acceptance.

When automation appears to expose a PRODUCT defect, stop before changing product code: show the user the exact Expected vs Actual, evidence, and classification. Once the user verifies the product defect, fix the product. If the failure is TEST/HARNESS, BUILD/STALE, TOOLING, or ENVIRONMENT, fix only that layer.

### 6. Hostile review

After green evidence, reread the candidate as a reviewer: behavior contract, duplicate ownership, failure/rollback, migration safety, hidden/filter/sort/history interactions, unnecessary scope, and whether tests prove user behavior rather than implementation detail.

### 7. Full regression / manual acceptance

For Work Orders closure, prefer the existing `Run-ERP-Full-Regression.ps1` after focused evidence. It performs a fresh build and runs the real Employee Workday, Rename focused break suite, B9-B11 regression, B12 real DB Save, and Integration tests. It continues through test-suite failures so one run exposes all failing areas.

### 8. Memory + checkpoint

Synchronize only changed truths, prune Current State, append the Work Log, update Metrics for a completed mission, run the mechanical memory checker, then checkpoint only after required evidence/user acceptance.

## Root-cause guardrails

These are the small permanent rules learned from repeated failures.

### Failure classification first

Every red result is one of:

- **PRODUCT**;
- **TEST/HARNESS**;
- **BUILD/STALE**;
- **TOOLING**;
- **ENVIRONMENT**.

Do not change production behavior until evidence points to PRODUCT.

### Tooling/package discipline

- Prefer an existing deterministic/SQL/browser path over inventing a probe that answers the same question.
- Do not rerun an unchanged failure unless a material input changed.
- After two consecutive Tooling/Package failures on one blocker, stop chaining and re-anchor from exact current Git/status/diff/snapshot.
- Package from the exact reviewed source; use Git logical identity for tracked text when LF/CRLF may differ.
- Normalize Git paths before allowlist/scope comparisons.
- Target Windows PowerShell 5.1 unless otherwise verified.
- Resolve paths from `git rev-parse --show-toplevel`.
- Complete preflight before copy; later failure must roll back.

### Test/harness discipline

- Reuse the approved existing harness/fixtures/page objects/diagnostics before creating a parallel runner.
- Prefer real Playwright mouse/keyboard actions for user behavior; synthetic zero-time DOM event bursts are diagnostics, not user-equivalent acceptance.
- Bind browser diagnostics to the module actually loaded by the page; stale hard-coded cache/version literals are not acceptance evidence.
- Browser readiness should wait for the requested surface/element, not generic `NetworkIdle` when the application keeps live connections.
- Assertions must test the user contract. Do not require browser-internal state such as an empty Selection object when visible/interactive behavior is already the actual contract.
- Shared test databases are shared mutable state: use unique owned state or merge current state; do not assume empty global configuration/exact counts you do not own.
- When schema changes, search direct-SQL fixture writers for affected required columns/keys before browser regression.
- Browser readiness/navigation must follow the active surface and native grid mechanics, not fragile DOM assumptions.
- Test data must come from current product-owned contracts where possible; stale literals are not product evidence.

### Runtime freshness

For manual runs after source changes: stop listener → remove relevant `bin/obj` → fresh Build → do not run after Build failure → run without `--no-build` → new browser tab → verify loaded module/version when relevant.

Controlled automated harnesses may use `--no-build` only after their matching build/configuration gate produced the artifacts they run.

### Scope discipline

Test hardening does not authorize product scope. Missing employee-visible behavior becomes a separate parity/product decision with reference pass + user approval.

### Memory discipline

- Git tells Git; do not mirror live HEAD/CLEAN-DIRTY in Current State.
- Current State contains current logic only; chronology belongs in Work Log.
- New Work Log entries use one structured `Meta:` line.
- Metrics are factual, prospective, and separated by failure class; do not backfill guessed historical numbers.
- The checker is mechanical. Do not add mission-specific product semantics to it.
- Do not create a permanent rule from one unusual event; consolidate at root-cause level.

## Metrics

Use Metrics to compare missions, not to score them. Keep counts factual.

Important fields:

- `ContextRecoveryTurns`, `ProductCorrectionTurns`, `AvoidableClarifications`, `CommunicationCorrectionTurns` — interaction/continuity waste;
- `ReworkLoops`, `ScopeDriftEvents` — design/scope waste;
- `ProductFailures`, `TestHarnessFailures`, `BuildStaleFailures`, `ToolingFailures`, `EnvironmentFailures` — separate failure classes;
- `FirstDefectCatchStage` — earlier is generally better;
- `StateSyncMisses`, `StaleStateCorrections` — memory quality;
- `PackageIterations` — package/tooling churn;
- `RequiredEvidenceComplete`, `ManualAcceptance`, `ReferencePassComplete` — closure context.

Do not judge trend from one row. After five completed missions, compare the rows, identify the single biggest repeated source of waste/risk, and choose at most one workflow experiment for the next five missions.

`ReopenedWithin3Missions` is not a closure-time metric because the future is unknown. Evaluate reopening retrospectively when enough later missions exist.

## Continuity

A new chat starts from a fresh context package when local reality changed or referenced files are unavailable. Read Current State first, then live/exported Git evidence, then only mission-relevant code/docs.

During the same chat, reread the compact state and latest relevant log before substantial new work. If frequent rereads become expensive, prune Current State rather than skipping the gate.
