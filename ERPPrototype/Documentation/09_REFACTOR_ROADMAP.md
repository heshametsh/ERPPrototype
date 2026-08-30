# CURRENT REVO ROADMAP OVERRIDE — POST V4R3

Accepted checkpoint: `0e7a6be512f92fe076f21261b86da5079897d48e`.

Completed:

1. Gate 5B-6 Unified Validation
2. Gate 5B-7 Persistence Identity
3. Gate 5B-8 Selection Context
4. Gate 5B-9 Structure Workspace
5. Gate 5B-10 Header Selection
6. Gate 5B-11 Snapshot-safe Save
7. Selection Core V4R3 hardening

Current mission:

8. Real DB Save

Then:

9. RowVersion concurrency and Save failure recovery
10. database-connected Custom Column/layout persistence
11. production parity and qualification
12. controlled `/work-orders` cutover

B12 must reuse the accepted B11 snapshot handshake.
Do not create a second Save architecture.

---

# CURRENT REVO ROADMAP OVERRIDE — 2026-08-30

The stable Revo code checkpoint is Gate 5B-10 at `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`. Older roadmap items remain historical when they describe B6/B9 or B10 selection as the next step.

## Phase A — Finish the Revo production candidate

1. ✅ Gate 5B-6 Unified Validation.
2. ✅ Gate 5B-7 client Persistence Identity.
3. ✅ Gate 5B-8 Selection Context.
4. ✅ Gate 5B-9 Structure Workspace + clipboard range fill.
5. ✅ **Gate 5B-10 — Header Selection:** Plain/Ctrl/Shift whole-row/whole-column selection, Filter-driven row pruning, Sort identity preservation, virtualization-safe visible selection, right-click preservation and dataset-switch clearing while Revo keeps native cell range/focus ownership.
6. ▶ **Snapshot-safe Save handshake — current bounded mission.**
7. Real DB Save with Add/Update/Delete + server validation/scope/duplicate mapping.
8. End-to-end `RowVersion` concurrency and edit-while-Save-in-flight behavior.
9. database-connected Custom Column/layout Save from Revo.
10. year-move confirmation through the real Revo Save path.
11. high-value employee parity: quick search, KPI/Basket summary, selection totals, production messages.
12. self-host/pin exact Revo assets, reconnect/recovery, target Edge/Chrome and 10k qualification.
13. side-by-side release candidate.
14. controlled `/work-orders` cutover.
15. separate post-cutover Tabulator retirement checkpoint.

**Selection stop rule:** Gate 5B-10 is closed. Do not reopen it into a new selection framework unless regression evidence requires change. Revo remains owner of native range/focus/keyboard/editing/virtualization; disjoint Ctrl multi-cell ranges remain postponed.

---

# CURRENT PRODUCT / ENGINEERING ROADMAP — 2026-08-26

This roadmap supersedes older Gate 5A-current ordering below.

## Phase A — Close Revo Work Orders foundation

1. ✅ Revo read path / Change Engine / Sheet History foundation.
2. ✅ Paste / Filter / Sort / Header Selection / multi-row Insert/Delete.
3. ✅ Range Clear Delete/Backspace + real-browser acceptance at baseline `a74c9c9`.
4. ✅ **Unified Validation — accepted at `6a6f3ce`.**
5. ▶ **Persistence identity contract — next:** `Id`, `ClientKey`, `RowVersion`, `WorkYear`, `DisplayOrder`, custom values.
6. Snapshot-safe Save handshake.
7. Real DB Save: Add/Update/Delete + server validation.
8. Save rejection/failure mapping.
9. Concurrency and edit-while-Save-in-flight behavior.
10. Year move confirmation + save/Undo implications.
11. Custom Columns + width/visibility/layout persistence.
12. High-value employee parity: quick search, KPI/Basket summary, selection totals, production messages.
13. Self-host/pin Revo, reconnect/recovery, target Edge/Chrome, 10k qualification.
14. Side-by-side release candidate.
15. Controlled `/work-orders` cutover.
16. Separate post-cutover Tabulator retirement checkpoint.

**Rule:** Tabulator is a behavior reference until cutover; do not start broad Tabulator refactoring/feature engineering.

