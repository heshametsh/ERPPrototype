ERP AI Team V3.5 - Isolated Reviewers + Token/Transport Guard
Date: 2026-08-23
Baseline expected: V3.4.3 / commit 0ce30e6 (or equivalent clean tree before extracting this patch)

WHY THIS PATCH EXISTS
The uploaded AIT-02 Revo smoke evidence proved four separate defects:
1) Native Windows Codex read-only sandbox blocked every local repository read/search process before creation.
2) A long sandbox diagnostic ending in ':9' was mistaken for file:line evidence and reached Path.GetFullPath, causing the Windows path-length crash.
3) After local reads failed, Codex called list_mcp_resources and received a large app/plugin resource listing. The failed reviewer turn accumulated 208,253 input tokens (148,736 cached).
4) Codex v0.149.0 emitted reasoning_output_tokens=600, while the harness recorded reasoning as zero.

WHAT V3.5 CHANGES
- Engineering reviewer/Lead/Product model calls run in disposable detached Git worktrees at the exact mission commit.
- Reviewer Codex sandbox is workspace-write inside that disposable worktree so Windows read/search processes can run. Main ERP working tree is never the reviewer workspace.
- Host checks disposable worktree cleanliness and main-repo fingerprint; any reviewer write fails the run.
- Nonessential Codex plugins/apps/connectors/MCP surfaces are disabled for engineering calls; prompts explicitly prohibit those detours.
- Qualification reviewers are sequential and budget-aware; a broken/expensive call stops before sibling reviewers or Lead consume allowance.
- Prompt bytes are blocked before launch; direct input/uncached token, MCP, and sandbox-block budgets are enforced after each call.
- Evidence locations are strict, bounded repository-relative file:line values. Bad evidence returns a gate failure instead of throwing.
- Reviewer schema permits empty evidenceAnchors only to report an honest access failure; Finding Gate still requires real evidence to PASS.
- UTF-16 Codex event logs and reasoning_output_tokens are parsed correctly; uncached input/MCP/event-byte telemetry is exposed.
- Local compatibility test now covers the exact long-evidence crash, isolated worktree lifecycle, main-tree isolation, all PowerShell parse checks, UTF-16/reasoning telemetry, and budget canaries with zero AI.

IMPORTANT
This patch does NOT claim the token problem is solved before measurement. The next paid test remains exactly one Revo smoke after the zero-AI compatibility test passes and the patch is committed. Do not run full AIT-02 yet.

ERP runtime code is not changed by this patch.
