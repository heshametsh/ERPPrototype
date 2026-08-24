ERP AI Team V3.4.2 - Reviewer Smoke Mode Hotfix

Purpose
- Fix the single-reviewer smoke failing before Codex because run_reviewer_smoke.ps1 passed execution subtype reviewer-smoke into New-AITeamRun.Mode.
- Preserve the canonical mission mode (review) in run metadata.
- Add a local compatibility regression guard that scans all run_*.ps1 files for unsupported literal New-AITeamRun modes before any model call.

Expected impact
- Zero AI/tokens for the compatibility test.
- No ERP runtime code changes.
- No Codex restart required.

Expected compatibility output includes:
- Team version: 3.4.2
- Single-reviewer smoke runner parse/CLI wiring: PASS
- Runner mode contract (review/product/deterministic): PASS
