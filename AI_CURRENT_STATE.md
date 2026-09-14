# AI CURRENT STATE

Updated: 2026-09-14
Mission: REVO-HIDE-UNHIDE-20260912
Mission status: **COMPLETE**

## Current mission

Hide/Unhide Columns on the active RevoGrid Gate 5C-1 is complete and accepted. The approved year-scoped visibility contract, SQL persistence, runtime wiring, History integration, right-click menu, year switching, selection/focus reconciliation, and visible Money aggregate behavior are checkpointed locally at 0e9117f. User manual behavior acceptance is PASS. Focused Hide/Unhide browser evidence, B9-B11 full regression, B12 Real DB Save, and the 36/36 SQL integration suite are all PASS. Rename remains a protected accepted foundation and must not regress.

## Authority

1. Live Git/worktree + current code + executed evidence.
2. Latest user-approved behavior/instruction.
3. This compact state for logical project state only.
4. Current canonical documentation.
5. `AI_WORK_LOG.md` chronology.

Git branch/HEAD/CLEAN-DIRTY are deliberately **not mirrored here**. Read them live from Git whenever they matter.

## Approved Hide/Unhide contract

- Visibility is owned by Department + Work Year + stable FieldKey/prop. Hiding a column in one year does not hide it in another year.
- Width ownership does not change: width remains Department + FieldKey and is shared across years.
- Legacy department-wide IsHidden state is not migrated into the new year-scoped visibility model. The new visibility state starts with all columns visible once.
- Hide and Unhide live in the same right-click column context menu. Unhide lists the hidden columns for the current year on demand.
- Row number cannot be hidden and at least one data column must remain visible.
- Hidden means visually hidden only. The column remains logically present and must keep participating in Sort, Filter, row/data movement, edits, History, and Save semantics.
- Hide/Unhide applies locally immediately and reaches SQL only through the normal explicit Save.
- One Hide/Unhide action is one Sheet History action; History never crosses a Work Year boundary.
- Selection/focus involving the affected prop is safely cleared/reconciled before the visibility projection changes.
- Hidden Money columns are excluded from visible selection/aggregate displays; fixed yearly summaries remain independent.
- Revo integration keeps complete authored columns and projects visibility through a thin prop-based visibility/trim adapter. Do not implement Hide by deleting definitions from grid.columns.
- Visibility must be reapplied after column rebuild/update. Identity is stable prop/FieldKey, never numeric display index.
- Existing Rename behavior and its R00-R13/full-regression protection remain mandatory.
## Accepted Rename behavior

- Single-click on a header keeps the normal whole-column selection behavior.
- Double-click directly on a Custom Column name enters inline Rename and clears whole-column selection once Rename intent is established.
- Double-click on Filter, Sort, or a core-column header does not enter Rename.
- The old name is selected inside the Rename input; the underlying Custom Column header text is not browser-selectable.
- Enter commits; Escape cancels; valid outside-click commits once; invalid outside-click stays editable.
- Validation preserves trim/non-empty/max-150/duplicate semantics; server/RowVersion remains authoritative.
- Rename changes name only. Id, FieldKey/Revo `prop`, DataType, LayoutOrder, values, and year ownership remain unchanged.
- Rename is one atomic Column Workspace History action. Undo/Redo repaints the visible authoritative header through Revo-owned rendering.
- Save persists the current-year name only; reload preserves the new name and existing custom values.
- No Hide/Unhide, width persistence, ordering, context-menu expansion, or unrelated column parity was added.

## Proven closure evidence

- RevoGrid Community 4.25.2 source review established `headerdblclick`, `beforeheaderrender`, Revo-owned `columnTemplate`, and public `updateColumns(cols)` as the supported lifecycle used by the accepted implementation.
- `refresh("rgCol")` is explicitly rejected for this design; Revo `refresh()` is not a column-refresh API in 4.25.2.
- The final source removes persistent manual header DOM ownership and the failed V3 second-mousedown workaround. Custom header name text uses `user-select: none`; the Rename input remains selectable.
- Focused Rename break suite **R00-R13 PASS**, including click intent, Escape/no-op, validation, Filter/Sort/core isolation, rapid Enter/History, outside-click, Save/reload/year isolation, and stale RowVersion concurrency rejection.
- Final one-command regression **PASS**:
  - Real Employee Workday 00-17;
  - Rename Focused;
  - B9-B11 full regression;
  - B12 Real DB Save;
  - Integration tests.
