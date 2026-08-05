# Phase 9.3C — Custom Column Lifecycle

**Date:** 2026-08-05  
**Status:** Accepted — Release Build PASS and SQL Server Integration 25/25 PASS.

## User-visible result

- A Department Employee can rename a custom column from its Header context menu.
- Type can change only while the column has no saved value in any year of the department.
- A custom column can be deleted after confirmation; the definition, its saved width, and its values across all department years are removed in one Save transaction.
- Rename, empty-only type conversion, and delete participate in Undo/Redo before Save.
- Core Work Orders columns remain protected.

## Integrity rules

- The custom-column name remains unique within a department.
- RowVersion prevents stale sessions from overwriting a newer definition.
- Deletion updates affected Work Orders atomically with the column definition and layout.
- Number remains whole-number only; Text, Money, and Date keep their existing validation.

## Verification

The local gate passed after correcting one test identity collision:

- Release Build: PASS
- SQL Server Integration: `25/25 passed`

No migration was required for Phase 9.3C.
