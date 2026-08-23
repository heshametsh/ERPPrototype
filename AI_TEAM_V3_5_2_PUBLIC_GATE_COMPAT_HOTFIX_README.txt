ERP AI Team V3.5.2 - Public Finding Gate compatibility hotfix
Date: 2026-08-23

Purpose
- Fix the V3.5 compatibility test failure where Test-AITeamRuntimeCompatibility.ps1 called the module-private Test-AITeamEvidenceLocation helper directly.
- Exercise the supported public Finding Gate instead, which is the real production path used by reviewer reports.
- Preserve the original regression goal: a long diagnostic string ending in :9 must be rejected without any GetFullPath/path-length exception.

Scope
- .ai/team-config.json -> teamVersion 3.5.2
- ERPPrototype/Tools/AITeam/Test-AITeamRuntimeCompatibility.ps1
- This README

No Codex/model call is made by the compatibility test.
Do not run a reviewer until the full local compatibility test passes.
