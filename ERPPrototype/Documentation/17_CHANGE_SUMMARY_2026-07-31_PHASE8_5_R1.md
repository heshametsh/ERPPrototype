# 17 — Phase 8.5-R1 Large Field Batch Replacement

**Status:** Pending user build and runtime regression
**Apply over:** Phase 8.5

## What the user experienced

The first Phase 8.5 version understood that only one column changed, but it still told the grid to update thousands of rows through the slower `updateData` path. The result was logically correct but slower for full-column Paste and Undo.

## What changes now

For a small edit, the grid updates only the affected row as before.

For a large edit of 500 cells or more, the application now:

1. Builds the final sheet values in memory.
2. Changes only the requested field values in that prepared copy.
3. Gives the prepared data back to Tabulator once through `replaceData`.
4. Restores the selected range and viewport.
5. Runs dirty tracking, affected validation rules and filter refresh once.

Tabulator documents `replaceData` as the silent full-data replacement path that preserves scroll position, sort and filtering when Virtual DOM is active.

## Practical Work Orders example

An employee pastes a Notes column into 4,952 work orders.

Before this correction:

- The application understood that Notes alone changed.
- But the grid processed 4,952 row-update requests internally.

After this correction:

- The application prepares the final Notes values once.
- The grid receives one replacement operation.
- Work Order Number, Work Type, Assignment Date, Basket and Status remain unchanged.
- The global duplicate rule does not run.

## Future custom-column example

A user later adds an Estimated Value column. The shared row-cloning path now preserves unknown fields automatically. Adding that column must not require adding its name to `cloneRowData`.

## Required test

Repeat the exact 4,952-cell scenario:

1. Full-column Copy.
2. Full-column Paste.
3. Test ArrowDown after Paste.
4. Save.
5. Undo.
6. Save again.
7. Download the performance report.

Acceptance requires:

- No functional error or data loss.
- No `cell-edited` storm.
- Paste and Undo improve materially compared with the first Phase 8.5 result.
- Identity check rows remain zero when the identity fields were not edited.

Do not Commit or Tag before this test passes.
