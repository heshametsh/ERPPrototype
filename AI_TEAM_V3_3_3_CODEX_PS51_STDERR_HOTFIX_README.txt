ERP AI Team V3.3.3 - Codex / Windows PowerShell 5.1 native STDERR hotfix

Baseline expected: commit 7d537a7 or later V3.3 local-first harness before V3.3.2 was applied.
This patch is cumulative: it includes the V3.3.2 official Codex installer fix plus the V3.3.3 native STDERR fix.

Why this exists
- Codex CLI 0.149.0 can report `Logged in using ChatGPT` on STDERR while exiting successfully.
- Windows PowerShell 5.1 converts native STDERR records into NativeCommandError objects.
- The harness intentionally uses ErrorActionPreference=Stop, so a successful status command could terminate Doctor/Setup.

Changes
- Adds a PS5.1-safe native capture helper that temporarily uses Continue only around native execution, preserves exit code, and normalizes ErrorRecord text.
- Doctor/login status now uses that helper.
- Setup version/login checks use the same helper.
- Model-backed `codex exec` also shields normal STDERR diagnostics from becoming terminating PowerShell errors while still preserving STDERR to its evidence file and honoring Codex's exit code.
- Keeps the V3.3.2 official installer wrapper fix (no Byte[] -> "91 67 ..." parsing issue).
- Adds a deterministic compatibility probe that writes to native STDERR with exit code 0 and proves the harness remains healthy.
- Team telemetry version is bumped to 3.3.3.

No ERP runtime code is changed. No Codex model call is made by the compatibility test.
