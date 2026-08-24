# Archived AI-team material

This directory is a frozen historical archive. Nothing below it is an active Native V1 dependency, and no file here should be restored as a compatibility path.

The archive preserves the V2/V3 qualification, Project Brain, routing, Lead, child-reviewer, CLI, sandbox/transport, evidence, and ProductionReview experiments so benchmark/history evidence remains available without keeping the infrastructure active.

Applied classifications:

- `ERPPrototype/Documentation/brain/` is **ARCHIVE**, including its validator and CI workflow. Its cited Project Brain/legacy qualification dependencies are not Native V1.
- `.ai/schemas/review-record.schema.json` is **ARCHIVE**. Native V1 uses only a tiny Candidate Receipt.
- `.ai/schemas/reviewer-findings.schema.json` is **ARCHIVE**. Native V1 uses the minimal findings contract in `.ai/prompts/native-reviewer-v1.md`; no harness consumes the old schema.
- `AITeamCodex.psm1` and the ProductionReview experiment are **ARCHIVE**. CLI child-reviewer, sandbox, and transport behavior was not retained. The existing parser only served CLI JSONL events, with no demonstrated Native session event source, so Native telemetry remains nullable.

The host-protected `.agents/skills/erp-ai-team/SKILL.md` could not be moved by this workspace session. It is not referenced by the active `AGENTS.md`; its archive move remains the only external filesystem blocker.