## Phase B — Operational ERP foundation

After Revo cutover, shift engineering focus away from Grid feature accumulation.

- Responsible/Owner.
- Stage Entered At.
- Next Action.
- Due Date.
- Blocker / Delay Reason.
- durable Business Activity/Audit.
- Closure/Reopen implementation.
- BranchManager / ProjectManager views matching approved scope.
- Contract/Project light model when exact data model is designed.

## Phase C — Manager Control

- overdue work.
- aging.
- backlog by branch/department/stage.
- high-value Work Orders.
- permits/obligations nearing expiry.
- changes/events today/this week.
- drill-down to underlying Work Orders.
- ProjectManager comparison across Branch Managers.

## Phase D — Specialist workflows

Likely high-value order:

1. Municipality / excavation permit lifecycle.
2. Site / coordinates / GIS basics.
3. Execution.
4. Inspection / Quality / Rework.
5. Documents / Photos.
6. HSE / field evidence where required.

Every module links to same Work Order.

## Phase E — Materials and Commercial

- material issue/return/consumption.
- completion certificates.
- commercial/payment certificates.
- richer Partial/Final invoice lifecycle if needed.
- retention/variations.
- subcontractors.
- cost/profitability.

Do not build full accounting/warehouse before proven operational need.

## Phase F — Scale, Offline, Integration

- multiple employees per department.
- extensible department/module model.
- multi-branch scale.
- 50k/100k data-plane decision only after measurement.
- Offline/sync after workflow/conflict rules are stable.
- APIs/integrations through application boundaries, not Grid/EF internals.
- reporting read models where management scale requires them.

## Stop rules

- no Microservices without evidence.
- no generic Workflow Designer now.
- no giant 100-column Work Order table.
- no Custom Columns as replacement for core domain modules.
- no formula/smart-autofill project just because Grid can support it.
- no full backend rewrite.

See `46_FINAL_LEAD_REVIEW_2026-08-26.md`.

---

# CURRENT REMEDIATION ROADMAP — 2026-08-20

> هذا الترتيب ينسخ “ArrowDown is current task” في Roadmap الأقدم. اختيار RevoGrid تم بعد Grid Shootout مستقل، ولا يعني Rewrite لباقي النظام.

1. ✅ Test Foundation.
2. ✅ `LDR-002`.
3. ✅ Clean Performance/Torture baseline.
4. ✅ Initialization Recovery.
5. ✅ Financial Sort Optimization.
6. ✅ **Grid Engine Shootout / selection** — RevoGrid Community 4.25.2 selected; Univer comparison closed.
7. ▶ **Gate 5A — CURRENT:** isolated Blazor + RevoGrid with the real employee/year read path; no Save mutation and no `/work-orders` cutover.
8. **Gate 5B:** RevoGrid real Dirty/Delta Save, validation result mapping, saved identity/RowVersion reconciliation, Undo/Redo after Save, custom columns/layout persistence.
9. **Gate 5C:** frozen visual parity + full regression + performance + controlled `/work-orders` cutover.
10. **Post-cutover cleanup:** remove obsolete Tabulator production runtime only after a separate accepted checkpoint.
11. Resume Online Reliability.
12. Narrow Save/receipt contract.
13. Concurrency/Schema Integrity.
14. Identity/Security/Permissions.
15. Localization identity foundation.
16. Offline durable state.
17. Sync engine.
18. Extended normal regression + Offline/Sync Stress.
19. Staging + real SEC cable/domain/firewall + limited Pilot.
20. Production only after operations gates.

**Stop rule:** Gate 5A must not modify the live Work Orders route. Gate 5B must not weaken server authority. Gate 5C must not change frozen UI dimensions. Do not delete Tabulator until the RevoGrid cutover has its own accepted checkpoint.

---

# CURRENT REMEDIATION ROADMAP — 2026-08-17

> Phase 8/9 sections below remain historical. The current engineering order after the independent audits is:

1. ✅ **Test Foundation** — completed and checkpointed.
2. ✅ **Fix `LDR-002`** — completed and verified at `33e73c6`.
3. ✅ **Clean Performance Baseline** — Open + visible Real-User + 10k Torture evidence established at `3dc88ff`; UX performance remains an open acceptance issue, not a missing baseline.
4. ✅ **Initialization Recovery** — accepted at `98d9aa3`.
5. ✅ **Financial Sort Optimization** — accepted at `0f6bd3b`.
6. ▶ **ArrowDown / `GRID-001` — CURRENT TASK** — user explicitly reprioritized this measured core-UX regression; identify cause before patch and verify with manual + baseline/deep evidence.
7. **Resume Online Reliability** — remaining Save/year event boundary, unsaved navigation/reload, Admin recoverability.
8. **Narrow Save Contract** — physical field deltas, no full-row/full-year transport, receipt-compatible result; include measured bulk Save/dirty performance findings.
9. **Concurrency/Schema Integrity** — Schema/Config Version, partial conflict preservation, Custom Column races.
10. **Identity/Security/Permissions** — forced password, OTP, server actor identity, XSS, Audit Log, manager capability foundation.
11. **Localization identity foundation** — stable language-neutral codes.
12. **Offline durable state** — IndexedDB Draft/Outbox, all authorized years, 5h/7d rules, Web Locks.
13. **Sync engine** — event-driven Preflight, OperationId/receipts, partial merge/conflict UX, no polling.
14. **Extended normal regression + Offline/Sync Stress.**
15. **Staging + real SEC cable/domain/firewall + limited Pilot.**
16. **Production only after operations gates.**

**Stop rule:** do not jump directly to Offline before Tests + Loader + Save contract are trustworthy. The ArrowDown insertion is valid because the user explicitly changed the priority after a repeatable real-user regression was measured.

# 09 — Maintainability Refactor Roadmap

**Runtime baseline:** Phase 8.8-R2 accepted after the automated runner passed 10/10. Field-level tracking, batch editing, save-result merge, lifecycle ownership, interaction ownership, read-query separation, and save-plan separation are stable.
**Refactor policy:** incremental extraction, identical runtime behaviour, focused regression after every step, and no rewrite.

## Refactor Objectives

1. Keep the Work Orders page easy to review and change.
2. Give every file one clear responsibility.
3. Reduce duplicated structural, history, validation, and save logic.
4. Keep one owner for shared grid state and lifecycle.
5. Preserve the verified Excel-like behaviour and performance improvements.
6. Make future permissions, import/export, warehouse, and invoice work safer.

## Phase 8.1 — Razor / C# Code-Behind Split — COMPLETED

- `WorkOrders.razor` owns markup, bindings, and browser actions.
- `WorkOrders.razor.cs` owns component lifecycle, loading, saving, year switching,
  mapping, DTOs, and disposal.
- No business rule, SQL, JavaScript, permission, or user-interface behaviour was
  intentionally changed.

Structural result:

- `WorkOrders.razor`: about 208 lines instead of about 1,456.
- `WorkOrders.razor.cs`: about 1,260 lines of C# component logic.

## Phase 8.2 — Validation JavaScript Module — COMPLETED

`tabulatorValidation.js` owns:

- Work-order number, work-type, and assignment-date normalization.
- Blank-row and identity-key validation helpers.
- Duplicate indexes and row/cell validation errors.
- Error navigation and pre-save validation.
- Server validation mapping and custom editors.

Structural result:

- `tabulatorTest.js`: about 7,368 lines instead of about 9,462.
- `tabulatorValidation.js`: about 2,139 lines.

## Phase 8.3 — Clipboard and History Module — COMPLETED

`tabulatorClipboardHistory.js` owns:

- Range copy and browser clipboard writing.
- Clipboard parsing, target construction, paste, and range clear.
- Cell-edit and filter transactions.
- Undo/Redo orchestration for cells, filters, and structural transactions.
- Transaction focus restoration and the public `copyRange` facade.

Structural result:

- `tabulatorTest.js`: about 5,836 lines.
- `tabulatorClipboardHistory.js`: about 1,545 lines.
- The existing public API and performance operation names remain unchanged.

## Phase 8.4 — Structural Rows Module — COMPLETED

`tabulatorStructure.js` owns:

