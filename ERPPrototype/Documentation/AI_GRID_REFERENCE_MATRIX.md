# AI GRID REFERENCE MATRIX

Purpose: keep only the Grid comparisons that materially affect current ERP behavior. This is not a full product catalog.

## Evidence labels

- `LOCAL-CODE`: current ERP/local package source or integration code inspected.
- `OFFICIAL-SOURCE`: official public source inspected.
- `OFFICIAL-DOCS`: official documentation/example inspected.
- `PRO-SOURCE`: licensed Pro source/package implementation inspected.
- `INFERRED`: engineering inference; never present it as verified implementation fact.

## Current rows

| Behavior | Tabulator legacy baseline | Revo Community | Revo Pro | ERP owner | Decision | Evidence status |
| --- | --- | --- | --- | --- | --- | --- |
| Custom Column Add/Delete/Save | Current Tabulator code keeps Custom Column structure in ERP state, marks it Dirty, includes it in Save, and accepts the saved definition baseline | RevoGrid Community 4.25.2 provides column-set mechanics/events; current ERP Column Workspace owns custom structure state and the preserved stash extends the B12 projection/Save handshake | Public Pro History docs track built-in column-schema commands, but application-provided command handlers / remote side effects remain application-owned | ERP owns business definition, year scope, persistence, Save transaction, and application history meaning | Reconnect the existing ERP persistence/history bridge; do not delegate year/business persistence to the Grid | REFERENCE PASS COMPLETE — LOCAL-CODE + OFFICIAL-DOCS; no licensed PRO-SOURCE |
| Undo/Redo across Save for column structure | Current Tabulator code removes/sanitizes Custom Column structural history after an accepted Save baseline | Current ERP Sheet History tracks structural Custom Column actions; preserved stash discards saved Column Workspace history after accepted Save | Public Pro History docs can track built-in column-schema mutations, while application-owned handlers are excluded; Pro stack/source replacement rules do not define ERP Save-baseline semantics | ERP owns whether saved structural history survives, is rebased, or is discarded | Keep current preserved behavior as candidate only; user-visible post-Save Undo/Redo behavior must be manually checked after reconnect before final acceptance | REFERENCE PASS COMPLETE — LOCAL-CODE + OFFICIAL-DOCS; behavior acceptance PENDING manual reconnect test |
| Cross-year Custom Column movement | Tabulator `/work-orders` remains a legacy/live behavior reference until cutover; Phase 1 regression acceptance is Revo Gate 5C-1 | Grid should not own cross-year business semantics | Pro capability is not expected to own ERP year semantics; verify only if relevant after reconnect | ERP service/data layer | Year-scoped server/data behavior implemented; Revo Custom Column persistence/history reconnect remains post-Phase-1 | REAL SQL VERIFIED (34/34 + populated migration); GATE5B12 FULL PASS; REVO EMPLOYEE REAL WORKDAY PASS (00-17); visible year-scoped Revo Custom Column Add/Save/year-isolation/delete/cross-year/order behavior accepted in the recovered closure |

| Custom Column Rename / column-menu parity | Tabulator remains the historical parity reference for future companion column-menu work; Rename itself now has an explicit user-approved Revo behavior contract | RevoGrid Community 4.25.2 source confirms `headerdblclick`, `beforeheaderrender`, Revo-owned `columnTemplate`, and public `updateColumns(cols)`; `refresh("rgCol")` is not a supported column-refresh call | Public Pro docs remain advisory only; no Pro source claim without licensed source | ERP owns name validation, identity, year scope, Save/History meaning; Revo owns the supported header render/update lifecycle | Accepted Rename uses Revo-owned header rendering, stable `prop`, one ERP History action, and name-only persistence; companion menu parity remains a separate future mission | ACCEPTED 2026-09-12 — LOCAL-CODE + OFFICIAL-SOURCE + USER MANUAL + REAL-BROWSER E2E; no licensed PRO-SOURCE |

Update only rows touched by the active mission. Remove obsolete rows when no longer useful; historical decisions remain in Git/work log.

## CC-YEAR-001 manual Revo evidence

- Active surface: RevoGrid Gate 5C-1.
- Real local DB migration: applied and post-verified after a validated backup.
- User manual core Revo result: PASS for edit/save/refresh, year switching, cross-year Cancel/Continue, Sort/Filter + Save, and Undo/Redo.
- Reconnected Custom Column manual result after fixes: PASS for Add + value + Save/reload, year isolation, valued Delete without forced Refresh/false layout conflict, cross-year custom-value movement, and destination-column ordering.
- Custom Column Rename is accepted on Gate 5C-1. Future companion column-menu parity remains a separate mission and should still use the focused Tabulator → Revo → ERP reference pass.
- Acceptance order remains: user-approved behavior/reference → manual user acceptance → assistant/automated closure.


## CC-YEAR-001 reference pass receipt

- Local legacy reference inspected: current `tabulatorCustomColumns.js`.
- Local Revo reference inspected: installed RevoGrid Community 4.25.2 integration, current Column Workspace/Save block, and preserved Revo persistence/history stash diff.
- Official RevoGrid Community API reference inspected for column-set events/mechanics.
- Official RevoGrid Pro public History/Context Menu documentation inspected for structural History and application-owned command-handler boundaries.
- No licensed Revo Pro package/source was available in this review; evidence label remains `OFFICIAL-DOCS`, not `PRO-SOURCE`.

## REVO-RENAME-20260911 closure receipt

- Revo Community version reviewed: **4.25.2**.
- Supported lifecycle used by the accepted implementation: `headerdblclick`, `beforeheaderrender`, Revo-owned `columnTemplate`, and `updateColumns(cols)` by stable `prop`.
- `refresh("rgCol")` was disproven for column refresh and is not part of the accepted design.
- ERP Column Workspace owns Rename validation, year scope, Dirty/History, Save projection, persistence identity, and RowVersion authority.
- User manual interaction PASS plus focused browser R00-R13 PASS and the final one-command full regression PASS close Rename.
- No licensed Revo Pro source was inspected; Pro references remain `OFFICIAL-DOCS` only.
