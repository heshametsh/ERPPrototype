# Phase 8.7-R1 — Blazor Save Workflow Extraction

## Goal

Give the complete Blazor save journey one clear owner without changing any user-facing or persistence behaviour.

## Before

`WorkOrders.razor.cs` contained page loading, grid initialization, year switching, disposal, and roughly 700 lines of save orchestration. A future change to a save message or duplicate mapping required reviewing unrelated page lifecycle code.

## After

`WorkOrders.Save.cs` owns:

- browser pre-save validation;
- streamed dirty/deleted delta retrieval;
- new/change/delete request preparation;
- Assignment Date year movement;
- service execution and server timing stages;
- duplicate/concurrency mapping;
- temporary Id rekey and saved-row reconciliation;
- browser result application;
- Arabic save status and diagnostics.

`WorkOrders.razor.cs` keeps page lifecycle, loading, year selection, grid initialization, shared sheet mapping, and disposal.

## Practical Work-Order Examples

### Notes edit

The employee edits Notes in one row. Save still reads that dirty row, sends only Notes through the existing field-level contract, stores it, updates the internal RowVersion, and reports success.

### Duplicate identity

The employee enters a global duplicate pair of Work Order Number and Work Type. The same service rejection is still converted into cell errors and the same Arabic failure message.

### Move to another year

The employee changes Assignment Date from 2026 to 2027. The same Save path persists the new year, removes the row from the 2026 sheet, adds 2027 to the year list, and reports the destination year.

### New temporary row

The employee inserts a new row with a negative temporary Id. After Save, the same mapping replaces it with the database Id while preserving the browser client key and Undo/Redo history references.

## Explicit Non-Changes

- No JavaScript file or public browser function changed.
- No DTO contract changed.
- No database query, transaction, or index changed.
- No permission or role rule changed.
- No validation, duplicate, concurrency, or year rule changed.
- No Arabic message or performance stage name changed.

## Static Verification

- The extracted `SaveChangesAsync` method matches the prior method exactly.
- All extracted save-only helpers and DTOs match exactly.
- Only one definition remains for each extracted member.
- `WorkOrders.razor` still resolves `SaveChangesAsync` through the partial class.
- No `*.user` file is included in the patch.

## Runtime Acceptance

Run section S in `06_REGRESSION_TEST_CHECKLIST.md`. R1 is not stable until the user verifies no-change Save, one-row Save, duplicate rejection, year movement, new-row rekey, deletion, large non-identity Save, refresh persistence, and unchanged performance stage names.
