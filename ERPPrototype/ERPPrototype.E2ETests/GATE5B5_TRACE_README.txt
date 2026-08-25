RevoGrid Gate 5B-5 — Real Browser Diagnostic Journey
=====================================================

Purpose
-------
This is NOT a PASS/FAIL state lab.
It opens the real Gate 5B-5 Work Orders page in visible Chromium and performs
real browser UI actions for Insert/Delete/Undo/Redo/Filter/Sort.

It always uses application port 5265.
It uses the existing temporary isolated E2E SQL database, so Gate 5B-5 changes
do not touch the developer database.

Run
---
powershell -NoProfile -ExecutionPolicy Bypass -File .\Tools\E2E\Invoke-RevoGridE2E.ps1

The wrapper performs repository-scoped stale-process cleanup before dotnet
build/run. It never terminates unrelated dotnet, Visual Studio, IIS Express,
or other .NET processes. The direct dotnet command remains usable after the
preflight cleanup, but the wrapper is the supported locked-output-safe path.

Dedicated Remaining Amount diagnostic
-------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File .\Tools\E2E\Invoke-RevoGridE2E.ps1 -RunnerArguments --revo-gate5b5-financial-diagnostic

This diagnostic uses real RevoGrid cell edits, Undo/Redo, native clipboard
Paste, and a Remaining Amount readonly attempt. It records source values,
rendered Remaining text, Revo events, refresh calls, History/Dirty state, and
browser diagnostics in the run artifact directory.

Evidence
--------
The runner writes:
- Playwright trace with screenshots/snapshots/sources
- Full step-by-step JSON timeline
- Browser console/page/network diagnostics
- Final browser screenshot
- Web application log
- Short observation notes

At the end it creates one Desktop ZIP named:
ERP_REVO_GATE5B5_TRACE_YYYYMMDD-HHMMSS.zip

Upload that ZIP for code/trace review before doing the final manual acceptance test.

Filter refresh verification added 2026-08-21:
- Insert while Work Type = 401 stays visible in the working snapshot.
- Re-Apply the unchanged 401 filter hides the non-matching inserted row.
- Undo restores that pre-Apply snapshot without undoing the Insert.
- Redo refreshes the filter result again.


Multi-row verification added 2026-08-22:
- Open Insert Rows..., enter 3, and insert Below through the real dialog.
- One Undo removes all 3 inserted rows; one Redo restores all 3.
- Select 3 visible rows, right-click inside that selection, and Delete Selected Rows.
- One Delete removes all 3 selected row identities; one Undo restores all 3.
