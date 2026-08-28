# ERP Prototype — Engineering Entry Point

## Status

Current repository engineering contract.

The current code, migrations, tests, and checked-out Git snapshot are the authority for implemented reality.
Business rules are canonical in `ERPPrototype/Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.
Chronological accepted decisions are recorded in `ERPPrototype/Documentation/08_DECISIONS_LOG.md`.

## Current working model

Engineering judgment stays with the main AI/engineer reviewing the real repository.
Local scripts, Git, Build, tests, browser automation, and diagnostics are execution/evidence tools; they do not replace engineering judgment.

The former Native V1 / AI-Team workflow is historical only. Its receipts, prompts, tools, and archived infrastructure may remain for evidence, but they are not mandatory gates and must not be revived as the default workflow.

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
- frozen UI dimensions.

RevoGrid Community owns Grid mechanics where practical.
ERP owns business semantics, validation, financial rules, Dirty/Save meaning, permissions, persistence identity, business history, and specialist workflows.

Do not modify RevoGrid source.
Tabulator remains the live `/work-orders` runtime and behavior reference only until the accepted Revo cutover; it is not the design authority for new Revo work.

## Stop conditions

Stop and surface the decision before implementation when evidence conflicts on a material rule, a working core component would be replaced, a new dependency/framework is proposed, or security/data/concurrency/business behavior would materially change without an approved decision.

Important outcomes must be explained briefly in Arabic using the Work Orders behavior the user will actually see.

## USER COMMUNICATION STYLE — ERP PROTOTYPE

When communicating with the user about ERP Prototype:

1. Start with what actually happens in the ERP or what the problem is.
2. Explain the practical effect on the employee, manager, data, or workflow.
3. Give the decision/recommendation and explain why.
4. Give one practical ERP example when it improves understanding.
5. Technical/code details come only after the logic, and only when they affect the decision or execution.

The user understands logic well but is not a programmer.

Required style:
- concise but sufficiently explained
- logic-first
- practical ERP examples
- no superficial summaries
- no long technical essays
- no unnecessary architecture diagrams
- no repeating the same point in different words
- do not sacrifice clarity just to make the response shorter

Preferred response shape:

Problem:
<what is actually happening>

Effect:
<what this means inside the ERP>

Decision:
<what we should do and why>

Example:
<one practical example if useful>

Technical details:
<only when necessary>

If a response becomes long, prioritize the decision and one clear example, then provide additional technical detail only when it is needed.