- Final B12 evidence proves Rename Save/reload/value stability, and the full run loaded Gate module `20260912-revo-rename-6`.
- The final harness corrections changed tests only; no product runtime change was required after the accepted Rename source was established.
- Hide/Unhide focused browser suite **H00-H05 PASS**: real-menu Hide, Dirty/History, Undo/Redo, Save/SQL, reload, Work Year isolation, Unhide, and visible Money aggregate restoration.
- Hide/Unhide backend SQL integration remains **36/36 PASS**, including year isolation, last-visible-column protection, and stale RowVersion rejection.
- Final B9-B11 full regression **PASS** after test-only harness alignment for hidden menu buttons.
- Final B12 Real DB Save **PASS** on Gate module 20260912-revo-hide-atomic-1, including the 1,200-cell large Save and concurrency.
- No Product defect was found during closure; harness-only fixes corrected the focused selector, B9 visible-button expectation, and B12 freshness token. One B9 startup timeout was confirmed Environment by standalone PASS.
- Local accepted Product/Test checkpoint: 0e9117f (Close Revo Hide Unhide column visibility).

## Protected foundations

- Snapshot-safe Save and accepted Baseline/Dirty semantics.
- Real SQL Save, RowVersion optimistic concurrency, edit-while-Save, persisted delete/re-add identity, and cross-year transactional Save.
- Selection Core V4R3 and the accepted B9-B11 structure/selection/save behavior.
- Gate 5C-1 visible aggregates and Custom Money behavior.
- Year-scoped Custom Column definitions and cross-year custom-value mapping.
- Rename is now an accepted foundation; do not reopen its settled header lifecycle without new failing evidence.
- Hide/Unhide is now an accepted foundation; preserve year-scoped visibility, explicit Save semantics, History atomicity, selection reconciliation, and visible-only Money aggregates unless new failing evidence proves a defect.

## Open review findings

These remain review findings only; accepted Work Orders feature closures do not authorize unrelated fixes.

- `SEC-001`: forced temporary-password protection is not uniform across Admin mutation paths.
- Startup seeding can reactivate a disabled initial Admin, contrary to the recorded restart rule.
- The documented minimum-8-simple-character temporary-password rule is not explicitly encoded in Identity options.
- Later Revo Gate wrappers are inconsistent about route-level Employee authorization; server-side scope checks remain present.
- Revo uses Saudi UTC+3 for current business year while some legacy/service defaults use `DateTime.Now.Year`.
- Revo 4.25.2 still depends on jsDelivr CDN assets; production self-host/pin/license closure remains open.
- The year-scoped Custom Column migration is forward-only; rollback requires database backup/restore.
- Admin/Login/Security automated coverage is thinner than Work Orders SQL/browser coverage.

## Workflow rules that matter now

- Classify every red result before changing product behavior: PRODUCT, TEST/HARNESS, BUILD/STALE, TOOLING, or ENVIRONMENT.
- When an automated test appears to expose a PRODUCT defect, show the exact Expected vs Actual and evidence to the user before changing product code.
- Fix the owner of the failure only; do not turn a test/harness failure into a product change.
- Prefer the existing one-command full regression for Work Orders closure after focused evidence.
- The AI Change Gate preview experiment is retired and is **not** a mandatory workflow.

## Next action

Await the next user-approved ERP mission. Start from the local accepted checkpoint, run the bootstrap, inspect only mission-relevant code/evidence, and preserve the accepted Rename and Hide/Unhide foundations unless new failing evidence proves a defect. Remote Git/GitHub remains out of the routine workflow until the user reopens it.

## Communication

Explain the program as cause and effect in natural Egyptian Arabic: what happened, why it matters, and what decision follows. Keep implementation detail in the background unless it changes the decision or the user asks for it.
