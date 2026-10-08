# AI Work Cycle — ERP Prototype

Purpose: one small repeatable engineering cycle. Git/code/test evidence remains authority; memory records continuity and learning without becoming a second product model.

## Core cycle

### 0. Establish truth

Read Current State, live Git, current code, and the latest relevant executed evidence. State what exists now versus what is only proposed/reported.

### 1. Behavior contract

Describe employee-visible behavior and explicit non-goals before design. Ask the user only when materially different product behaviors remain possible.

### 1.5. General modification gate - mandatory before Product edits

This is one project-wide gate, not a feature-specific gate. Before changing Product runtime/schema/business behavior, freeze the expected employee-visible contract and prove the current defect or missing contract with independent evidence.

1. **Choose the proof class from the risk** - Visual Interaction, Validation, Persistence/Transaction, State/History, Security/Authorization, or Ownership/Schema. Use the lowest independent oracle that can actually disprove the Product behavior.
2. **RED before Product edit** - when fixing a defect, add or reuse test-only evidence that fails on the current Product for the decided contract. If the reported defect cannot be reproduced, do not edit Product code; investigate the oracle/environment first.
3. **Independent oracle** - the acceptance oracle must not merely read the same internal state the Product path writes. A self-confirming store/provider assertion may supplement evidence, but cannot close employee-visible behavior by itself.
4. **Visual interaction rule** - Resize/Drag/RTL/Scroll/Selection/Focus/Clipboard/render-lifecycle gates must use real browser input and rendered DOM/geometry. Bind the actual visible control/boundary to stable `prop`/FieldKey identity and measure the user-relevant result. When timing matters, capture before, during, and after the gesture/MouseUp. Internal Revo provider/store values are diagnostic/state evidence only, never the sole rendered-behavior oracle.
5. **Validation rule** - exercise the same boundary values through client and server authority; include valid edges plus invalid calendar/type/business cases relevant to the contract.
6. **Persistence rule** - prove database/RowVersion/transaction state independently and, when user-visible, reload the Product surface. In-memory Dirty/state alone is not persistence evidence.
7. **State/History rule** - prove both History/Baseline state and the resulting visible/business state. Do not accept counters alone when the employee-visible result can diverge.
8. **Security rule** - prove both allow and deny paths using fresh authoritative account/permission state; UI visibility alone is not authorization evidence.
9. **Ownership/schema rule** - prove the unwanted owner is absent and the intended owner remains authoritative, then run behavior regression for the affected path.
10. **Same gate RED -> GREEN** - freeze Expected before Product edit. The same employee contract/oracle that proves RED must turn GREEN after the correction; do not rewrite Expected to fit the implementation.
11. **Unclassified means stop** - any `UNCLASSIFIED` RED blocks Product edits for that mission until classified as PRODUCT, TEST/HARNESS, BUILD/STALE, TOOLING, or ENVIRONMENT with evidence.
12. **Two Product failures means freeze** - after two consecutive Product corrections on the same interaction/contract fail or create a new interaction defect, no third Product patch. Return to source/runtime forensics and the original behavior contract first.
13. **Regression truthfulness** - a Full Regression may be called coverage for the changed feature only if it actually invokes that feature's focused gate. Otherwise report both truths separately: focused gate status and broader regression status.
14. **Acceptance states are explicit** - `GATE_RED` -> `AUTOMATION_GREEN` -> `MANUAL_PENDING` (when hands-on is required) -> `ACCEPTED`. Never collapse Automation Green into Manual/Final acceptance.

For employee-visible interaction work, manual acceptance happens immediately after focused Automation Green unless the user explicitly chooses to defer it. If deferred, keep the feature at `MANUAL_PENDING` and do not describe it as accepted.

### 2. Reference and ownership

For high-risk Grid behavior/API decisions, run the focused legacy Tabulator → exact installed RevoGrid Community version/source → relevant PUBLIC RevoGrid Pro docs/demos/APIs → ERP ownership pass. Pro is a design/UX/architecture reference only; never assume proprietary source or chase parity for its own sake.

