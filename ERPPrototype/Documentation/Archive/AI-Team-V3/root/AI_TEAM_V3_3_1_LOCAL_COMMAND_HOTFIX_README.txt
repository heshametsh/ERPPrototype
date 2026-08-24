ERP AI TEAM V3.3.1 — LOCAL COMMAND SHIM HOTFIX
Date: 2026-08-22

WHY
The V3.3 local command installer could report PASS even when the generated CMD shim failed on the target Windows machine. The observed failure was an invalid PowerShell -File path followed by Windows trying to open the .ps1 via file association.

FIX
1. The CMD shim now stores the CLI path in a CMD variable and invokes powershell.exe with conservative quoting.
2. Stale erp-ai-team.ps1/.bat/.exe/.com siblings are removed from the dedicated AI-Team bin directory.
3. Setup does not report PASS until the exact installed erp-ai-team.cmd successfully runs `doctor`.
4. Setup also verifies `Get-Command erp-ai-team` resolves after installation.
5. Documentation now uses powershell.exe -ExecutionPolicy Bypass for the one-time setup, so restrictive Windows ExecutionPolicy does not block it.

SCOPE
Tooling-only hotfix. No ERP runtime behavior changes. No SKILL.md change, so no Codex restart is required for this hotfix.
