# ERP Prototype — Agent Entry Point

## Purpose
This file is the short entry point for any coding or review agent working in this repository.
Do not treat this file as the full project manual. Follow the linked project documents as the source of truth.

## Start here
Before substantial work, read only the documents relevant to the task, beginning with:

1. `ERPPrototype/Documentation/00_DOCUMENTATION_INDEX.md`
2. `ERPPrototype/Documentation/02_AI_DECISION_PRINCIPLES.md`
3. `ERPPrototype/Documentation/ERP_AUDIT_PROTOCOL.md` for independent reviews
4. `ERPPrototype/Documentation/03_CURRENT_IMPLEMENTATION.md` for implemented reality
5. `ERPPrototype/Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md` for Work Orders behavior
6. `ERPPrototype/Documentation/06_REGRESSION_TEST_CHECKLIST.md` before closing a change
7. `ERPPrototype/Documentation/08_DECISIONS_LOG.md` for approved decisions
8. `ERPPrototype/Documentation/12_ENGINEERING_AUDIT_REPORT.md` only when synthesis/history is needed
9. `ERPPrototype/Documentation/AI_AGENT_WORKFLOW_V3.md` when running or designing the AI team workflow
10. `ERPPrototype/Documentation/brain/README.md` for Project Brain V1 structured routing rules
11. `.ai/team-config.json` when an AI-team mission is being run; it is the live role/path/tuning registry
12. `.ai/prompts/_reviewer-common.md` for the shared independent-review contract
13. `ERPPrototype/Documentation/AI_TEAM_TEST_PLAN_V3.md` for current qualification/tuning policy

Current code, migrations, and tests in the checked-out commit are the primary evidence for what is actually implemented.

## Universal project rules
- Understand business behavior before proposing implementation.
- Prefer the simplest safe solution; do not add frameworks, layers, or abstractions without demonstrated need.
- RevoGrid Community native behavior comes first for grid mechanics. Add ERP-owned logic only for ERP business rules or behavior RevoGrid does not own.
- Old Tabulator code may be inspected for lessons and historical behavior, but it is not the design authority for new RevoGrid implementation.
- Do not modify RevoGrid source unless there is no safer supported extension path and the user explicitly approves that direction.
- Do not silently change business rules, architecture, persistence, security, permissions, or user-visible behavior.
- Any material product decision must be presented to the user in business terms before implementation.
- Explain important outcomes in concise Arabic with a concrete ERP example.
- AI-team review/test artifacts must be stored outside the repository through the tracked run lifecycle; never make the user search random Temp folders for evidence.
- AI-team prompts/config are read fresh per mission. Do not require a Codex restart for ordinary prompt/config/harness tuning; only the Skill contract itself may require a refresh.

## Change workflow
For a substantial feature or core behavior change:

1. Inspect the current code path and all shared dependencies first.
2. Identify affected behaviors and regression risks.
3. Compare with relevant RevoGrid Community behavior/source and official RevoGrid Pro architecture/docs when applicable.
4. Present materially different product/engineering choices before coding.
5. Wait for explicit user approval when the choice changes user-visible behavior or a core rule.
6. Make the smallest safe change in one implementation path.
7. Run the relevant build/tests/checks.
8. Perform an independent post-change regression review.
9. Update documentation only where ownership requires it.

## Reviewer mode — read only
When assigned as an independent reviewer:
- Do not modify runtime code.
- Start from the checked-out snapshot; do not use another reviewer's findings as hypotheses.
- Do not read previous independent review outputs until your own review is complete unless the assignment explicitly says synthesis.
- Seek both confirming and disconfirming evidence.
- Distinguish: Confirmed, Potential/needs runtime proof, Product Decision.
- Report evidence, impact on employee/program behavior, and the smallest safe direction.
- Never turn a style preference into a defect without practical impact.

## Implementer mode — single writer
When assigned to implement an approved change:
- You are the only writer for that implementation step.
- Do not broaden scope beyond the approved decision.
- Preserve one clear owner/path for each responsibility.
- Do not create parallel compatibility paths merely to make a test pass.
- Keep History, Dirty/Baseline, validation, derived financial rules, selection/focus, and persistence responsibilities separated according to current project contracts.
- Before finishing, check `git diff`, run required verification, and list any remaining risk honestly.

## Work Orders protected behavior
Unless the approved task explicitly changes it, preserve:
- Excel-like edit, keyboard navigation, range selection, copy/paste, row insert/delete, filtering, sorting, and Undo/Redo.
- Sheet History as an ordered user-action history; replay must not record itself again.
- Dirty as current difference from saved baseline, separate from History.
- Year isolation and approved year-switch behavior.
- ERP-owned Remaining Amount/business financial rules.
- Server authority for security, persistence validation, concurrency, and RowVersion.
- Frozen visual baseline unless the user explicitly asks for visual changes.

## Validation direction currently approved
Follow `DEC-040` in `ERPPrototype/Documentation/08_DECISIONS_LOG.md`.
Do not duplicate its product rule here. The Project Brain Decision Index may route Agents to it, but the Decisions Log remains the normative text.

## Stop conditions
Stop and report before implementation when:
- evidence conflicts on a material business/architecture rule;
- the change would require replacing a working core component;
- a new dependency/service/framework is proposed;
- security, data integrity, concurrency, or offline behavior could materially change;
- the requested change creates a new product decision that has not been approved.
