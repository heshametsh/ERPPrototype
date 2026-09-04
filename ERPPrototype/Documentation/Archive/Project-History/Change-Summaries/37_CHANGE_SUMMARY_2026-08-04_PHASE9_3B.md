# Phase 9.3B — Department Column Widths and Compact Header Controls

**Date:** 2026-08-04  
**Status:** Candidate — requires local Build, migration, Integration tests, and one manual UI pass.

## User-visible result

- Every Work Orders data column can be resized by dragging its header edge.
- Width is changed by mouse drag only; the Header context menu does not include `Change Width`.
- The accepted range is 45–1000 px.
- Width changes stay pending until the normal `Save` button is pressed.
- Undo and Redo restore the previous or next width before Save.
- After Save, the width remains after Refresh and appears in every year of the same department.
- Another department keeps its own independent widths.

## Header layout correction

The title, filter icon, and sort icon are now one compact left-to-right group instead of placing the filter at the far edge of a wide column. The unused width remains after the controls. When a column becomes narrow, the title is shortened with an ellipsis while the filter/sort controls remain visible.

Practical example: `Basket` is rendered as `Basket  [filter]` rather than leaving a large empty gap before the filter icon.

## Data design

- `DepartmentColumnLayouts` stores one row per `DepartmentId + FieldKey`.
- Widths are not tied to a year or an individual account.
- A unique index prevents two stored widths for the same department field.
- A SQL check constraint enforces the 45–1000 px range.
- `rowversion` prevents a stale browser session from overwriting a width saved by another session.
- Work-order changes, custom-column changes, and width changes still use the same existing Save transaction.

## Scope boundaries

This phase changes width by mouse drag only; there is no `Change Width` menu or numeric-width dialog. It does not add rename, delete, custom-column type conversion, or migrate `Status`/`Notes`. Custom-column creation still asks only for name and type and continues to use its standard initial width.

## Verification gate

1. Apply migration `20260804222000_AddDepartmentColumnLayouts`.
2. Release Build must pass.
3. Core integration suite should report `22/22 passed`.
4. Manual UI check:
   - resize `Basket` by dragging and Save;
   - Refresh and switch year, confirming the width remains;
   - resize another column by dragging its Header edge;
   - verify Undo/Redo before Save;
   - make a long title narrow and confirm the title uses `...` while icons stay visible.
