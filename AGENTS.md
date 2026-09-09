# ERP AI BOOTSTRAP

If `AI_CONTROL_CENTER.md` is present or re-uploaded, treat it as the mandatory refresh router and follow its read order before the ERP response/action. Otherwise, before substantial work, read `AI_CURRENT_STATE.md` first. For Grid missions, also read the relevant rows in `ERPPrototype/Documentation/AI_GRID_REFERENCE_MATRIX.md`.

`AI_CURRENT_STATE.md` holds the active mission and approved current behavior. It is not proof of implementation: current Git/worktree, current code, and executed test evidence override stale narrative state.

Do not hardcode a changing Revo checkpoint or next mission in this file. Keep this file as the stable engineering contract and keep changing mission state in `AI_CURRENT_STATE.md`.

---

# ERP Prototype — Engineering Entry Point

## Status

Current repository engineering contract.

Active mission/checkpoint state lives only in root `AI_CURRENT_STATE.md`; do not duplicate changing checkpoint facts here.
The current code, migrations, tests, and checked-out Git/worktree snapshot are the authority for implemented reality.
Business rules are canonical in `ERPPrototype/Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.
Chronological accepted decisions are recorded in `ERPPrototype/Documentation/08_DECISIONS_LOG.md`.

## Current working model

Engineering judgment stays with the main AI/engineer reviewing the real repository.
Local scripts, Git, Build, tests, browser automation, and diagnostics are execution/evidence tools; they do not replace engineering judgment.

The former Native V1 / AI-Team workflow is historical only. Its receipts, prompts, tools, and archived infrastructure may remain for evidence, but they are not mandatory gates and must not be revived as the default workflow.


## HARD SAME-CHAT STATE GATE

For every ERP-project response or action, do not rely on conversational memory alone. Before reasoning from project state:

1. if root `AI_CONTROL_CENTER.md` is available, read/follow it first;
2. read root `AI_CURRENT_STATE.md`;
3. read the latest relevant entries in `ERPPrototype/Documentation/AI_WORK_LOG.md`;
4. treat the newest user message as the newest approved source for behavior;
5. if the newest turn changes a decision, test result, code state, blocker, scope, or next action, synchronize the compact state before continuing;
6. if a fact is missing from the compact state but matters to the answer, recover it from current code/Git/test evidence or the work log instead of guessing.

After every material event — approved behavior, implementation result, test result, rollback, discovered risk, scope change, or checkpoint — update the compact state and append a work-log receipt. When the event changes a canonical behavior/decision/test/reference/workflow truth, update that owning document in the same step. At checkpoint boundaries, prune superseded detail from the compact state.

At major evidence milestones, before a handoff/context export, and before any checkpoint/mission closure, run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`. A documentation-integrity `FAIL` is a stop condition: repair the drift before continuing engineering work.

This is a hard workflow gate, not a reminder. The purpose is to make the file-backed live state the working memory during the same chat, so the assistant does not depend on remembering dozens of prior turns.

If the assistant cannot access the live state file in the current environment, it must say that continuity is degraded and reconstruct the minimum current state from available evidence before making a material project decision.

## Live continuity

During the same chat, do not rely on conversation context alone. Keep root `AI_CURRENT_STATE.md` current after material decisions/tests/code changes, append chronological receipts to `ERPPrototype/Documentation/AI_WORK_LOG.md`, and prune superseded detail from the compact state at checkpoint boundaries.

## Before substantial work

Read only the documents relevant to the mission, normally beginning with:

