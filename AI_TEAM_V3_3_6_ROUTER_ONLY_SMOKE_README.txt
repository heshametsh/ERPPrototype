ERP AI Team V3.3.6 - Router-Only Smoke Test
============================================

Purpose
-------
Prove the real Codex CLI + Structured Output + token telemetry path using exactly
one Mission Router attempt before spending allowance on Reviewers or Lead.

New command
-----------
erp-ai-team smoke-router AIT-02

Guarantees
----------
- At most one Codex router attempt.
- Zero Reviewers are launched.
- Lead is never launched.
- Router cannot read the hidden routing oracle; the oracle is evaluated only after output.
- Current repository must be clean before model launch.
- Repository cleanliness is checked again after the router returns.
- Direct token counts, events, stdout/stderr paths, elapsed time and routing result are persisted.
- A routing-quality mismatch is PASS_WITH_GAPS rather than a transport failure; the purpose of this smoke is to separate plumbing from reviewer-team cost.

No ERP runtime files are changed.
No Codex restart is required because SKILL.md is unchanged.
