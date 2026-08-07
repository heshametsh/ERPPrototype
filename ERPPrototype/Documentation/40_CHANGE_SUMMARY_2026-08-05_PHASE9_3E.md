# Phase 9.3E — Lightweight Custom Filters, Money Sort, and Column Visibility

**Date:** 2026-08-05  
**Status:** Candidate — requires local Release Build, migration, SQL Server Integration suite, and focused browser verification.

## Final business rules

- A custom-column type is chosen once during creation and is immutable afterward.
- `Rename Custom Column` supports rename only.
- Custom `Text`, `Date`, and whole `Number` columns receive a value filter automatically.
- Custom `Money` columns receive numeric Header sorting only; the first direction is largest-to-smallest.
- Any data column can be hidden from its Header context menu.
- `Unhide Column` appears in the same context menu only when one or more columns are hidden and lists those columns on demand.
- There is no fixed Columns toolbar button.

## Resource-cost design

All routine interactions remain in the browser:

- Filter option values are scanned only when the filter popup opens.
- Filter Apply/Clear uses the rows already loaded in Tabulator.
- Sort uses the existing Tabulator numeric sorter.
- Hide/Unhide calls Tabulator `hide()` / `show()` directly and does not reload rows.
- The hidden-column list is created only when the Header context menu opens.
- No HTTP/SignalR request is made for filter, sort, hide, or unhide.
- Width and visibility are sent together only when the employee presses the existing Save button.

Removing type conversion also removes the `OPENJSON` scan that previously checked whether every custom column had stored values. The sheet no longer runs that scan at load or after Save.

## Persistence and Undo/Redo

Migration `20260805183000_AddDepartmentColumnVisibility` adds `IsHidden` to `DepartmentColumnLayouts` with a default of `false`.

The existing department layout now stores:

- `Width`
- `IsHidden`
- `RowVersion`

The key remains `DepartmentId + FieldKey`, so one layout applies to every year of the same department and never leaks into another department.

Hide/Unhide creates the existing `column-layout` Undo/Redo transaction and remains unsaved until Save.

## Safety and user experience

- The row-number column cannot be hidden.
- At least one data column must remain visible because Unhide is intentionally reachable through a visible Header.
- Active filters are preserved if a custom column is renamed or after a successful Save.
- Deleting a filtered custom column clears that filter; Undo restores both the column and its filter.
- Selection totals display only currently visible amount columns. Fixed yearly totals remain unchanged.
- Header title and its filter/sort control remain adjacent at every width.

## Verification gate

1. Release Build passes.
2. Apply the visibility migration to the development database.
3. Core Integration reports `25/25 passed`.
4. Add all four custom types and verify their automatic Header behavior.
5. Hide, Undo, Redo, Save, Refresh, switch year, Unhide, Save, and Refresh.
6. Confirm another department does not receive the saved hidden state.
