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
| Cross-year Custom Column movement | Tabulator is historical parity evidence only | Grid does not own cross-year business semantics | Pro is not an ERP year-semantics owner | ERP service/data layer | Accepted year-scoped server/data behavior is active on canonical Revo Work Orders; destination reuse/create/conflict/blank-value rules remain ERP-owned | ACCEPTED - SQL 34/34 + populated migration + Gate5B12 FULL PASS + Employee Real Workday PASS + user-visible year-scoped Revo flows |

| Custom Column Rename / column-menu parity | Tabulator remains the historical parity reference for future companion column-menu work; Rename itself now has an explicit user-approved Revo behavior contract | RevoGrid Community 4.25.2 source confirms `headerdblclick`, `beforeheaderrender`, Revo-owned `columnTemplate`, and public `updateColumns(cols)`; `refresh("rgCol")` is not a supported column-refresh call | Public Pro docs remain advisory only; no Pro source claim without licensed source | ERP owns name validation, identity, year scope, Save/History meaning; Revo owns the supported header render/update lifecycle | Accepted Rename uses Revo-owned header rendering, stable `prop`, one ERP History action, and name-only persistence; companion menu parity remains a separate future mission | ACCEPTED 2026-09-12 — LOCAL-CODE + OFFICIAL-SOURCE + USER MANUAL + REAL-BROWSER E2E; no licensed PRO-SOURCE |
| Column Hide/Unhide / visibility | Legacy Tabulator remains historical behavior reference only | RevoGrid Community 4.25.2 trim/dimension mechanics keep authored identity while hiding rendered columns | Public Pro visibility concepts remain advisory only | ERP owns year scope, persistence, History/Dirty/Save meaning, last-visible safety, aggregates, and selection reconciliation; Revo adapter owns visual trim mechanics | Accepted implementation keeps full authored columns, stores hidden props by Work Year, reapplies visibility after rebuild, never treats Hide as Delete, and has no legacy Layout visibility owner | ACCEPTED — LOCAL-CODE + OFFICIAL-SOURCE + USER MANUAL + H00-H05 + SINGLE-OWNER GATE + SQL 37/37 + FULL REGRESSION; no licensed PRO-SOURCE |

## REVO-HIDE-UNHIDE-20260912 reference pass receipt

- Legacy Tabulator behavior reviewed: Hide/Unhide is presentation-only, participates in client History, persists through normal Save, keeps hidden data logically alive, and uses a same-context-menu Unhide list.
- Historical review found `DepartmentColumnLayout` coupled Width + IsHidden. The year-scoped `DepartmentColumnVisibility` path became the accepted visibility owner, and the 2026-09-17 single-owner cleanup removed legacy `DepartmentColumnLayout.IsHidden` from schema/entity/contracts. Width remains department-scoped and width-only.
- Revo Community 4.25.2 source review established the preferred mechanics: keep the complete authored column source and project visibility through trim/dimension state keyed from stable props; reapply after column-set rebuilds.
- Public Revo Pro docs were used as architecture reference only: hidden state is prop-based, one visibility owner drives dialogs/menu behavior, and hidden columns preserve underlying identity/calculation behavior.
- User-approved override: visibility is Department + Work Year + FieldKey; width stays Department + FieldKey; old hidden choices reset to all-visible once; Hide and Unhide are in the same right-click menu; hidden columns continue to participate in Sort/Filter/data movement.
- No licensed Revo Pro source was inspected; Pro evidence remains `OFFICIAL-DOCS`.

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
