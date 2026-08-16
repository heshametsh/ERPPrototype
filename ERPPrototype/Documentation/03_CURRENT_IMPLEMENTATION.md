# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-16

> هذا القسم يحدد الفرق بين **الموجود فعليًا** و**المخطط بعد الـAudits**. بقية الملف تحتفظ بالتاريخ والتفاصيل السابقة.

**Baseline:** `00503ab` (`Remove unused Work Orders JavaScript APIs`)  
**Branch:** `codespaces-sync-2026-08-08`  
**Latest SEC Codespaces Release Build:** PASS  
**Runtime changes after audit decision session:** None.

## منفذ فعليًا الآن

- ASP.NET Core / Blazor Interactive Server + EF Core + SQL Server + Identity + Tabulator.
- Work Orders Online الحالية وما فيها من editing/search/filter/sort/clipboard/history/custom columns حسب الكود الحالي.
- server-side Work Orders authority, RowVersion, SQL uniqueness/transactions.
- route-based Work Orders JS loader موجود، لكن Finding `LDR-002` ما زال مفتوحًا.

## غير منفذ بعد — لا يُعامل كأنه موجود في الكود

- IndexedDB Draft/Outbox production implementation.
- Service Worker production Offline Work Orders.
- OperationId/receipt Sync engine.
- 5-hour Offline lease / 7-day trusted Login implementation.
- Email OTP final flow.
- flexible manager capability delegation.
- Municipality/GIS/Execution/Extracts specialist sub-workflows.
- bilingual stable-code migration.

المرجع لهذه القرارات المستقبلية هو `12_ENGINEERING_AUDIT_REPORT.md`.

# 03 — Current Implementation

> تحديث 2026-08-12: التحقق الحالي المقبول هو Build PASS، Integration `25/25` وSmoke Browser `11/11`. أمر الاختبار المعتمد الوحيد هو `Tools/Invoke-ERPTests.ps1`; مراجع أدوات Phase 8/Phase 9 القديمة في الأقسام التاريخية لا تعني أن تلك الأدوات ما زالت موجودة.

> تحديث 2026-08-13 — Phase 2B: `App.razor` no longer preloads the heavy Work Orders Tabulator runtime on Login/Home/Admin. `workOrdersLoader.js` loads it only for `/work-orders`; `tabulatorPerformance.js` remains opt-in through supported `perf` query modes. The loader has no User/Branch/Department conditions.

**Status:** Phase 9.0B accepted after SQL 10/10 and browser Full 9/9; Phase 9.0C 1,000-row stress coverage implemented as an acceptance candidate
**Review date:** 2026-07-31
**Acceptance evidence:** Developer-machine Release Build PASS, 10/10 isolated SQL Server save tests, Git source hygiene PASS, and a 169-file clean source archive of 3.06 MB. The optional local Node.js check was skipped because Node.js was unavailable; project-owned JavaScript files separately passed syntax checks, and Phase 8.9 changed no production JavaScript.

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
| Current accepted runtime checkpoint | Phase 9.0B accepted: integration 10/10 and browser Full 9/9 on isolated temporary infrastructure |
| Main grid coordinator | `wwwroot/js/tabulatorTest.js` — 2,331 lines after Dirty-State extraction |
| Work-order markup | `Components/Pages/WorkOrders.razor` — 208 lines |
| Work-order save service/facade | `Data/WorkOrderService.cs` — about 955 lines after pure save-plan extraction |
| Work-order save-plan builder | `Data/WorkOrderSavePlanBuilder.cs` — normalization and validation only; no database access |
| Work-order read service | `Data/WorkOrderQueryService.cs` — 223 lines |
| Browser automation project | `ERPPrototype.E2ETests` using Microsoft Playwright 1.61.0; isolated LocalDB and local app process |
| Migrations | 29 files |
| Runtime code changed in Phase 6.1 | Diagnostics only: `tabulatorPerformance.js` and read-only `tabulatorRangeAutoScroll.snapshot()` |

## 2. Runtime Flow

