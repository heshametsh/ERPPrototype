ERP AI Team V3.3.5 - Windows PowerShell 5.1 empty collection binding hotfix
2026-08-22

Purpose
-------
Fix the local Structured Output preflight failure seen on Windows PowerShell 5.1:
"Cannot bind argument to parameter 'Errors' because it is an empty collection."

Root cause
----------
Test-AITeamCodexOutputSchemaNode accepted its shared List[string] error collector as a
Mandatory parameter. Windows PowerShell 5.1 rejects a zero-item collection for a
Mandatory parameter unless AllowEmptyCollection is declared. Valid schemas therefore
failed before they could be validated.

Changes
-------
- Adds [AllowEmptyCollection()] to the shared schema error collector parameter.
- Adds a local regression smoke that deliberately validates a correct schema with zero
  errors, catching this exact PowerShell 5.1 binding behavior without calling Codex.
- Team version moves to 3.3.5.

Scope
-----
AI-team harness only. No ERP runtime, database, UI, or business logic changes.
No Codex/model call is made by the compatibility test.

Cumulative patch note
---------------------
This ZIP also contains the complete V3.3.4 Structured Output preflight changes, because
V3.3.4 failed its local compatibility test before it could be committed. Applying this
single ZIP over commit 68b811f is sufficient; do not apply V3.3.4 separately again.
