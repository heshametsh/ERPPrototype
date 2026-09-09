# AI Work Cycle — ERP Prototype

Purpose: improve engineering quality and continuity without creating another orchestration framework.

This process is deliberately small. Git/code/test evidence remains the authority. Metrics are factual observations used for periodic human/AI retrospective; they are not an automatic quality score or learning engine.

## The cycle

### 0. Bootstrap truth

Before substantial work:

- read root `AI_CURRENT_STATE.md`;
- inspect current Git HEAD/branch/status/stashes;
- inspect current uncommitted diff and untracked source files;
- read only the documents/code relevant to the mission;
- resolve any conflict between the state file and actual Git/code before editing.

Output: one sentence describing what is actually present and what is only reported/proposed.

### 1. Behavior contract

Describe the employee-visible behavior in a few rules before technical design.

Only ask the user when two materially different product behaviors remain possible. Do not ask about implementation details that current code can resolve.

Output: approved behavior + explicit non-goals.

### 1.5 Test-review scope guard

Test review is iterative: improve the existing harness when gaps are found, especially gaps exposed by user manual testing. But a test-hardening pass does not authorize product scope expansion.

When a test review discovers a missing user-visible command or behavior:

- distinguish **missing coverage** from **missing product behavior**;
- if the product behavior is missing, stop before implementation;
- for a capability already present in legacy Tabulator, run a feature-specific Tabulator → Revo Community → ERP ownership comparison before designing the Revo version;
- show the recovered behavior/choices to the user and obtain approval;
- then implement the approved parity slice separately from the test-harness improvement.

A green suite is not proof of completeness when the scenario is absent. Conversely, a missing test is not permission to invent the missing feature.

Output: a reviewed test-gap list plus a separate, user-approved product-gap list when one exists.

### 2. Reference baseline pass — mandatory for Grid missions

Before designing Grid behavior, compare the relevant behavior against the available reference implementations. This is not a generic research phase; inspect only the feature being changed.

Evidence order:

1. **Tabulator current ERP runtime/code/tests** — use it to recover the legacy user behavior and edge cases. Do not copy its architecture automatically.
2. **RevoGrid Community installed version** — inspect our integration plus official source/docs/examples to understand native mechanics, events, ownership, plugins, and supported extension points.
3. **RevoGrid Pro** — inspect official docs/examples for relevant capabilities. Inspect actual Pro source/implementation only when licensed source/package access is available. Label docs-only conclusions as docs-derived, not source-derived.
4. **ERP product contract** — choose what best preserves the approved behavior and existing ERP ownership boundaries.

For each relevant behavior, record a compact comparison:

- what Tabulator currently does;
- what Revo Community owns natively;
- what Pro offers, if relevant;
- what ERP must own;
- the chosen approach and why.

Decision rule: prefer a native Grid primitive when it preserves the product contract and avoids creating a second owner. Do not recreate a Pro/native capability inside ERP without evidence that the native capability cannot satisfy the behavior.

Output: update `AI_GRID_REFERENCE_MATRIX.md` only for rows touched by the mission.

### 3. Ownership map

Identify the existing owner of each relevant truth, for example:

- year/dataset;
- row identity;
- selection mechanics;
- Dirty/Baseline;
- History;
- Save authority;
- database identity/concurrency.

Reject designs that create a second owner unless current evidence proves the existing owner cannot satisfy the behavior.

### 4. Break Pass — before code

Try to break the proposed behavior using only scenarios relevant to the mission.

Typical families:

- Filter/Sort/hidden rows;
- Undo/Redo and Save baseline;
- edit while Save is active;
- Save failure/lost acknowledgement;
- RowVersion/multi-user conflict;
- cross-year movement;
- delete/re-add identity;
- virtualization/large data;
- partial transaction failure.

Do not mechanically run every scenario for every mission.

Output: confirmed risks, rejected risks, and any product decision that must be resolved before code.

### 5. Impact map and rollback

Identify the smallest set of runtime/test/migration files that should change and the checkpoint/rollback path.

Unexpected scope expansion requires evidence before continuing.

### 6. Smallest complete slice

Implement one end-to-end slice that can be independently proven.

Examples:

- data model + service + SQL behavior;
- then Revo Save + History + browser behavior.

Do not mix a second architecture cleanup or unrelated feature into the slice.

### 7. Evidence ladder

Use the lowest layer that proves the risk, then continue upward when user-visible behavior requires it:

1. build/static checks;
2. deterministic/unit/self-tests where useful;
3. real SQL/integration evidence for persistence/transactions/concurrency;
4. browser E2E for Grid/user-visible behavior;
5. short manual browser verification for important UX before final closure.

A build PASS is never acceptance for a behavior/data mission.


### Tooling, build-staleness, and shared-test-state guardrails

Apply these before creating diagnostic helpers or interpreting a red suite:

- Classify failures explicitly as **PRODUCT**, **TEST/HARNESS**, **BUILD/STALE-ARTIFACT**, or **TOOLING/PROBE**. Do not use a tooling failure as evidence against product behavior.
- After **two consecutive TOOLING/PROBE failures** on the same blocker, stop creating new probes. Re-anchor from current code, Git, and the last executed evidence, then choose the simplest existing evidence path.
- Before inventing a new probe, ask whether a clean/no-incremental rebuild plus an existing deterministic or SQL test can answer the same question. Prefer that path when it can.
- Do not rerun an unchanged failing suite unless a material input changed (code, migration, build artifact, database state, configuration, or test harness).
- Generated execution scripts must be parse-checked with the target shell/runtime when available. If the target shell is unavailable in the assistant environment, prefer short direct commands and simple packages over complex generated diagnostic scripts.
- Patch-package integrity gate: before handoff, verify that the expected source hash was computed from the exact reviewed source file and that the replacement payload was derived from that same source version. Never ship a package whose safety hash and reviewed source differ.
- A shared integration database is shared mutable state. Tests must either use unique years/field keys/departments, or load and merge the current configuration they do not own. Do not assert exact global counts unless the test created/reset all counted state itself.
- When a test fails only because prior tests left valid state, repair test isolation first; do not change production behavior to satisfy an order-dependent test.
- **Manual runtime freshness gate:** after source changes, user hands-on ERP runs must not use `--no-build`. Resolve the real Git root/project, stop the active listener, remove the app `bin`/`obj`, run a fresh `dotnet build`, abort if it fails, then `dotnet run` without `--no-build`. Open a new browser tab after restart. For versioned JavaScript/Razor changes, verify the loaded resource version before accepting or rejecting behavior.
- `--no-build` is allowed only in a controlled automated harness after the matching build-configuration gate has already produced the artifacts that harness will run.
- **Path/root gate:** generated commands and installers must resolve `git rev-parse --show-toplevel` and derive project paths from that root; never assume whether the user's shell is at repo root or inside `ERPPrototype`.
- **Windows PowerShell compatibility gate:** generated PowerShell intended for this project must work on Windows PowerShell 5.1 unless a newer PowerShell/.NET runtime is explicitly required and verified first. Avoid APIs such as `[System.IO.Path]::GetRelativePath` when the target runtime does not provide them.
- **Installer atomicity gate:** complete shell/runtime/path/hash/stash preflight before copying product files. If a later non-product step can still fail, either stage changes and swap atomically or provide automatic rollback. A tooling/documentation failure must not silently leave a partially applied product candidate.

### 8. Hostile diff review

After tests pass, reread the candidate as a reviewer rather than its author:

- compare the diff only against the behavior contract;
- look for duplicate ownership;
- check failure/rollback paths;
- check migration safety;
- check hidden/filter/sort/history interactions when relevant;
- remove unnecessary scope;
- ensure tests prove user behavior rather than an implementation detail.

### 8.5 Documentation consistency gate

The live memory and canonical documents must agree before the workflow crosses a major boundary.

There are two levels of synchronization:

**Event sync — immediately after every material event**

- rewrite/prune `AI_CURRENT_STATE.md` so it contains current truth only;
- append the chronological receipt to `AI_WORK_LOG.md`;
- route the event to the canonical owner when applicable:
  - behavior/business rule → `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` and/or `05_WORK_ORDERS_GRID_BEHAVIOUR.md`;
  - accepted decision → `08_DECISIONS_LOG.md`;
  - test/evidence milestone → `06_REGRESSION_TEST_CHECKLIST.md`;
  - Grid/reference status → `AI_GRID_REFERENCE_MATRIX.md`;
  - workflow failure/lesson → `AI_WORK_CYCLE.md`;
  - mission closure → `AI_WORK_METRICS.csv`.

**Cross-document audit — mandatory after a major evidence milestone, before handoff/context export, and before checkpoint/mission closure**