- Row context-menu and insert-dialog UI.
- Display-order allocation and rebalance.
- Blank-row construction and selected-row resolution.
- Incremental and bulk insert/delete paths.
- The verified replace-data paths for large delete, Undo, and Redo.
- Structural transaction creation, restoration, and application.
- Bulk-operation pointer locking and browser yielding.

`tabulatorTest.js` remains the central owner of:

- Table/state instances and lifecycle.
- Grid initialization, navigation, viewport handling, and teardown.
- Shared row identity cloning and performance-stage helpers.
- Dirty tracking, save delta, streamed save, and save reconciliation.
- Public state/status calls used by Razor and the extracted modules.

Structural result:

- `tabulatorTest.js`: about 3,526 lines instead of about 5,836.
- `tabulatorStructure.js`: about 2,323 lines.
- `tabulatorValidation.js`: remains about 2,139 lines.
- `tabulatorClipboardHistory.js`: remains about 1,545 lines.
- `tabulatorStructure.js` loads before Clipboard/History so structural Undo/Redo
  delegates to a registered implementation without circular ownership.

## Phase 8.5 — Field-Level Changes and Generic Batch Editing — COMPLETED

- Add `tabulatorFieldChanges.js` as the generic field metadata and batch-change engine.
- Record changed field keys per dirty row.
- Apply Paste, range clear, Undo, and Redo with redraw blocked and one post-processing pass.
- Validate only fields and rules affected by the change.
- Send changed field keys to Blazor and update only those fields in `WorkOrderService`.
- Keep all-fields validation for new rows.
- Centralize current server field keys in `WorkOrderFieldRegistry.cs`.
- Prepare the contract for future user-created columns without implementing their storage/UI yet.

## Planned Following Phases

### Phase 8.6 — Grid Lifecycle and Interaction Review

**R1 completed and user-tested:** `tabulatorLifecycle.js` owns one grid instance from state creation through disposal. Repeated year switching kept one initialization per opened sheet, stable navigation, and no duplicate action.

**R2 completed and user-tested:** `tabulatorInteractions.js` owns the binding of resize, right-click guard, cell edit/selection events, active-sheet pointer tracking, keyboard commands, and document Copy/Paste. Repeated year switching and the complete interaction regression passed without duplicate commands or JavaScript errors.

`tabulatorTest.js` remains the coordinator and retains the actual algorithms. R2 changes ownership location only; it does not change shortcut or grid behavior.

Practical example: changing from year 2026 to 2025 disconnects the old sheet through Lifecycle, then Interactions binds exactly one command route for the new sheet.

### Phase 8.7 — Save and Dirty-State Review

**R1 completed and user-tested:** `WorkOrders.Save.cs` owns the complete Blazor save workflow. No-change Save, one-row Save, year movement, new-row rekey, deletion, and 4,950-row save paths passed after extraction.

**R2 completed and user-tested:** request preparation lives in `WorkOrders.SaveRequest.cs`, result/failure interpretation and row reconciliation live in `WorkOrders.SaveResult.cs`, and `WorkOrders.Save.cs` remains the coordinator. Save, movement, added-row mapping, deletion, and focused performance regression passed.

**R3 completed and user-tested:** `tabulatorDirtyState.js` owns browser original snapshots, dirty row ids, exact changed field keys, deleted saved rows, dirty/deleted Save collection, and accepting/clearing state after Save. Edit/Undo, small and full-column Paste, structural delete/restore, no-change Save, and post-Save zero-state passed. Three repeated 4,949-row opens were 244 ms, 208 ms, and 232 ms, confirming the earlier 19.2-second reading was an isolated development-session event.

### Phase 8.8 — WorkOrderService Split

**R1 completed and user-tested:** `WorkOrderQueryService` owns read-only employee scope, available-year, and selected-year row queries. Repeated switching across 5, 2,998, 4,091, and 4,949-row years preserved counts, ordering, filters, navigation, Save, and year movement.

**R2A completed and user-tested:** the standalone SQL Server runner passed 6/6 for department scope, global duplicate identity, stale RowVersion, year routing, mixed add/update/delete, and whole-transaction rollback.