Identify the existing owner of each truth (year/dataset, identity, selection, Dirty/Baseline, History, Save authority, database/concurrency). Reject a second owner unless evidence proves it is necessary.

Do not turn reference research into a blanket implementation gate. Routine test/harness corrections should move directly once their failure class and owner are clear.

#### Framework/library interaction forensics gate

For employee-visible behavior that depends on RevoGrid or another external framework/library (resize, RTL, scroll, virtualization, selection, clipboard, rendering lifecycle, etc.), complete this gate before a Product edit:

- Inspect the **exact installed version/source** first. Use current upstream/main/public docs only to detect later fixes or supported concepts; never silently substitute newer behavior for the installed runtime.
- Trace the full path from user gesture to final render/state: DOM/control → library event lifecycle → provider/store → identity/index translation → dimension/viewport → render/persistence boundary. Do not stop at the first plausible implementation detail.
- Define the mission identity/index glossary before coding. Stable business identity is `FieldKey`/Revo `prop`; numeric indexes must be named by meaning (`source/physical`, `virtual/visible`, `viewport/render`) and must never be mixed. Resolve transient indexes at the point of use after Hide/Unhide/rebuild instead of retaining them as identity.
- Prefer **Native interaction ownership** when the library already provides the gesture/render loop. ERP should add business policy at supported before/after/commit hooks. Intercept per-frame pointer/mouse movement only when source/runtime evidence proves no supported hook can satisfy the contract.
- When source semantics are ambiguous—especially RTL/browser coordinates, virtualization, timing, or scroll anchors—run an isolated runtime probe outside Product code and compare measured browser behavior with source semantics before choosing an architecture.
- A manual user-visible escape against a green automated suite is a coverage gap until reproduced. Preserve the exact escaped scenario as focused regression evidence; do not dismiss the manual result because final numeric state happened to pass.
- Boundary evidence must include the transitions relevant to the feature, not only the comfortable baseline: underflow↔overflow, repeated gestures, Min/Max, hidden/unhidden columns, core/custom columns, anchored vs deliberately scrolled viewport, and Save/Reload/History where applicable.
- Browser tests for interaction ownership must bind the **actual visual control/boundary to the expected `prop` and geometry**, not only assert final widths/counts using the same index assumptions as Product code.
- If two consecutive Product patches on the same interaction do not close the symptom or introduce a new interaction defect, stop before a third patch and perform source + runtime forensics from the original contract.
- After closure, promote only reusable root-cause lessons into this gate/owning architecture docs. Do not accumulate feature-specific workaround rules; periodically consolidate or remove rules when stronger evidence makes them obsolete.

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

For Work Orders closure, prefer the existing `Run-ERP-Full-Regression.ps1` after focused evidence. It performs a fresh build and runs the real Employee Workday, Rename focused break suite, Visibility focused suite, Canonical Empty Sheet lifecycle, B12 real DB Save, Startup Security restart regression, and Integration tests. It continues through test-suite failures so one run exposes all failing areas.

### Short-turn remote execution cadence

For interactive Remote Desktop **Product changes**, default to **one material change + one focused proof per assistant turn**, then report the result before chaining more Product changes. Run broader regression in a separate turn/batch after the focused proof is green. Manual user acceptance is a separate stop point before checkpoint/commit.

For **Review / Research / Forensics / Audit** work, do not apply the short-turn stop rule. Continue the investigation automatically through its planned evidence-gathering steps and return only when the review is complete, a real user decision is required, or a genuine safety/access blocker prevents continuation. A parser error, unavailable command, failed probe, or other recoverable tooling error is **not** a stop point: use the simplest safe fallback, record the tooling issue when material, and continue the same review.

Material Build/Test/Regression commands expected to take more than a few seconds must use `Tools/AI/Invoke-AITrackedStep.ps1` by default so `AI_EXECUTION_LOG.csv` receives timing/outcome/classification automatically. If a material run was not tracked, record the telemetry gap in `AI_WORK_LOG.md`; do not invent retrospective durations.

After each material behavior/code/test result, synchronize `AI_CURRENT_STATE.md` + append `AI_WORK_LOG.md` before moving to a different feature/mission. Update the owning behavior/reference document when the contract itself changes. Do not wait until final closure to record the mission's current truth.

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

