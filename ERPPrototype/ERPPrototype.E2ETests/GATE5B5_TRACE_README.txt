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
dotnet run --project ERPPrototype.E2ETests -- --revo-gate5b5-trace

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
