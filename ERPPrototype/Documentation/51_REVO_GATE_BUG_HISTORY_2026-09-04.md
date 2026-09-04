# Revo Gate Bug History and Retired Root Evidence - 2026-09-04

## Purpose

This document preserves the durable engineering lessons from the root Gate/Lab manifest and README files reviewed before cleanup.

The retired root files were historical evidence, not runtime dependencies. Exact old file contents, baseline commits, touched-file lists and historical test counts remain recoverable from Git history.

## Source Scope

The review covered 23 root Gate/Lab files from Gate 5A through Gate 5B-5, including the two Year Selector lab README files.

## Durable Problem History

### 1. Year selector identity drift during async option loading

- Symptom: the browser-selected year could diverge from the authoritative C# year after the option list changed asynchronously.
- Risky approaches that were retired: manual `value + onchange` synchronization, render-key forcing, DOM forcing and JavaScript year synchronization.
- Durable fix: Blazor owns the year through `@bind:get/@bind:set`, option identity uses `@key=year`, the selector is not rendered during the unstable initial async option transition, and the grid source changes only after a successful server load.
- Failure rule: if the server-side year switch fails, the selector must return to the year that is actually loaded.

### 2. Year-switch authority must remain server-first

- Opening defaults to the current Saudi business year.
- The last selected year is not silently persisted as a replacement for the server-authoritative open-year rule.
- A year switch replaces the Revo source only after the new dataset is successfully loaded.

### 3. Dirty, Baseline, History and identity must have separate meanings

- `ClientKey` is browser-session row identity.
- `Id` is database identity.
- `DisplayOrder` is persistent ordering identity.
- Dirty means current state differs from the last accepted server Baseline.
- Successful Save advances only the accepted Baseline and does not erase Undo/Redo.
- Failed Save leaves Baseline, Dirty and History intact.
- Sheet History owns Undo/Redo; Change Engine owns Baseline, Dirty and Save state.

### 4. Arabic keyboard layout broke Ctrl+Z / Ctrl+Y recognition

- Root cause: using `KeyboardEvent.key` alone is layout-dependent; the same physical Z/Y keys may not report `z`/`y` under an Arabic keyboard layout.
- Durable fix: use layout-independent `KeyboardEvent.code` with `KeyZ` / `KeyY` as the primary signal, with safe key fallbacks.
- Regression clue: keyboard-layout changes must not change Undo/Redo shortcut meaning.

### 5. One physical Undo shortcut could replay more than one transaction

- Root cause: RevoGrid 4.25.2 can render multiple selection overlays. Each overlay can observe the same document keydown and emit `beforekeydown`, causing the ERP handler to see one physical shortcut more than once.
- Durable fix: de-duplicate the original browser `KeyboardEvent` with a `WeakSet` so one physical Ctrl+Z/Ctrl+Y triggers at most one replay.
- Regression clue: one physical shortcut must change History position by exactly one transaction.

### 6. Undo/Redo focus must use minimal reveal

- A visible or partially visible target changes selection without scrolling.
- An off-screen target scrolls only the minimum distance needed to reveal it at the nearest edge.
- A pinned column must not cause central horizontal scroll.
- If Filter hides the replay target, replay remains successful; focus logic must not remove the Filter to expose the row.

### 7. Paste History must capture what Revo actually applied

- Paste uses Revo's final range payload after native clipping and readonly handling.
- The ERP layer must not reparse clipboard text or recreate Revo range rules.
- One Paste is one History action.
- Paste at the end of the sheet truncates to available rows and does not create rows automatically.

### 8. Excel-like Filter UI must not replace the Revo filter engine

- ERP owns the picker UI and selected-value state.
- Revo Community `FilterPlugin` owns actual filtering.
- Filter Apply/Clear is view History, not Dirty/Save state.
- Date filter UX remains Year -> Month -> Day.

### 9. Header selection required the interceptable header event

- Root cause: the later `headerclick` event was not the correct ownership boundary for the original header interaction.
- Durable fix: use Revo `beforeheaderclick` and the clicked `detail.column` for header-body selection behavior.
- Filter and Sort controls remain separate and must not trigger whole-column selection.

### 10. Header Selection, Filter and Sort must keep separate owners

- Header body means Selection.
- Filter button means Filter only.
- Sort button means Sort only.
- Whole-column selection uses only currently visible `rgRow` rows; filtered-out rows are never silently included.
- Sort uses Revo public sorting APIs; ERP must not reorder source rows directly.

### 11. Filter popup keyboard input must remain inside the popup

- When keyboard input originates inside the ERP filter popup, Revo keyboard proxies are cancelled while the original browser keyboard event remains available to the popup input.
- Typing in Search must never navigate/edit the grid underneath the popup.

### 12. Sort must not chase an off-screen selected row

- Selection identity follows the same `ClientKey` only while the selected cell remains in the current viewport.
- If Sort moves that Work Order outside the viewport, focus is cleared instead of auto-scrolling after it.
- Filter has different semantics: if the selected Work Order remains in the filtered result it may remain selected; if it is filtered out, selection is cleared.

### 13. Selection lifecycle must respect Filter and dataset boundaries