**R2 completed and automated acceptance passed 10/10:** `WorkOrderSavePlanBuilder` owns input grouping, changed-field normalization, editable-value normalization, field validation, changed/deleted overlap rejection, and required RowVersion presence. `WorkOrderService` still owns authorization, global uniqueness, database RowVersion enforcement, database loading, year movement execution, transaction, persistence, commit, and rollback. The runner now includes four direct plan tests plus the original six SQL scenarios. No further R3/R4 service split is planned before Phase 8.9.

### Phase 8.9 — Final Consolidation — COMPLETED AND ACCEPTED

Completed outcomes:

- Generated build output, machine-local files, duplicate root documentation, and obsolete patch README files are excluded from deliverable archives.
- Historical engineering evidence remains inside `Documentation` rather than as competing root files.
- Release build passed.
- The 10 automated save tests passed against an isolated temporary SQL Server database.
- Git source hygiene passed.
- A source-only archive was created with 169 files and a size of 3.06 MB, excluding `bin`, `obj`, `.vs`, binaries, publish output, and nested ZIP files.
- The optional local Node.js check was skipped because Node.js was unavailable; project-owned JavaScript separately passed syntax checks and no production JavaScript changed in Phase 8.9.
- No additional WorkOrderService split was performed.

Phase 8.9 changed no production behavior, so prior accepted browser/performance evidence remained valid and no new manual grid tour was required.

## Refactor Stop Rule After Phase 8

Phase 8.9 passed and maintainability refactoring is closed. New extraction work is allowed only when a feature or measured defect demonstrates a concrete ownership, testability, or performance problem. The next planned work is permissions and role experience, branch account management, Import/Export, warehouse, and invoices.

## Rules for Every Refactor Patch

1. One responsibility boundary per patch.
2. No business-rule or user-interface change unless separately approved.
3. No new framework and no rewrite.
4. Preserve existing public calls until final consolidation.
5. Run syntax/build checks plus focused regression before continuing.
6. Roll back immediately if behaviour differs and isolate the cause.

## Current Focused Regression for Phase 8.4

1. Load the current-year sheet and change year once.
2. Open the row context menu from a cell and close it normally.
3. Insert one row above and below the current selection.
4. Insert a large block such as 1,000 rows, then Undo and Redo.
5. Delete a small selection, then Undo and Redo.
6. Delete at least 500 rows to activate the bulk replace-data path, then Undo and
   Redo.
7. Confirm row positions and values are restored after Undo.
8. Save a safe structural change, refresh, and confirm persistence.
9. Confirm Copy/Paste and validation still work after structural operations.
10. Confirm no `tabulatorStructure` load/registration error or unexpected
    JavaScript error appears in the console.


## Current Focused Regression for Phase 8.5

Use section O in `06_REGRESSION_TEST_CHECKLIST.md`. Do not continue refactoring or create a Git tag until full-column Paste, Save, Undo/Redo, identity-change rejection, and refresh verification pass.

## Phase 8.5-R2 Focus

Keep the business result of field-level tracking, but stop treating every saved row as a visible row refresh. When the employee saves a full Notes column, the screen already contains those Notes values. Save should merge the internal server version silently and refresh a visible cell only when the server actually changed its displayed value.

Acceptance: after a 4,952-row Paste and Save, arrows remain usable without changing year, and `save.delta.update-rows` should report near-zero rows when the server returned no different sheet values.


## Phase 8.6-R1 Result

Section Q passed in user testing. Six grid initializations matched six opened sheets across year changes, navigation stayed below the regression threshold, and Copy/Paste, right-click, wheel, structure operations, and Save remained functional.

## Current Focused Regression for Phase 8.6-R2

Use section R in `06_REGRESSION_TEST_CHECKLIST.md`. The required evidence is one action per key/pointer/clipboard event before and after repeated year switches, preserved quick/text edit modes, deep-row Resize stability, and no `tabulatorInteractions` or red Console error.


## Phase 8.7-R1 Focus

Use section S in `06_REGRESSION_TEST_CHECKLIST.md`. The key acceptance evidence is that no-change Save, one-row Save, duplicate rejection, year movement, added-row rekey, deletion, large-column Save, refresh persistence, and performance stage names remain identical after the C# extraction.

