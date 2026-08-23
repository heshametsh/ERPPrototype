ERP AI Team V3.5.1 - PowerShell 5.1 interpolation parse hotfix
Date: 2026-08-23

Purpose
- Fix the V3.5 local compatibility failure in run_ai_test.ps1 under Windows PowerShell 5.1.

Root cause
- A double-quoted error message contained `$role:`. In PowerShell, a colon immediately after an unbraced variable name is parsed as part of a scoped-variable reference. Under the parser this is invalid here.

Fix
- Changed the interpolation to `${role}:` so the variable boundary is explicit.

Scope
- One executable file changed: ERPPrototype/Tools/AITeam/run_ai_test.ps1
- No ERP runtime files changed.
- No Codex/model call is required to validate this hotfix.

Validation performed before packaging
- Scanned all V3.5 AI Team PowerShell files for unbraced ordinary variable references followed by `:`; no remaining unsafe occurrence was found.
- ZIP integrity checked.

Apply this hotfix over the already-extracted V3.5 working tree, rerun Test-AITeamRuntimeCompatibility.ps1, and commit only after the full local test passes.