```text
Browser / Tabulator
        |
        | JavaScript Interop
        v
WorkOrders component
        |
        v
WorkOrderService compatibility facade
        |                         |
        | LoadSheetAsync          | SaveChangesAsync
        v                         v
WorkOrderQueryService       WorkOrderSavePlanBuilder
        |                         | normalized/validated plan
        |                         v
        |                  WorkOrderService save logic
        |                         |
        +------------+------------+
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
- Work Order Value
- Partial Amount
- Remaining Amount (calculated)
- Basket
- Department custom columns (`Text`, `Money`, `Date`, whole `Number`)

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
- Basket is required and must be one of the configured values.

## 6. Work-Order Loading

`WorkOrderQueryService.LoadSheetAsync` (reached through the unchanged `WorkOrderService.LoadSheetAsync` facade):

- Validates the year range 2000–2100.
- Confirms that the user is active, has changed the temporary password, has role Employee, and has a department.
- Filters SQL by the employee's Department Id and selected Work Year.
- Selects a lightweight DTO rather than the full entity.
- Orders by Display Order then Id.
- Returns all rows for that department/year to the browser.
- Logs query timing for user scope, years, rows, and total.

Current scaling limit:

All rows of the selected year are still transferred to Blazor and JavaScript. This is accepted for the current tested 4,949-row sheet; 10,000 rows remain unverified.

## 7. Work-Order Saving

Implemented:

- The browser sends dirty rows and deleted rows only.
- `WorkOrderSavePlanBuilder` normalizes and validates the request before database work.
- Scope is repeated on the server after the plan succeeds.
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
- Broad automated browser coverage beyond the Phase 9.0 login/sheet/year foundation.
- A conventional unit-test framework; current pure-plan and SQL integration checks run through the standalone automated runner.
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
- Current R2 SQL integration execution (R2A previously passed 6/6 on the user machine)
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

Practical example: changing a custom Text column in 4,952 rows still saves 4,952 values, but it does not rewrite the other columns or execute the global Work Order Number + Work Type duplicate query.

Phase 9.3A–9.3E now implement department-owned custom columns with stable field keys, immutable Text/Money/Date/whole-Number types, rename/delete, persisted width and visibility, automatic non-Money value filters, and descending-first Money sorting.


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



## 20. Phase 8.7-R1 — Blazor Save Workflow Ownership

A new partial component file, `Components/Pages/WorkOrders.Save.cs`, owns the complete save workflow that previously occupied most of `WorkOrders.razor.cs`:

- pre-save browser validation;
- streamed dirty/deleted-row delta reading;
- new, changed, deleted, and moved-year request preparation;
- `WorkOrderService.SaveChangesAsync` orchestration;
- duplicate and concurrency error mapping;
- temporary-row to database-row mapping;
- current-year row merge and browser delta application;
- Arabic success/failure status;
- save performance stages and exception diagnostics.

No business or runtime change is intended. The method and its private save-only helpers are byte-for-byte equivalent after extraction.

Practical example: editing Basket in one order, pasting a custom column, moving an order to another year, or adding a temporary row all still follow the same verified workflow. The difference is that developers now find that workflow in one file instead of mixing it with year loading and grid disposal.

## 21. Phase 8.7-R2 — Save Request and Result Boundaries

The verified save journey remains coordinated by `Components/Pages/WorkOrders.Save.cs`, but its business-sensitive preparation and interpretation steps now have separate partial-class owners:

- `WorkOrders.SaveRequest.cs`: converts the dirty/deleted browser delta into added, changed, deleted, and moved-year service inputs. It also owns blank-new-row and assignment-date preparation failures.
- `WorkOrders.SaveResult.cs`: interprets duplicate/concurrency/service failures, prepares the current-year browser delta, maps temporary rows to database rows, reconciles moved/deleted rows, and creates the final Arabic status text.
- `WorkOrders.Save.cs`: owns the sequence only—validate, read stream, prepare request, call service, apply interpreted result, record diagnostics.

No service contract, JavaScript API, field-level rule, year-routing rule, message, or performance-stage name is intentionally changed.

Practical example: when the employee pastes a custom Text value into 4,950 orders, request preparation says “4,950 existing rows changed in the custom field.” After the service returns, result preparation says “no visible values need rewriting; refresh only the internal row versions and show the success message.” The button workflow coordinates those two facts without rebuilding either one itself.



## 22. Phase 8.7-R3 — Browser Dirty-State Ownership

A new module, `wwwroot/js/tabulatorDirtyState.js`, owns the browser-side answer to four questions:

- Which saved rows differ from the last accepted server baseline?
- Which exact field keys differ in each row?
- Which previously saved rows were removed and must be deleted?
- After a successful Save, what rows and row versions become the new baseline?

The module now owns original snapshots, `dirtyRowIds`, `changedFieldsByRow`, `deletedOriginalRowIds`, dirty/deleted row collection, structural dirty reconciliation, and clearing/accepting state after Save. The public `tabulatorTest` method names remain available, so Blazor, Clipboard/History, Field Changes, Structure, Validation, and performance instrumentation keep the same calls.

`tabulatorLifecycle.js` still owns when a grid instance is created or destroyed, but asks Dirty State to construct the change-tracking portion of that instance. `tabulatorTest.js` still coordinates streamed Save and applies server row mutations, but asks Dirty State to replace the comparison baseline and clear unsaved sets.

Practical example: changing Basket marks one row with `changedFields = ["basket"]`. Undoing back to the stored text removes that row from Dirty State. Saving successfully replaces the old row version with the server row version and clears the unsaved count.


## 23. Phase 8.8-R1 — Read Query Service

Implemented in the current patch:

- `Data/WorkOrderQueryService.cs` owns the read-only employee scope query, available-year query, and selected-year row projection.
- `Program.cs` registers the new scoped query service.
- The existing `WorkOrderService.LoadSheetAsync` overloads remain available and delegate to the query service, so `WorkOrders.razor` and its code-behind do not change in R1.
- Existing performance stage names remain `open.server.create-db-context`, `open.server.scope-query`, `open.server.available-years-query`, `open.server.rows-query`, and `open.server.total`.
- `WorkOrderService.SaveChangesAsync`, global uniqueness checks, authorization for mutation, transactions, RowVersion concurrency, field-level validation, and result mapping remain unchanged.

Practical example: when an employee opens 2026, the query service verifies the employee scope and returns only that department/year ordered by DisplayOrder then Id. Pressing Save still enters the original save implementation and transaction.


## 24. Phase 8.8-R2A — Save Integration Safety Net

Implemented in the current patch:

- `ERPPrototype.IntegrationTests` is a standalone executable project that references the real application project.
- Every run creates a random temporary SQL Server/LocalDB database, applies the real migrations, seeds isolated branch/department/Employee data, calls the real `WorkOrderService`, and deletes the database afterward.
- Six scenarios cover cross-department mutation rejection, global duplicate identity, stale RowVersion, Assignment Date year routing, mixed add/update/delete results, and whole-transaction rollback after a forced SQL constraint failure.
- `ERPPrototype.csproj` excludes the test folder from the web project's recursive compile/content globs, so tests are not compiled into or published with the application.
- No production service, page, JavaScript file, database migration, or business rule is changed in R2A.

Practical example: the rollback test sends normal updates plus a new row, then forces one SQL constraint failure. The test passes only when no update and no added row remains in the database.

Runtime status: accepted on the developer machine with 6/6 PASS before the R2 extraction.


## 25. Phase 8.8-R2 — Save Plan Builder

- `Data/WorkOrderSavePlanBuilder.cs` owns deterministic input grouping, digit/text normalization, editable-field validation, changed/deleted overlap rejection, and required RowVersion presence.
- `WorkOrderService` still owns authorization, global duplicate checks, database RowVersion enforcement, loading entities, year routing execution, add/update/delete persistence, one transaction, commit, rollback, and database error mapping.
- The automated runner contains four direct plan tests plus the original six SQL Server scenarios.
- The user confirmed the final result `10/10 passed`; no browser regression was required because R2 changed no page, JavaScript, query shape, migration, or visible behavior.

Practical example: the builder can reject a saved row missing RowVersion before opening a DbContext, while the service remains the only place that verifies the actual database RowVersion and commits the transaction.


## 26. Phase 8.9 — Accepted Final Closure

Phase 8.9 changed documentation and engineering tools only. It added:

- `Tools/Invoke-Phase8Verification.ps1` for Release build, optional JavaScript syntax checks, and the 10 automated save tests.
- `Tools/Remove-LocalBuildArtifacts.ps1` for local `bin/obj/.vs` and machine-file cleanup.
- `Tools/New-CleanProjectArchive.ps1` for a source-only ZIP that excludes build output and binaries.
- `Tools/Invoke-Phase8Closure.ps1` to run cleanup, verification, and clean archive creation in one command.

No production C#, Razor, JavaScript, migration, database rule, or UI behavior changed in Phase 8.9. The closure workflow reported Release Build PASS, 10/10 automated save tests, Git source hygiene PASS, and clean archive creation PASS. Maintainability refactoring is now closed; further extraction requires a feature or measured defect that proves a concrete need.

## 27. Phase 9.0 — Browser Automation Foundation Accepted

Phase 9.0 introduces `ERPPrototype.E2ETests` as a standalone console runner rather than placing browser code inside the web project. The runner:

- creates a uniquely named SQL Server/LocalDB database and applies the real migrations;
- seeds an active Employee, branch, department, and rows in the current and previous years;
- starts the Release web application on a random loopback HTTP port using the temporary connection string;
- runs Chromium through Playwright;
- logs in through the real Identity UI;
- verifies employee branch and department scope;
- verifies the current-year row;
- changes the year selector and verifies the previous-year row replaces it;
- stops the app and deletes the temporary database;
- saves a success screenshot, or a screenshot plus Playwright trace when the journey fails.

The only web-startup hook is an `E2ETest` environment check that disables HTTPS redirection for the loopback test process. Development and production environments retain the existing HTTPS behavior. No migration, Work Order business rule, grid JavaScript, or normal UI behavior changes in Phase 9.0.

Acceptance command from the Solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

Accepted markers: integration `10/10`, browser `4/4`, and `Phase 9.0 automated foundation verification: PASS`. The first run may install the Playwright Chromium binary in the user cache; it is not stored in the project source.



## 28. Phase 9.0B — Browser Automation Hardening Candidate

Phase 9.0B keeps the same isolated LocalDB/database and local web-process model, but replaces brittle text/CSS selectors with stable `data-testid` hooks and Page Objects. The web UI gains test-only attributes with no visible styling or business-behavior change.

The browser project now owns:

- `LoginPage` and `WorkOrdersPage` reusable interaction boundaries;
- explicit readiness for the login page, authenticated page, generated Blazor assets, and the registered Tabulator table/state;
- `Smoke` (5 checks) and `Full` (9 checks) suites;
- a common browser session that installs Chromium when absent, owns context isolation, tracing, screenshots, and cleanup;
- browser diagnostics for page errors, HTTP 5xx responses, console errors, and failed requests;
- artifact retention limited to the latest 10 runs;
- `Tools/Invoke-ERPTests.ps1` is the canonical command. The old Phase 9 compatibility wrapper was removed during the 2026-08-12 source cleanup.

The Full suite remains a foundation journey, not the final Work Orders coverage. Edit/Save, insert/delete, duplicate UI, Undo/Redo, Copy/Paste, search/filter, and future financial/custom columns belong to Phase 9.0C and later feature phases.

No migration, Work Order rule, save path, JavaScript behavior, or database shape changes in Phase 9.0B. Acceptance requires Release build, existing SQL tests 10/10, and Full browser checks 9/9.


## 29. Phase 9.0C — 1,000-Row Coverage Candidate

The E2E database now contains 1,000 Work Orders per year for two years. Smoke and Full therefore exercise the same large sheet size used by the current acceptance candidate. Full covers virtual scrolling to row 1,000, search restore, one-cell Save with reload persistence, and switching between two independent 1,000-row years. Stress adds 1,000 unsaved rows to an existing 1,000-row table, verifies Undo/Redo/final Undo, and records timings. The SQL runner gains an optional 1,000-row add/update/delete service test.

## Phase 9.0C-R2 candidate — observable and complete current-sheet browser coverage

The automated platform now has an optional Observe mode and Full/Stress browser coverage for duplicate rejection, saved deletion, and Assignment Date year movement. Acceptance requires 11/11 SQL Server checks and 33/33 Stress browser checks. No production behavior changed.



## 34. Phase 9.2D2 — Current Browser Verification and Deep Performance State

This section supersedes older descriptions of an optional visual slowdown mode.
The current E2E runner has no Observe option and no artificial Playwright delay.
Headed mode is visible only and still uses `SlowMo = 0`.

Functional `Stress` remains responsible for correctness and keeps diagnostic
artifacts. Its timing fields are explicitly non-comparable and must not be used
as the product performance baseline.

The dedicated `Performance` suite is the quantitative path. Every independent
run uses a fresh browser, disables timing trace, measures input-to-double-RAF
inside Chromium, preserves the same page and year, traverses to the end region
of the real 1,000 / 5,000 / 10,000-row dataset, verifies bounded Virtual DOM and
clean sheet state, and writes raw samples plus P50/P95/heap data to JSON.

Year changes in the functional journey now wait for the requested year, row
count, known Work Order identity, absence of the old-year identity, and aggregate
readiness. This removes the race where two years both contained 1,000 rows.


## 30. Phase 9.3A–9.3E — Custom Columns, Layouts, Lifecycle, Visibility, and Legacy-Field Removal

- A Department Employee can insert a custom column before or after any data-column Header.
- Types are exactly Text, Money, Date, and whole Number; there is no Dropdown type.
- Definitions and positions belong to the department and appear in all its years.
- Column widths are stored separately by DepartmentId + FieldKey and use the normal explicit Save action.
- Width changes support mouse drag, Undo/Redo, Refresh, and year switching. There is no exact-width entry dialog.
- Header text, filter, and sort controls remain adjacent; long titles ellipsize before pushing controls away.
- A custom-column type is immutable after creation. Properties allow rename only; deletion remains a separate confirmed operation.
- Custom Text, Date, and whole-Number columns receive a client-side value filter automatically. Custom Money columns receive numeric sort only, starting largest-to-smallest.
- Any data column can be hidden from its Header context menu. `Unhide Column` appears only while hidden columns exist and lists those columns on demand.
- Hide/Unhide and width changes are local until the normal Save action, participate in Undo/Redo, and persist by department across all years.
- The custom-column value scan previously used to decide whether type conversion was allowed has been removed; opening and saving the sheet no longer runs that extra `OPENJSON` query.
- Legacy `Status` and `Notes` fields were removed from the entity, schema, grid, filters, save pipeline, and tests in Phase 9.3D. Existing values in those database columns are intentionally deleted by the migration.