- Whole-column selection does not require a synthetic active first cell.
- A selected cell remains attached to the same `ClientKey + column` through Filter/Sort only while it remains valid and visible.
- If Filter removes the selected Work Order, focus is cleared and no replacement row is auto-selected.
- Year/dataset switch clears selection before replacing the dataset.
- Interaction inside the custom filter popup must not be mistaken for an outside click that clears focus.

### 14. Re-applying unchanged Filter criteria was incorrectly treated as a no-op

- Symptom: after Edit/Paste/Insert changed row values, pressing Apply with the same criteria could close the popup without recalculating membership, leaving rows visible that no longer matched.
- Durable fix: unchanged criteria still re-run the native Revo filter when the working snapshot differs from the current criteria result.
- History stores only the `ClientKey` visibility delta required to restore the exact working snapshot.
- No History entry is created when re-Apply produces no visible change.

### 15. Filter Search is pending selection, not live filtering

- Typing a non-empty Search term updates the pending checkbox selection to matching options.
- The grid itself does not change until Apply is pressed.
- Select All while Search is active affects only searched/visible options.
- Clearing Search keeps the current pending checkbox selection.
- If Search finds no option, Apply is disabled so a no-match search cannot accidentally show the whole sheet.
- Date Search follows the same pending-selection rule.

### 16. Insert/Delete must preserve the employee's working snapshot

- Edit/Paste/Insert do not auto-reapply Filter or Sort underneath the employee.
- Insert Above/Below uses stable source identity and `DisplayOrder`, not visible row number as database identity.
- Delete acts only on selected visible `ClientKey` identities.
- `Insert Rows...` asks for an explicit count; selection size never determines insert count.
- Right-click inside an existing multi-row selection preserves the selected identities for Delete; right-click outside targets only the clicked row.
- One batch Insert/Delete is one History action.

### 17. Remaining Amount is a derived result, not a second edit

- `Remaining Amount = Work Order Value - Partial Amount`.
- Edit/Paste/Undo/Redo recalculate the affected row immediately.
- Remaining Amount stays readonly and does not create an independent Dirty cell, History action or Save field.

## Current Accepted Checkpoint

The official accepted product checkpoint is `bdc37fe` with documentation checkpoint `66a3f03`.

Accepted after the old Gate 5A-5B manifest era:

- Gate 5B-11 snapshot-safe Save handshake.
- Selection Core V4R3.
- Gate 5B-12 real database Save.
- RowVersion concurrency rejection and edit-while-Save handling.
- persisted Delete / in-flight Undo / fresh re-add identity behavior.
- cross-year Save confirmation and transactional move.
- Gate 5C-1 visible aggregates for core Money and Custom Money.
- Employee Real Workday Master scenarios 00-17 on the official branch.

## Future Work That Remains Current

The old manifest statements that said Save, validation, RowVersion or cross-year behavior were still pending are historical and must not be copied forward as future work.

The current remaining Revo/cutover work is:

1. database-connected Custom Column definition/layout persistence parity where still missing;
2. remaining high-value employee parity such as quick search, Basket/KPI/selection summary and production messaging where not already covered;
3. exact Revo assets pinned/self-hosted with license evidence;
4. reconnect, lost-response and recovery qualification beyond the already accepted Save/concurrency cases;
5. target Edge/Chrome qualification and office-class 10k acceptance;
6. side-by-side release candidate and controlled `/work-orders` cutover;
7. Tabulator retirement only after a separate accepted post-cutover checkpoint.

## Cleanup Rule

The 23 root Gate/Lab manifest and README files may be retired only after this durable history and the current roadmap/release overrides are committed. Git remains the exact archive for their original byte-for-byte historical contents.

## Grid Shootout Lessons Preserved Before Lab Cleanup

Historical isolated Grid Shootout labs were reviewed before retiring obsolete pages.

### Stable identity during Paste verification after Sort

- Visual/source row position is not a durable identity after Sort.
- Paste and end-of-sheet verification must follow stable row identity rather than assuming the edited row remains at the same index.
- Test payloads should avoid changing the active Sort key when the goal is to verify Paste correctness independently from reordering.

### External controls can steal grid focus before selection is observed

- An external Split/Full button can move browser focus before its click handler reads the Revo selected range.
- A null range observed after that focus transfer does not prove that resize or layout destroyed the selection.
- Durable selection state should be captured before the external control takes focus, such as from the verified logical selection or pointerdown boundary.

### Structural column changes are different from repaint

- Historical labs used the public grid.columns assignment when actually adding or removing columns.
- That does not justify replacing the full grid.columns collection merely to force a header repaint.
- Current accepted runtime uses the narrower public updateColumns(...) path for repaint-sensitive header changes.

### Community filter panel registration

- The isolated RevoGrid Community Gate 2.2 requires explicit registration of the standalone revogr-filter-panel custom element.
- Gate 2.2 remains retained while the current E2E Community qualification runner depends on it.

### Already preserved elsewhere

The accepted documentation already preserves the major Shootout decisions covering the Univer end-of-sheet failure, Revo 100k qualification, Arabic keyboard shortcuts, Header Selection ownership, Split behavior and browser Zoom selection preservation.
