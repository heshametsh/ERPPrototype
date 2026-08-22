---
name: erp-ai-team
description: Orchestrate the ERP Prototype AI review team from one Codex thread. Use when the user asks to review, audit, plan, or safely prepare a substantial ERP Prototype change with independent parallel reviewers. For review missions, spawn independent read-only subagents, validate evidence, then use a separate Lead Integrator. Do not modify runtime code unless the user explicitly moves the mission to implementation after reviewing the decision.
---

# ERP Prototype AI Team Orchestrator

Use this skill as the repo-local orchestration layer for ERP Prototype.

## Core operating rule

One parent Codex thread coordinates the mission. The user should not have to open reviewer chats manually.

For an engineering review mission, the parent MUST explicitly use native Codex subagents. This skill is explicit authorization to delegate bounded, independent review work in parallel.

Keep the team small. Default to at most **three concurrent reviewer subagents**. Do not create nested subagents. Reviewers must not spawn children.

The purpose is independent evidence, not more opinions.

## Repository sources of truth

Before orchestration:

1. Read root `AGENTS.md`.
2. Read `ERPPrototype/Documentation/AI_AGENT_WORKFLOW_V3.md` only as needed for workflow rules.
3. Use `ERPPrototype/Documentation/brain/decisions-index.yaml` only as an index. Read the referenced decision text from `ERPPrototype/Documentation/08_DECISIONS_LOG.md`.
4. Use `ERPPrototype/Documentation/brain/field-aliases.yaml` as a discovery aid, never as proof of current runtime behavior.
5. Current checked-out code at the current Git commit is the authority for current implementation facts.
6. Never use historical ChangeImpact as a routing hint for a new mission.

## Preflight

Resolve and retain the exact current commit with `git rev-parse HEAD`.

Run the deterministic Project Brain validator before spawning reviewers:

- On Windows, prefer `py -3 ERPPrototype/Tools/ProjectBrain/validate_project_brain.py` when `py` exists.
- Otherwise use `python ERPPrototype/Tools/ProjectBrain/validate_project_brain.py` when `python` exists.

If the validator fails, stop. Report the failure. Do not spawn reviewers.

For the PartialAmount canary, also run the current deterministic mapper/canary tool before reviewers, but treat its result as tooling evidence only, not as reviewer conclusions:

- `py -3 ERPPrototype/Tools/ProjectBrain/change_mapper_v1.py` or the equivalent `python` command.

If Python is unavailable, state `PREFLIGHT_BLOCKED: Python unavailable` and stop rather than simulating checks.

## Mission packet

Build a compact **ephemeral** Mission Packet in parent-thread working context. Do not write it into durable Project Brain documentation.

It must contain only:

- Mission name.
- Current commit SHA.
- User-approved required behaviors or review objective.
- `SourceDecision` references when applicable.
- Relevant DecisionScope references.
- Preflight result.
- Explicit instruction that reviewers discover the current Change Map from current code.

Required behaviors describe what the employee/program should experience, not a guessed technical path.

Never treat an old Mission Packet as project truth.

## PartialAmount AI Team Canary

When the mission is `PartialAmount-AI-Team-Canary`, spawn these **three reviewers concurrently**:

### Reviewer 1 — Change Mapper

Tell the child to:

- Read `AGENTS.md`.
- Read `.ai/prompts/change-mapper-reviewer.md`.
- Work at the exact current commit SHA.
- Remain read-only.
- Do not use web.
- Do not read sibling reviewer output.
- Do not spawn subagents.
- Independently reconstruct the current dependency path.
- Return one JSON object matching `.ai/schemas/reviewer-findings.schema.json` and no prose outside the JSON.

### Reviewer 2 — Architecture & Code Quality

Tell the child to:

- Read `AGENTS.md`.
- Read `.ai/prompts/architecture-reviewer.md`.
- Work at the exact current commit SHA.
- Remain read-only.
- Do not use web.
- Do not read sibling reviewer output.
- Do not spawn subagents.
- Review ownership, duplication, fragile coupling, split-brain logic, one-off patches, and maintainability.
- Return one JSON object matching `.ai/schemas/reviewer-findings.schema.json` and no prose outside the JSON.

### Reviewer 3 — Regression & QA

Tell the child to:

- Read `AGENTS.md`.
- Read `.ai/prompts/regression-reviewer.md`.
- Work at the exact current commit SHA.
- Remain read-only.
- Do not use web.
- Do not read sibling reviewer output.
- Do not spawn subagents.
- Build the regression surface from current code/tests only.
- Return one JSON object matching `.ai/schemas/reviewer-findings.schema.json` and no prose outside the JSON.

Wait for all three. Close completed reviewer agents before starting the Lead so their slots are released.

## Finding Gate

Do not pass malformed reviewer output to the Lead.

For each reviewer result:

1. Parse it as JSON.
2. Require the fields and shapes defined by `.ai/schemas/reviewer-findings.schema.json`.
3. Require `commitSha` to match the current mission SHA.
4. Require every evidence location to be a real repository `file:line` at this commit.
5. Reject a finding with empty Claim, Evidence, Impact, or Verification.
6. Remove `confidenceTelemetry` before the Lead sees the report.

When practical, use the existing deterministic checker `ERPPrototype/Tools/AITeam/validate_agent_report.py` by writing reviewer JSON to an OS temporary location, not to durable Project Brain files. If deterministic validation cannot run, do not silently downgrade it to subjective judgment: report `FINDING_GATE_BLOCKED` and stop before Lead integration.

Confidence is telemetry only. Never use it to accept, reject, rank, or present a finding to the Lead.

## Lead integration

Only after all required reviewer reports pass the Finding Gate, spawn a **fourth, separate Lead Integrator subagent**. Do not let the parent itself substitute for the Lead review.

Give the Lead:

- `.ai/prompts/lead-integrator.md`.
- The three validated reviewer reports with `confidenceTelemetry` removed.
- The exact mission commit SHA.

Tell the Lead:

- Read-only; no code changes.
- No web.
- Do not vote between agents.
- Reconcile by evidence.
- Preserve unresolved disagreements.
- Verify suspicious evidence against current repository files when needed.
- Do not spawn subagents.
- Return the compact integrated verdict only.

Close the Lead when complete.

## Parent final response

The parent returns only:

1. Whether deterministic preflight passed.
2. Whether all three independent reviewer jobs completed and passed the Finding Gate.
3. The Lead's verdict and material findings/gaps in concise language.
4. A clear statement that no runtime files were modified.

For this canary, do **not** implement Validation or any code change even if reviewers recommend one.

## Token and Windows discipline

- Maximum three simultaneous reviewers.
- One Lead only after reviewers finish.
- No nested subagents.
- Keep reviewer prompts bounded to their role and Mission Packet.
- Do not paste full documentation into children; give file paths and let each read only what its role needs.
- Avoid loading old audit reports unless the mission explicitly calls for legacy comparison.
- Close completed agents promptly.
- If the Codex app becomes sluggish, stop spawning and report the runtime problem. Do not increase fan-out.

## Product-design missions

Do not force engineering reviewers onto product ideation.

When the user asks what feature to build, how to improve an ERP workflow, or what Excel/major ERP products do better, use the project's Product Partner workflow first. Engineering review starts only after the user approves the intended behavior.

## Implementation missions

This skill does not grant automatic implementation authority. After review, if a behavior/architecture choice exists, return it to the user. Only after explicit user approval may a single Implementer modify code. Multiple implementation agents must never edit the same mission in parallel.