- Prefer direct edits/tests on the authorized live repository over generated ZIP/apply-package transport; use packaging only when direct access is unavailable or isolation is materially required.
- Prefer an existing deterministic/SQL/browser path over inventing a probe that answers the same question.
- Do not rerun an unchanged failure unless a material input changed.
- After two consecutive Tooling/Package failures on one blocker, stop chaining and re-anchor from exact current Git/status/diff/snapshot.
- Package from the exact reviewed source; use Git logical identity for tracked text when LF/CRLF may differ.
- Normalize Git paths before allowlist/scope comparisons.
- Target Windows PowerShell 5.1 unless otherwise verified.
- Resolve paths from `git rev-parse --show-toplevel`.
- Prefer surgical `edit_block`/simple deterministic edits over quote-heavy PowerShell source-rewrite one-liners. If scripted replacement is necessary, require an exact replacement count and stop before write on mismatch.
- Immediately source-scan/parse and build after scripted source edits before starting a long browser suite.
- For Remote Desktop work, verify device status once before a material batch. Valid auth + `offline` means the connector is unavailable; do not infer that Windows/the project is down and do not burn repeated probes when a watch can wait for recovery.
- Launch long commands once and poll near an expected milestone/completion instead of high-frequency output reads; batch related read/status/search work where safe.
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
- Preserve behavior coverage, not historical stage shape: when retiring old Gate/scaffold tests, migrate only unique user-contract scenarios to the canonical surface and prove them there before deletion.
- Keep realistic fixture/capacity guards. Do not weaken a 1,000+ row guard merely to make a focused scenario convenient; redesign the test around the real operating envelope.
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

Use Metrics to compare missions, not to score them. Keep counts factual. For a mission that predates prospective capture, use NA for an unavailable counter; never encode unknown as zero.

Execution telemetry is separate from mission Metrics: `AI_EXECUTION_LOG.csv` records material device-side Review/Read/Edit/Build/Test/Diagnose steps with start/end time, local duration, outcome, failure class, and evidence path. Use `Tools/AI/Invoke-AITrackedStep.ps1` inside material local batches so timing is captured without adding Remote round-trips. For Build/Test/Regression or other commands expected to take more than a few seconds, tracked execution is the default unless the wrapper would materially distort or block the command. If a mission was not tracked, record the telemetry gap explicitly; never reconstruct exact durations from memory. These durations measure device execution only; model thinking and network/tool transport latency are not included.

Important fields:

- `ContextRecoveryTurns`, `ProductCorrectionTurns`, `AvoidableClarifications`, `CommunicationCorrectionTurns` — interaction/continuity waste;
- `ReworkLoops`, `ScopeDriftEvents` — design/scope waste;
- `ProductFailures`, `TestHarnessFailures`, `BuildStaleFailures`, `ToolingFailures`, `EnvironmentFailures` — separate failure classes;
- `FirstDefectCatchStage` — earlier is generally better;
- `StateSyncMisses`, `StaleStateCorrections` — memory quality;
- `PackageIterations` — package/tooling churn;
- `RequiredEvidenceComplete`, `ManualAcceptance`, `ReferencePassComplete` — closure context.

Do not judge trend from one row. After five completed missions, compare the rows, identify the single biggest repeated source of waste/risk, and choose at most one workflow experiment for the next five missions.

Current five-mission experiment (2026-09-14 -> next five completed missions): before an expensive browser regression, do a lightweight harness-freshness preflight against current source/runtime for route/module token, feature flags, visible-menu expectations, and build freshness. No new gate/framework is authorized by this experiment.

`ReopenedWithin3Missions` is not a closure-time metric because the future is unknown. Evaluate reopening retrospectively when enough later missions exist.

## Continuity

A new chat starts from a fresh context package when local reality changed or referenced files are unavailable. Read Current State first, then live/exported Git evidence, then only mission-relevant code/docs.

During the same chat, reread the compact state and latest relevant log before substantial new work. If frequent rereads become expensive, prune Current State rather than skipping the gate.
