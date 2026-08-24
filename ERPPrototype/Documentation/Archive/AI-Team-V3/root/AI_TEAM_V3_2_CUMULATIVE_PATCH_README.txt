ERP AI Team V3.2 - cumulative low-friction + Windows runtime hardening
Date: 2026-08-22
Base expected: commit c948abf (V3 Quality + Observability)

Why this patch exists
---------------------
The real AIT-04 run at c948abf proved the functional gates:
- Finding Gate rejected the malformed report.
- Lead did not start.
- Cleanliness passed.
- Routing oracle passed with zero reviewers.

The harness still returned FAIL while closing the run because Windows PowerShell converted/reformatted timestamps through the current locale. The run also remained RUNNING in run.json because finalization itself failed. A prior Windows PowerShell 5.1 incompatibility with System.IO.Path.GetRelativePath was also observed.

What V3.2 changes
-----------------
1. Cumulatively includes V3.1 low-friction dispatch:
   - test command dispatches before project/docs/prompts are reread;
   - AIT-04/AIT-10 take the zero-agent deterministic fast path;
   - stable evidence/state root remains %LOCALAPPDATA%\ERPPrototype\AI-Team;
   - Setup-AITeamCodexSandbox.ps1 adds only that state root as a writable Codex root;
   - metrics/trace/history remain enabled.

2. Locale-safe timestamps:
   - machine timestamps use invariant ISO-8601 UTC;
   - run/trace calculations prefer UTC ticks;
   - JSON DateTime values are normalized without converting through locale-formatted strings.

3. Windows PowerShell 5.1-safe relative paths:
   - removes dependency on System.IO.Path.GetRelativePath;
   - manifest paths are derived with a repository-root-safe helper.

4. Fail-safe run closure:
   - if normal finalization fails, an emergency FAIL closure updates run.json/latest.json and writes summary.txt instead of leaving the run stuck at RUNNING.

5. Runtime compatibility smoke test:
   ERPPrototype\Tools\AITeam\Test-AITeamRuntimeCompatibility.ps1
   - tests manifest relative paths;
   - deliberately finalizes under ar-EG culture when available;
   - verifies trace-summary, metrics, latest, index and run closure;
   - runs without model agents.

What this patch does NOT change
-------------------------------
- No ERP runtime code.
- No AIT oracle expectations.
- No reviewer conclusion is changed to make a test pass.
- No Product/engineering business decision.

After applying
--------------
1. Run Test-AITeamRuntimeCompatibility.ps1 before committing.
2. Run Setup-AITeamCodexSandbox.ps1 once.
3. Commit/push.
4. Restart Codex once because SKILL.md changed from V3 to V3.2.
5. Re-run AIT-04.
