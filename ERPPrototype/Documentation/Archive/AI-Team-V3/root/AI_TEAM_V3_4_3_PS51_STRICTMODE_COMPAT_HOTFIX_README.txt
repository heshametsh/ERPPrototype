ERP AI Team V3.4.3 - PowerShell 5.1 StrictMode compatibility hotfix

Purpose
- Fix the V3.4.2 local compatibility test failure: `$Mode` was expanded while building a regex under Set-StrictMode on Windows PowerShell 5.1.
- Preserve the V3.4.2 reviewer-smoke fix: reviewer smoke creates runs with the underlying canonical mission mode (`review`), not an execution subtype.
- Keep the runner-mode guard local and zero-AI.

What changed
- Replaced fragile parsing of New-AITeamRun's ValidateSet declaration with the explicit canonical mission-mode contract: review, product, deterministic.
- The compatibility test still scans all run_*.ps1 files and fails locally if a runner hard-codes any unsupported literal -Mode.
- Team version is 3.4.3.

Safety
- No ERP runtime files are changed.
- The compatibility test launches no Codex model calls.
- Do not run the reviewer smoke unless the local compatibility test passes first.
