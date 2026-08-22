ERP AI TEAM V3.3 — LOCAL-FIRST + MEASURED CODEX RUNNER
Date: 2026-08-22

WHAT CHANGED
1. Deterministic tests are launched from PowerShell and use ZERO Codex model calls.
2. A stable local command is installed: erp-ai-team.
3. Model-backed tests use Codex CLI only after deterministic preflight says AI is required.
4. The runner captures Codex JSON events and direct input/cached/output token counts.
5. A low-effort router selects the smallest reviewer set; reviewers remain independent/read-only.
6. Lead starts only after deterministic report/completion gates pass.
7. Weekly allowance percentage is never guessed. It can be manually snapshotted for before/after comparisons.

ONE-TIME LOCAL COMMAND SETUP
Run from repository root:
  & .\ERPPrototype\Tools\AITeam\Setup-AITeamLocalCommand.ps1 -RepoRoot (Get-Location).Path

NORMAL COMMANDS
  erp-ai-team doctor
  erp-ai-team test AIT-10
  erp-ai-team latest
  erp-ai-team history AIT-10
  erp-ai-team usage
  erp-ai-team allowance 79

ONE-TIME CODEX CLI SETUP BEFORE FIRST MODEL TEST
  erp-ai-team setup-codex

This uses the official OpenAI Windows Codex installer when the CLI is missing and then opens the ChatGPT sign-in flow.

IMPORTANT
- Do not open the Codex desktop app just to run AIT-04/AIT-10.
- AIT-02 and other model tests will consume the ChatGPT Codex allowance; V3.3 measures direct CLI token usage so we can tune cost with evidence.
- This patch changes AI engineering tooling only. It does not modify ERP runtime behavior.
