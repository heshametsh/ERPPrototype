# 03 — Current Implementation

**Status:** Phase 8.6-R1 user-tested stable behavior with Phase 8.6-R2 interaction extraction pending focused regression  
**Review date:** 2026-07-31  
**Important:** Runtime behavior is based on the current code plus user-generated browser performance reports. This review environment still does not contain .NET SDK, so a local Clean/Rebuild remains required after applying the patch.

## 1. Snapshot

| Item | Current value |
|---|---|
| Project type | One ASP.NET Core Web project |
| Target framework | `net10.0` |
| Render mode | Blazor Interactive Server |
| Authentication | ASP.NET Core Identity |
| Database | SQL Server / LocalDB in Development |
| ORM | EF Core 10.0.9 |
| Grid | Tabulator 6.5.0 |
| Grid stable checkpoint | `Phase8.6-R1-Stable` after repeated year-switch, navigation, wheel, clipboard, structure, and save regression |
| Main grid coordinator | `wwwroot/js/tabulatorTest.js` — 2,627 lines after Phase 8.6-R2 extraction |
| Work-order page | `Components/Pages/WorkOrders.razor` — 1,071 lines |
| Work-order service | `Data/WorkOrderService.cs` — 953 lines |
| Migrations | 29 files |
| Runtime code changed in Phase 6.1 | Diagnostics only: `tabulatorPerformance.js` and read-only `tabulatorRangeAutoScroll.snapshot()` |

## 2. Runtime Flow

```text
Browser / Tabulator
        |
        | JavaScript Interop
        v
WorkOrders.razor
        |
        v
WorkOrderService
        |
        v
ApplicationDbContext / EF Core
        |
        v
SQL Server
```

Admin management currently has an exception: `AdminPanel.razor` accesses `ApplicationDbContext` directly for branch operations instead of using an application service.

## 3. Authentication and Accounts

Implemented:

- No public registration page.
- Login by username and password.
- Inactive users are rejected.
- Five failed attempts cause a 15-minute lockout.
- New users must change the temporary password.
- Authentication state is revalidated every 30 minutes.
- One Admin account is enforced by the startup Seeder.
- Initial Admin credentials come from configuration/User Secrets.
- Roles are created during startup.
- Standard department types are created during startup.
- Every existing branch is given the four standard departments.

Operational risk:

- Database initialization/Seeder runs during application startup.
- The app retries SQL startup three times, then fails startup.
- This may contribute to Azure `500.30` when SQL is unavailable, but this has not been proven from logs.

## 4. Current Roles

| Code role | Current capability |
|---|---|
| `Admin` | Admin page, add/rename branch, create/list fixed BranchManager/Employee accounts |
| `ProjectManager` | Role exists; no completed operating screen/workflow |
| `BranchManager` | Account can be created; no completed read-only work-order screen or branch account management |
| `Employee` | Loads and modifies work orders for the assigned department only |

`ProjectManager` is the final product and code name. `Employee` is the current technical Identity role; the product-facing label is Department Employee / موظف القسم. No Identity-role rename is planned inside Phase 6.

## 5. Work-Order Data Model

Visible operational fields:

- Work Order Number
- Work Type
- Assignment Date
- Basket
- Status
- Notes

Hidden/system fields:

- Id
- Client Key in the browser
- Work Year
- Display Order
- Department Id
- RowVersion
- Created/Updated audit fields

Database rules:

- Work Order Number is exactly 9 ASCII digits.
- Work Type is exactly 3 ASCII digits.
- The database Unique Index is currently company-wide on Work Order Number + Work Type.
- Department deletion is restricted.
- RowVersion is used for optimistic concurrency.
- Notes max 1,000 characters.
- Status max 150 characters.
- Basket is required and must be one of the configured values.

## 6. Work-Order Loading

`WorkOrderService.LoadSheetAsync`:

- Validates the year range 2000–2100.
- Confirms that the user is active, has changed the temporary password, has role Employee, and has a department.
- Filters SQL by the employee's Department Id and selected Work Year.
- Selects a lightweight DTO rather than the full entity.
- Orders by Display Order then Id.
- Returns all rows for that department/year to the browser.
- Logs query timing for user scope, years, rows, and total.

Current scaling limit:

All rows of the selected year are still transferred to Blazor and JavaScript. This is acceptable for the current 3,000-row prototype only after testing; 10,000 rows remain unverified.

## 7. Work-Order Saving

Implemented:

- The browser sends dirty rows and deleted rows only.
- Server validation is repeated.
- Scope is repeated on the server.
- Duplicate checks occur in current changes, SQL query, and Unique Index.
- Updates and deletes require a valid RowVersion.
- One transaction covers added, updated, and deleted rows.
- Assignment Date determines the destination year in the current implementation.
- The result returns saved rows, new database Ids, RowVersions, moved rows, and deleted Ids.
- The browser applies the saved delta without reloading the full sheet.