1. run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`;
2. compare the compact state against the checklist, Grid matrix, decisions, and latest log date;
3. remove superseded `PENDING`/expected-result receipts from the compact state instead of appending newer truth underneath them;
4. repair duplicate decision IDs or stale evidence counts;
5. do not advance while the consistency gate reports `FAIL`.

The script is a guardrail, not the source of truth. It catches structural/staleness defects; semantic engineering judgment still decides whether the documents correctly describe the product.

### 9. Close the mission

Before closure:

- state what exists, what was tested, and what remains unproven;
- give the user one short manual browser test when applicable;
- update and prune `AI_CURRENT_STATE.md`;
- append the material steps/results to `AI_WORK_LOG.md`;
- append one factual row to `AI_WORK_METRICS.csv`;
- create/accept a Git checkpoint only after evidence and user acceptance required by the mission.

## User-facing communication gate

The engineering cycle may be deep; the user-facing answer should expose only the information needed to understand the result and make the next decision.

Explain the feature in program logic first: what the employee will see or what the system will do, why that matters, the recommendation and its reason, and a practical ERP example when it clarifies the behavior. Technical detail belongs in the answer only when it changes the decision, explains a material risk, or is needed for the next execution step.

Do not impose fixed word or paragraph budgets. Instead, compress adaptively: remove repetition and irrelevant history, but preserve every material fact. Prefer a few fuller paragraphs over many short stacked lines. Use lists only when comparing several genuinely distinct options/states/steps is clearer than prose.

Before sending, check that the answer is both concise and complete for a non-programmer who follows logic well. The user should understand **what happens, why, and what we should do** without needing to understand the implementation.

## Metrics

The goal is not to maximize a single score. The metrics indicate where the workflow is wasting time or allowing defects to escape.

| Metric | Meaning | Desired direction |
| --- | --- | --- |
| `ContextRecoveryTurns` | Extra turns needed after mission/chat start before current state is confidently known | 0–1 |
| `ProductCorrectionTurns` | Times the user had to correct the assistant's understanding of desired program behavior | 0 |
| `BehaviorChangesAfterImplementationStart` | Approved behavior changed after coding began | 0; if nonzero, inspect whether coding started too early |
| `AvoidableClarifications` | Questions that code/docs/current state could have answered without asking the user | 0 |
| `CommunicationCorrectionTurns` | Times the user had to correct response length/clarity/repetition | 0 |
| `ReworkLoops` | Candidate implementation revisions caused by logic/design defects after the first implementation | <= 1 |
| `ScopeDriftEvents` | Unplanned scope expansion not justified by new evidence | 0 |
| `MeaningfulFailedTestRuns` | Real product/test failures encountered before final PASS; environment failures are recorded separately | context, not automatically bad |
| `FirstDefectCatchStage` | PRECODE / UNIT / SQL / E2E / MANUAL / AFTER_ACCEPTANCE / NONE | earlier is better |
| `RequiredEvidenceComplete` | Whether the mission obtained the evidence layer required by its risk | YES |
| `ManualAcceptance` | YES / NO / NA | YES when required |
| `ReopenedWithin3Missions` | Whether an accepted mission had to be reopened for a regression/incorrect behavior soon after | NO |
| `EnvironmentFailures` | Test/tool/environment failures separated from product defects | trend downward |
| `FilesChanged` | Candidate size context only; not a quality target | smallest complete change |
| `WhatWouldHaveShortened` | One concrete retrospective observation | factual |
| `WorkflowExperiment` | The one workflow change being evaluated in the current batch | one at a time |

## Five-mission retrospective

After every five completed missions:

1. compare the metrics, not memory;
2. identify the single largest repeated source of waste or escaped risk;
3. choose **one** workflow change for the next five missions;
4. keep the rest of the cycle stable so the effect can be observed;
5. do not invent a permanent rule from one unusual mission.

Examples:

- repeated `ProductCorrectionTurns` after coding -> strengthen Behavior Contract before implementation;
- repeated `ReworkLoops` -> strengthen Break Pass or reduce slice size;
- defects first found in MANUAL -> add/repair browser E2E around the real visible behavior;
- repeated `EnvironmentFailures` -> repair the harness before adding more product tests;
- repeated context recovery -> improve `AI_CURRENT_STATE.md` or the exported context package;
- repeated communication corrections -> shorten the decision explanation and stop repeating already-approved rules.

## Continuity rule

A new chat does not rely on conversation memory as project truth.

At the start of a new chat, upload one fresh context package generated by `Tools/AI/Export-AIContext.ps1` and say only `كمل`.

The assistant should read in this order:

1. `AI_CURRENT_STATE.md`;
2. `AI_CONTEXT/REVIEW_GIT_INFO.txt`;
3. `AI_CONTEXT/CURRENT_UNCOMMITTED_DIFF.patch` and stash manifests when relevant;
4. only the code/docs needed by the current mission.

If the current chat already has the exact current worktree and no local changes occurred, no new package is needed.



### Mandatory state sync gate — every project turn

This gate runs even when no code is being changed. Before answering a project question, planning the next step, reviewing evidence, or editing code:

- reread `AI_CURRENT_STATE.md`;
- scan the latest relevant `AI_WORK_LOG.md` entries;
- merge the newest user message as the latest product truth;
- synchronize any material change before advancing the mission.

The gate is intentionally lightweight: the compact state should stay small enough to reread frequently. If repeated rereads become expensive, prune the state rather than skipping the gate.

A state-sync failure is counted when the user has to remind the assistant of an already-approved active fact that should have been present in the compact state. Record that in the mission metrics.

## Same-chat live-memory rule

Do not rely on conversation context alone. During an active chat, `AI_CURRENT_STATE.md` is the compact working memory and `AI_WORK_LOG.md` is the chronological receipt.

Before each substantial new implementation/review step:

1. reread `AI_CURRENT_STATE.md`;
2. verify any changed local reality against Git/code/test evidence available in the chat;
3. continue only after stale state is corrected.

After each material event, rewrite the compact state and append one log entry.

At checkpoint boundaries, prune the compact state. Do not prune the chronological log; archive/roll it only when it becomes too large.


- Patch source-truth gate: build each package from the latest user-proven file version or exact hash from the active worktree, not from a stale local mirror or an earlier review snapshot.

- Existing-harness-first gate: before creating a new test/browser runner, inventory the repository's approved harnesses, fixtures, page objects, diagnostics, reporting, and existing scenarios. Extend/reuse the established harness by default. Create a parallel harness only when a documented incompatibility or isolation requirement makes reuse unsafe or impossible.

- Cross-document memory-integrity gate: after major evidence milestones, before handoff/context export, and before checkpoint/closure, synchronize all owning documents and run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`. A FAIL blocks advancement until documentation drift is repaired.