Practical example: when the employee edits Notes and presses Save, one file now owns the complete journey from “what changed?” through server persistence to the final Arabic success message. Loading a year or leaving the page no longer shares that file.

## Phase 8.7-R2 Focus

Use section T in `06_REGRESSION_TEST_CHECKLIST.md`. Acceptance requires the same no-change, normal edit, duplicate, moved-year, added-row, deletion, and full-column outcomes as R1, with the same Arabic messages and save performance stage names.

Practical example: request preparation must classify a newly inserted row as Added, while result preparation must map its temporary negative Id to the database Id. One step must not silently perform the other step’s responsibility.



## Phase 8.7-R3 Focus

Use section U in `06_REGRESSION_TEST_CHECKLIST.md`. Acceptance requires Dirty State to match visible values through edit, partial Undo, Paste, Redo, insert, delete/restore, moved-year Save, failed duplicate Save, and successful Save.

Practical example: after editing Notes and Status, undoing Status must leave one dirty row with only `notes` in its changed-field list. A successful Save must install the returned row version as the new baseline and clear the unsaved count.


## Phase 8.8-R1 Focus

Prove that extracting the read implementation does not change what the employee receives. Open the current year, switch between at least three years, return to the large year, and compare row counts, branch/department labels, year list, row order, and the existing `open.server.*` performance stages. Then save one safe edit to prove the unchanged facade still reaches the save path.

Acceptance: the page continues to call `WorkOrderService.LoadSheetAsync`, but the implementation is delegated once to `WorkOrderQueryService`; each year opens once, rows remain ordered by DisplayOrder then Id, and no save rule or transaction behavior changes.


## Phase 8.8-R2A Focus

Use section W in `06_REGRESSION_TEST_CHECKLIST.md`. This is not a browser regression and not an InMemory substitute. It must run the real migrations and service against an isolated SQL Server database.

Acceptance requires 6/6 PASS for department scope, global duplicate identity, stale RowVersion, year routing, mixed add/update/delete, and full rollback. Only then may R2 move pure preparation code.

Practical example: R2 must be free to reorganize how changed rows are normalized, but the R2A stale-RowVersion and rollback tests must remain unchanged and pass before and after that extraction.


## Phase 8.8-R2 Focus

Run the automated runner from section X in `06_REGRESSION_TEST_CHECKLIST.md`. Acceptance requires 10/10 PASS. The four plan tests prove the extracted pure boundary; the six SQL tests prove that permissions, uniqueness, concurrency, routing, mixed persistence, and rollback remain unchanged.

Practical example: Arabic/Persian identity digits and surrounding whitespace are normalized before a DbContext is created, but whether that identity already exists anywhere in the company is still decided inside the transaction-backed service and the database unique index.

## Post-Refactor Product Sequence — Phase 9

Phase 8 remains closed. Phase 9 is feature work plus automated protection, not another maintainability split.

1. **9.0 Browser foundation:** Login, Employee scope, sheet open, and year switching on an isolated temporary app/database.
2. **9.1 Financial columns:** estimated amount, approved/actual amount, cumulative partial amount, calculated remaining amount, validation, and visible/whole-sheet totals.
3. **9.2 Column behavior:** filter and correct typed sorting on every fixed column, resizing, and per-user layout persistence.
4. **9.3 Custom columns:** department-level definitions and typed values without dynamic SQL schema changes.
5. **9.4 Long notes:** fixed row height, ellipsis/tooltip, and large editor rather than variable height on thousands of rows.
6. **9.5 Mouse edge auto-scroll:** progressive Excel-like speed with selection and virtual-row regression checks.
7. **9.6 Sheet closure:** one command combining integration, browser, JavaScript, and performance evidence before role screens.

Each feature adds Integration tests for data/business rules and Browser tests for the user journey. Manual testing is limited to visual judgment and perceived Excel-like interaction.



## Phase 9.0C — Current-Sheet Coverage and Stress

Phase 8 remains closed. Phase 9.0C expands automation only: 1,000 rows per year, Full functional coverage for load/search/edit/save/refresh/year switching, and a separate Stress suite for 1,000-row structural insert/Undo/Redo plus a 1,000-row SQL service batch. This is product protection, not additional refactoring.
