ERP AI Team V3.3.4 - Structured Output Preflight + Correct Usage Semantics
=======================================================================

Baseline expected before this patch:
  68b811f - Harden Codex CLI integration on Windows PowerShell 5.1

Observed AIT-02 failure:
  Codex returned HTTP 400 invalid_json_schema before generation:
  properties.schemaVersion used const without an explicit type.
  The run had 0 input/output tokens and 0 turn.completed events.

This patch fixes the whole response-schema path, not only the first field:

1. Adds explicit types to every const used by AI Team schemas.
2. Replaces Lead oneOf with supported anyOf.
3. Removes routing uniqueItems from the model schema and enforces uniqueness locally.
4. Removes Product format=uri from the model schema; Product Gate still requires http/https URLs.
5. Adds a deterministic Structured Outputs preflight in AITeamCodex.psm1.
6. Validates router/reviewer/Lead/Product schemas in the runtime compatibility test.
7. Adds a negative canary reproducing the exact const-without-type AIT-02 failure class.
8. Prevents Invoke-AITeamCodexExec from launching Codex when schema preflight fails.
9. Corrects usage semantics:
     modelAttempts = Codex processes actually launched
     modelCalls = completed turn.completed model calls
     apiRejectedBeforeGeneration = API rejections before any completed model turn
10. Doctor now reports Structured output schemas PASS/FAIL.

No ERP runtime code is changed.
No model call is required to validate this patch.
No Codex restart is required because SKILL.md is unchanged.