- Existing-browser-extension rule: focused feature acceptance should extend the **current accepted browser harness identified by the Active-surface-first gate**. Legacy Phase9/Tabulator harnesses remain reference evidence unless the active mission explicitly targets them.

- E2E build-configuration gate: before running an existing browser harness with `--no-build`, inspect the web-process launcher configuration and build the E2E/app projects in that same configuration. For `Phase9FoundationRunner` / `WebApplicationProcess`, the default web-app configuration is Release.

- Active-surface-first gate: before selecting or extending browser automation, identify the current accepted product surface/route from Current State and acceptance evidence. A legacy Grid/harness may be used for behavior comparison but must not become the acceptance gate when a newer accepted surface exists.

- Schema-to-fixture drift gate: when a migration adds a required column or changes a key/constraint, search all direct-SQL integration/E2E fixture writes to the affected table before browser regression. Update every fixture writer in the same test-only slice; do not wait for runners to fail one by one.

- Semantic memory-integrity gate: a structural PASS is not sufficient at checkpoint. Scan Current State, Regression Checklist, Decisions, and Grid Matrix for contradictory acceptance surfaces, superseded pending gates, and high-confidence encoding corruption before closure.

- Memory-checker self-integrity gate: changes to `Test-AIMemoryConsistency.ps1` must be reviewed under `Set-StrictMode` for variable initialization order before handoff; the checker itself is tooling and its crash must be classified separately from project-memory inconsistency.
- Manual-acceptance truth gate: automated SQL/browser PASS evidence never implies user hands-on acceptance. `ManualAcceptance` stays pending until the user explicitly tries and accepts the relevant behavior.
- Memory-text encoding gate: project-memory Markdown/CSV must be decoded explicitly as UTF-8 by automation; never rely on Windows PowerShell 5.1 default text decoding or BOM presence. When mojibake is detected, distinguish real corrupted bytes/text from a checker decoding error before editing.

## Manual-first user-visible acceptance gate

- For user-visible ERP acceptance cycles, run the user's hands-on smoke/behavior validation before assistant/automated closure tests unless an earlier automated safety check is required to protect real data.
- Automated PASS evidence never substitutes for the user's hands-on result.
- When manual testing uses the real local database, first distinguish code/runtime failure from database schema drift. Never apply a pending migration to the real database before read-only inspection, a verified backup, and review of the migration effect.
- After two consecutive tooling/documentation patch failures, stop patch chaining, re-establish current truth from an exact project snapshot, and prefer one consolidated cleanup.