1. `ERPPrototype/Documentation/02_AI_DECISION_PRINCIPLES.md`
2. `ERPPrototype/Documentation/03_CURRENT_IMPLEMENTATION.md`
3. `ERPPrototype/Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
4. `ERPPrototype/Documentation/06_REGRESSION_TEST_CHECKLIST.md`
5. `ERPPrototype/Documentation/08_DECISIONS_LOG.md`
6. `ERPPrototype/Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` when business behavior/permissions are involved.

Before changing code:

- inspect the current implementation and affected dependencies;
- explain employee/business impact before technical detail;
- prefer the smallest correct change;
- identify regression tests and rollback/checkpoint;
- do not silently invent a new business rule.

## Verification rule

AI-generated code is not accepted because it compiles or passes isolated tests.

For important Grid behavior, Save, validation, data integrity, permissions, concurrency, or recovery:

1. run deterministic/unit/self-tests where useful;
2. run the relevant real-browser/integration journey;
3. capture evidence on failure instead of guessing;
4. give the user a short manual browser test and require user acceptance before final closure;
5. commit/push only after the accepted candidate is stable.

For **user hands-on/manual ERP runs after source changes**, enforce runtime freshness before interpreting behavior: resolve the real Git root/project, stop the current listener, remove the app `bin`/`obj`, build the real project, do not start if Build fails, run without `--no-build`, open a new browser tab, and verify the loaded module version when JavaScript/Razor cache keys changed. `--no-build` remains acceptable only inside a controlled automated harness after its matching build-configuration gate has passed.

Generated project PowerShell must be compatible with the user's Windows PowerShell 5.1 environment unless a newer runtime is explicitly verified. Installers must preflight shell/runtime/path/hash requirements before copying product files so a tooling failure cannot leave an unplanned partial apply.

## Test-hardening scope guard

A verification/closure pass is allowed to improve tests, diagnostics, fixtures, and documentation. It must **not silently add, remove, or redesign employee-visible product behavior**.

If reviewing tests reveals that an approved capability is missing from the current Revo surface:

1. stop the test-hardening implementation at that boundary;
2. classify the finding as a product/parity gap rather than “just another test”;
3. when the capability exists or is likely to exist in legacy Tabulator, inspect that exact Tabulator behavior/code/tests first, then inspect the current Revo Community mechanics/integration and relevant official evidence;
4. explain the recovered behavior and any material differences to the user;
5. obtain user approval before changing product runtime code;
6. only then implement the smallest parity slice and return to test hardening.

For existing Work Orders features being migrated from Tabulator to Revo, Tabulator is the mandatory **behavior reference** even though its architecture is not automatically copied.

## Review rule

Review at candidate boundaries, not after every edit.

- cosmetic/text-only change: independent review usually unnecessary;
- substantive behavior/data change: at least one independent review when risk justifies it;
- security/data/concurrency/permissions: independent review is expected before production acceptance.

A reviewer must receive the required behavior and immutable code evidence, not the Main's diagnosis/conclusion.

## Protected Work Orders behavior

Unless an approved mission explicitly changes it, preserve:

- Excel-like edit/navigation/selection;
- Paste and partial-paste-at-end behavior;
- Range Clear Delete/Backspace;
- Insert/Delete rows;
- Undo/Redo and Sheet History;
- Dirty/Baseline separation;
- Unified soft validation;
- ERP-owned financial/Remaining rules;
- year isolation;
- server authority;
- security and scope;
- RowVersion/concurrency;
- frozen UI dimensions;
- Scroll preserves selection; Sort preserves selected Work Order identity;
- Filter-pruned rows leave row selection and must not be silently targeted by new row/cell mutations;
- dirty changes made before a later Filter hides a row remain eligible for Save.

For Grid behavior/architecture changes, run the Grid Reference Pass first: compare current Tabulator behavior/code/tests, current installed RevoGrid Community integration plus official source/docs/examples, and relevant RevoGrid Pro docs/examples/source when actual access exists. Never claim Pro source-level evidence from docs alone.

RevoGrid Community owns native cell range/focus/keyboard/edit/virtualization mechanics where practical.
ERP may add only the missing semantic whole-row/whole-column Ctrl/Shift selection needed by the product; do not create a second full selection engine or DOM-scanning selection painter.
ERP owns business semantics, validation, financial rules, Dirty/Save meaning, permissions, persistence identity, business history, and specialist workflows.

Do not modify RevoGrid source.
Tabulator remains the live `/work-orders` runtime and behavior reference only until the accepted Revo cutover; it is not the design authority for new Revo work.

## Stop conditions

Stop and surface the decision before implementation when evidence conflicts on a material rule, a working core component would be replaced, a new dependency/framework is proposed, or security/data/concurrency/business behavior would materially change without an approved decision.

Important outcomes must be explained briefly in Arabic using the Work Orders behavior the user will actually see.

## USER COMMUNICATION STYLE — ERP PROTOTYPE

When communicating with the user about ERP Prototype, aim for **مختصر مفيد**: keep every important fact needed to understand the logic and decision, but remove repetition, implementation noise, and history that does not affect the current question.

The user is not a programmer but understands logic well. Explain the program as a sequence of cause and effect before technical detail: what happens inside the program, why it matters, what decision follows, and a practical ERP example when it makes the behavior easier to understand.

Use natural Egyptian Arabic by default. Review and understand the implementation at full technical depth internally, but explain it to the user at the program/ERP logic level first. Mention class names, function names, file names, or low-level implementation detail only when they are necessary to understand a concrete risk/decision, to diagnose a specific issue, or when the user explicitly asks for code-level detail.

Do not use fixed word counts, paragraph counts, or artificial limits on examples. Let the complexity of the decision determine the length. The default presentation should use **a small number of fuller paragraphs rather than many short stacked lines or long bullet lists**. Use bullets only when they genuinely make several distinct options, states, or steps easier to compare.

Communication rules:

- answer the user's current question first and stay on the current decision;
- keep all material information that changes the user's understanding, risk, or next action;
- do not replay settled project history unless it is needed to explain the current result;
- prefer concrete ERP examples over abstract programming terminology;
- introduce technical terms only when they help explain the decision, and explain them in plain language;
- distinguish **exists now**, **proposed**, **tested**, and **inferred** when that distinction matters;
- do not repeat the same conclusion in different wording;
- do not compress so aggressively that the user loses the reason or consequence;
- when the user asks for a deep review, do the deep reasoning internally and return the important findings, risks, and decision in an understandable form rather than dumping the investigation.

Preferred logical flow (labels are optional):

**What happens? → Why does it matter? → What do we recommend and why? → Example if useful.**

Before sending a substantial reply, remove repeated facts, unnecessary code-level detail, and fragmented formatting. Keep the cause/effect logic and the information the user needs to make or understand the decision.
