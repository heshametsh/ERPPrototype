# Phase 9.3A — Custom Columns Foundation

**Date:** 2026-08-04  
**Status:** Candidate — requires local Build, SQL Server Integration tests, and one manual UI pass.

## User-visible result

The Department Employee can right-click any Work Orders column header and choose:

- `Insert Column Before`
- `Insert Column After`

The add dialog asks for only:

- `Column Name`
- `Column Type`

Supported types are exactly:

- `Text` — up to 250 characters.
- `Money` — normalized and rounded to two decimal places.
- `Date` — stored as `dd/MM/yyyy` without time.
- `Number` — signed 32-bit whole number; decimals are rejected.

A new custom column starts at a fixed 180 px width. Width changes are deliberately deferred to the next phase.

## Scope and persistence

- The definition belongs to one `DepartmentId`, not to one year or one user.
- The same definition and position appear in every year of that department.
- Other departments do not receive it.
- Its position is saved relative to the header used for insertion.
- Creating the column and editing its cells remain pending until the normal `Save` button is pressed.
- Adding the column participates in the existing Undo/Redo transaction history before Save.
- Custom `Money` columns join the selection amount summary automatically.

## Protected columns

The following product columns remain protected and are not custom definitions:

- Work Order Number
- Work Type
- Assignment Date
- Work Order Value
- Partial Amount
- Remaining Amount
- Basket

`Status` and `Notes` are still rendered by the legacy schema in this phase. Their migration to removable custom columns is a later operation and is not performed silently by this patch.

## Data design

- `CustomColumnDefinitions` stores department ownership, stable field key, type, layout order, audit data, and `rowversion`.
- `WorkOrders.CustomValuesJson` stores sparse custom values per order.
- Column definition creation and row-value persistence use the same existing SQL transaction.
- Server validation rejects unknown fields, duplicate names/positions, invalid dates, invalid money, text over 250 characters, and decimal or out-of-range Number values.

## Deliberately deferred

- Rename custom column.
- Delete custom column.
- Change type while empty.
- User-controlled width and persisted width.
- Dedicated custom-column header filters.
- Migration of current `Status` and `Notes` data.

## Verification gate

1. Apply migration `20260804210000_AddCustomColumns`.
2. Release Build must pass.
3. Core integration suite should report `20/20 passed`.
4. Manual UI check:
   - insert one column before and one after different headers;
   - enter Text, Money, Date, and whole Number values;
   - Save, refresh, and switch year;
   - verify the same columns and values remain;
   - verify another department does not receive them;
   - verify `12.5` is rejected in a Number column.