## 8. Grid Features in M5D4R3

- Virtual DOM with central buffer 260px.
- Direct cell editing.
- Quick typing mode and text editing mode.
- Four-arrow navigation.
- Frame gate shared by ArrowUp, ArrowDown, and plain Enter navigation.
- ArrowUp-only viewport correction for a proven direction-specific issue.
- Range selection.
- Copy/paste matrix.
- Insert above/below and multiple rows.
- Delete selected rows.
- Custom session Undo/Redo.
- Validation navigation.
- Work-order-number search.
- Column filter popups.
- Dirty row tracking.
- Year switching only after unsaved changes are cleared.
- Resize keeps the logical first visible row using the E6C anchor restore.
- First right-click on an unselected sheet initializes a real range before Tabulator handles the event, preventing `activeRange.occupies` errors.
- Structural focus restoration after Insert/Delete and Undo/Redo uses a bounded retry guard and no longer throws `element?.focus is not a function`.
- Copy/Paste has one owner path; Tabulator's parallel clipboard path is disabled.
- New-row database identity is reconciled inside the existing row using `clientKey` instead of delete/reinsert.
- Duplicate save validation returns all global conflicts for `WorkOrderNumber + WorkTypeCode` across years and departments.
- Delete/Backspace clears the full logical selected range, including rows outside the visible Virtual DOM window, without deleting rows.
- Validation messages start from the first affected row.
- Drag selection auto-scroll is isolated in `tabulatorRangeAutoScroll.js`; Tabulator remains the sole range owner.

## 9. Not Implemented

- Excel import.
- Excel export.
- Dashboard/KPIs.
- Warehouse.
- Invoice module.
- BranchManager operating page.
- ProjectManager operating page.
- User rename/reset password/activate/deactivate workflows.
- Admin audit trail.
- Automated unit, integration, or browser tests.
- Production monitoring and client-side error reporting.
- Proven 10,000-row strategy.
- لا يوجد Performance Patch للجلسة الطويلة حاليًا؛ التدهور المقاس مسجل كقيد مراقبة، لكن المستخدم أكد أن سرعة الأسهم وEnter والـWheel مقبولة في الاستخدام الحالي.

## 10. Static Review Performed

Passed in this review:

- JavaScript syntax for project-owned JS files using Node.
- JSON parsing.
- Project XML parsing.
- Required routes present.
- No Syncfusion runtime/package references.
- No recovery-test flags from failed R2/R3 experiments in E6C.
- E6C markers present: 260px buffer and resize viewport restoration.
- No obvious hard-coded production password or connection string in source.
- Runtime source manifest generated.

Not performed here:

- `dotnet restore`
- `dotnet build`
- EF migration execution
- SQL integration
- Browser regression tests
- Azure/network tests
- NuGet vulnerability scan after restore

## 11. Important Current Gaps

1. BranchManager operating workflow is not implemented.
2. ProjectManager operating workflow is not implemented fully.
3. Current year movement is automatic; product preference may require confirmation.
4. Admin branch logic bypasses a service layer.
5. `Employee` remains the technical Identity role while Department Employee / موظف القسم is the product-facing label.
6. `ERPPrototype.csproj.user` appeared in the full uploaded ZIP despite `*.user` being ignored by Git; future delivery ZIPs must exclude it explicitly.

## 12. Simple Example

**Why is server validation repeated when JavaScript already validates?**  
JavaScript is like the receptionist checking a form quickly. The server is the locked records room. Even if someone bypasses the receptionist, the records room must still reject an invalid or unauthorized form.


## 13. Historical E6D/E6E/E6F Verification Record

User-tested on 2026-07-27 after Clean/Rebuild and local browser execution:

- Sustained Enter navigation remained responsive beyond the previously slow point near row 1,040.
- Arrow navigation remained functional after Enter navigation.
- First right-click on a one-row year and on a large year opened without the previous `activeRange.occupies` exception.
- Insert/right-click flow and the connected smoke tests were reported as working.

- Insert/Delete/Undo/Redo/Copy-Paste/Save were tested after E6F with no Console errors.
- `element?.focus is not a function` did not reappear.
- Two clean long-navigation baseline runs were accepted as a provisional comparison baseline.

This is user-environment evidence, not an automated browser-test suite.


## 14. Historical Provisional E6F Performance Baseline

Accepted by the user on 2026-07-27 from two clean runs. This is not a strict three-run median because the viewport widths differed; it is a pragmatic temporary baseline for detecting obvious refactor regressions.

