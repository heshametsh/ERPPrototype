ERP Prototype Recovery — Step 10A
================================

This recovery was built from ERPPrototype(4).zip.

Restored code changes:
1. Removed WorkOrder soft-delete fields and query filter from application code.
2. Restored hard delete for unlinked work orders.
3. Restored company-wide uniqueness for WorkOrderNumber + WorkTypeCode.
4. Restored exact identity rules:
   - WorkOrderNumber: exactly 9 ASCII digits.
   - WorkTypeCode: exactly 3 ASCII digits.
5. Restored Arabic/Persian digit normalization to English digits.
6. Restored immediate grid validation:
   - letters/symbols are rejected while typing;
   - extra digits are rejected immediately;
   - incomplete values are highlighted before Save;
   - direct typing works without requiring double-click.
7. Preserved TabulatorTest.razor together with TabulatorTest.razor.css to avoid the scoped-CSS orphan warning.

Important:
- This recovery intentionally does not add or modify EF migration files.
- Build and run the recovered code first.
- Do not run Add-Migration or Update-Database until the current database migration history is checked.