| Movement | Provisional average | Provisional p95 | Temporary refactor ceiling |
|---|---:|---:|---:|
| ArrowDown | 59.71 ms | 107.3 ms | 118 ms |
| ArrowUp | 75.65 ms | 108.3 ms | 119 ms |
| Enter | 92.77 ms | 125.2 ms | 138 ms |

Both clean reports contained zero JavaScript errors and no layout shifts. The historical fatigue evidence remains useful for future scale testing, but it is not a blocker for the current prototype after the Phase 6 product decision. Raw reports are stored in `Documentation/Review/Performance/E6F/`.


## 15. Phase 6.0 Current Long-session Evidence

User-generated reports on 2026-07-29 confirmed that arrows alone reproduce gradual fatigue:

| State | ArrowDown average / p95 | ArrowUp average / p95 |
|---|---:|---:|
| COLD | 33.7ms / 53.3ms | 34.8ms / 56.7ms |
| FATIGUED | 60.4ms / 101.4ms | 57.4ms / 101.7ms |

The JavaScript heap rose and fell with garbage collection rather than growing continuously. Phase 6.1 added a dedicated `perf=lifecycle` mode to correlate 30-second performance windows with active listeners, timers, animation frames, observers, and known grid lifecycle owners.

## 16. Phase 6.1 Audit Result and Product Decision

The 2026-07-29 lifecycle report ran for about 19 minutes. Known owners remained stable: one grid instance, one performance attachment, one range auto-scroll instance, four observers, and roughly five to seven active timers. The large listener-registration count rose while new Tabulator cells were created, then plateaued; the counter is an upper-bound registration balance and does not prove that all registrations remained live. No continuous timer, observer, or known-owner accumulation was demonstrated.

The user confirmed that practical navigation speed is currently acceptable for Arrow keys, Enter, and mouse wheel. Therefore:

- No navigation recovery, rewrite, or performance fix is added now.
- Phase 6.2 isolation and Phase 6.3 targeted fix are deferred until a real usage problem, 10,000-row test, or regression reopens them.
- Search debounce is deferred because current search is fast and no measured problem justifies adding delayed behavior and timer logic.
- Phase 6 closes after the final regression checklist and a new Git tag.


## 17. Phase 8.5 — Field-Level Changes and Generic Batch Editing

Implemented in the current patch:

- Dirty state records the changed field keys per row.
- Paste, range clear, Undo, and Redo apply large cell changes as one blocked-redraw batch.
- After the batch, dirty tracking, validation dependencies, and filter refresh run once for the affected rows/fields.
- The browser save delta includes `changedFields` for every modified existing row.
- `WorkOrderService` normalizes, validates, and updates only the declared changed core fields.
- Global identity validation runs only for new rows or rows whose identity fields changed.
- Core field keys and server dependency sets are centralized in `WorkOrderFieldRegistry`.

Practical example: changing Notes in 4,952 rows still saves 4,952 values, but it does not rewrite the other columns or execute the global Work Order Number + Work Type duplicate query.

Not implemented yet: user-created custom columns, their database storage, layout ownership, permissions, and filter-definition UI. Phase 8.5 is the foundation that allows those fields to register by stable key later.


## 18. Phase 8.6-R1 — Lifecycle Ownership Extraction

A new `wwwroot/js/tabulatorLifecycle.js` module owns nine lifecycle members that previously lived at the top and bottom of `tabulatorTest.js`:

- pointer/device detection;
- table-height calculation and page-scroll lock;
- grid-state creation;
- listener cleanup;
- timer/animation cancellation;
- old table disposal and final destroy.

No business rule, column behavior, navigation algorithm, save path, filter behavior, or Tabulator configuration was intentionally changed.

Practical result: when the employee changes year or leaves the Work Orders page, the same cleanup route disconnects the old sheet before another instance is created.

## 19. Phase 8.6-R2 — Interaction Ownership Extraction

A new `wwwroot/js/tabulatorInteractions.js` module owns the binding of one live sheet's user interactions:

- Resize and right-click range guard.
- Cell editing start/cancel/commit.
- Active-cell and active-range ownership.
- Context menu open/close activation.
- Keyboard navigation, direct typing, Delete/Backspace, Undo, and Redo.
- Document Copy/Paste ownership.

The existing interaction algorithms were moved without intentional logic changes. `tabulatorLifecycle.js` still owns cleanup and removes the exact handlers stored by the interaction module.

Practical example: after changing from year 2026 to 2025, the new sheet binds one interaction set. One Arrow press moves one cell, one Paste runs once, and one resize restores one viewport anchor. Future user-created input columns can enter the same generic printable-key path instead of adding another document listener.

