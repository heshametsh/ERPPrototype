# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-30

> This is the newest implementation snapshot. Older overrides below remain historical when they conflict.

**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**Live `/work-orders`:** Tabulator 6.5.0 until accepted cutover.
**Current Revo route:** `/work-orders-revogrid-gate5b10` using RevoGrid Community 4.25.2.

## Gate 5B-10 — Header Selection

- Plain/Ctrl/Shift whole-row selection is implemented by stable row `ClientKey`.
- Plain/Ctrl/Shift whole-column selection is implemented by stable column `prop`.
- the extension is registered as a Revo plugin through `grid.plugins`.
- Row Header interaction is attached through `rowHeaders.cellProperties`; Column Header interaction uses Revo `beforeheaderclick`.
- Revo native focus/range remains active and is synchronized for the active contiguous row/column portion through public `setCellsFocus(...)`.
- ERP semantic selection stores identity, not a duplicate full cell-range engine.
- selected-row/selected-column visuals are emitted through Revo `cellProperties`, `rowHeaders.cellProperties` and column properties; no virtualized DOM scan/painter is used.
- changed column headers are refreshed through public `updateColumns(...)`; B10 does not reassign the whole `grid.columns` list.
- Filter reconciles visible rows and prunes selected `ClientKey` values that leave the current result.
- Sort re-applies the native active range after `aftersortingapply` while semantic selection stays keyed by identity.
- Scroll/virtualization repaint selected rows/columns from render properties.
- right-click inside selection preserves it; outside selection uses the clicked context target.
- year/dataset switch clears semantic selection.
- disjoint Ctrl multi-cell ranges remain out of scope.

## Acceptance

- Build PASS.
- Gate 5B-9 Structure Workspace real-browser regression PASS.
- Gate 5B-10 Header Selection real-browser journey PASS across scenarios 01-09.
- user manual browser verification PASS on 2026-08-30.
- acceptance is based on visible rendered state in addition to diagnostic/native state.

## Not implemented yet in Revo production path

- snapshot-safe Save acceptance/rejection handshake.
- production database Save.
- end-to-end `RowVersion` concurrency handling through Revo Save.
- server validation/duplicate/scope failure mapping into the Revo sheet.
- database-connected Custom Column CRUD/layout persistence.
- reconnect/lost-response recovery.
- production self-hosted/pinned Revo assets.
- high-value manager/KPI/search parity.
- `/work-orders` cutover.

---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-29

> This is the newest implementation snapshot. Older overrides below remain historical when they conflict.

**Latest accepted Git HEAD:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**Live `/work-orders`:** Tabulator 6.5.0 until accepted cutover.
**Current Revo route:** `/work-orders-revogrid-gate5b9` using RevoGrid Community 4.25.2.

## Current Revo state

The B6 foundation remains present: Change Engine, Sheet History/Dirty separation, Manual Edit, Paste, Range Clear, Excel-like Filter, Sort, header selection, row Insert/Delete, Remaining synchronization and Unified soft Validation.

### Gate 5B-7 — Persistence Identity

- every row carries stable `ClientKey`.
- persisted rows retain database `Id` and `RowVersion`.
- persisted deletion records carry exact database `Id` + `RowVersion`.
- delete → Undo → Redo preserves the same persisted identities.
- temporary unsaved-row deletion does not create a persisted-delete record.
- persisted rows missing `RowVersion` are treated as invalid persistence identity.
- this is browser-side identity/reconciliation preparation; the Revo route still does not perform real DB Save.

### Gate 5B-8 — Selection Context

- right-click inside the employee's current range/whole-column selection preserves that selection for context commands.
- right-click outside the current selection may target the clicked location instead of applying a stale selection.
- deliberate whole-column selection is represented as column intent and must not be interpreted as permission to act on every source row.
- year/dataset switch clears selection because the dataset boundary changed.

### Gate 5B-9 — Structure Workspace

- one neutral context menu exposes Rows/Columns structure commands only.
- Insert Rows/Columns asks for explicit count/direction; selection size does not multiply insert count.
- row deletion from a whole-column selection is constrained to the displayed/current filtered rows.
- Custom Column insert/delete uses one Sheet History transaction and protects core columns.
- visual RTL `Insert Left/Right` is translated to the correct logical order and can rebalance adjacent Custom Column layout order.
- right-click inside selected columns preserves the existing selection; outside targets the clicked column.
- clipboard single-cell paste can fill the selected range as one logical operation.
- current route explicitly states that database Save is not connected.

## Approved next behavior, not implemented at this baseline

Gate 5B-10 will be rebuilt cleanly from B9:

- Revo owns native cell range, focus, editing, keyboard and virtualization.
- ERP adds only missing Ctrl/Shift row/column semantic selection; no second full selection engine or DOM repaint scanner.
- disjoint Ctrl multi-cell ranges are postponed.
- filtered-out rows must leave row selection and must not re-enter it automatically when the filter is cleared.
- new sheet mutations that resolve row/cell targets must recheck those targets against the current filtered result.
- Scroll and Sort do not prune identity selection.
- dirty changes made while a row was visible remain eligible for Save if a later Filter hides the row.
- future B10 tests must assert visible rendered selection under virtualization; internal selection-store assertions are supplemental only.

## Not implemented yet in Revo production path

- production database Save.
- snapshot-safe Save acceptance/rejection handshake.
- end-to-end `RowVersion` concurrency handling through the Revo Save path.
- server validation/duplicate/scope error mapping into the Revo sheet.
- database-connected Custom Column CRUD/layout save from the Revo candidate.
- Ctrl/Shift row/column multi-selection described above.
- Filter-driven selection pruning described above.
- final reconnect/recovery qualification.
- production self-hosted Revo assets.
- production manager/KPI/search parity.
- `/work-orders` cutover.
---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-26

> This section is the newest implementation snapshot. Older overrides below remain historical when they conflict.

**Latest accepted Git HEAD:** `6a6f3cef807f58a41bcfefa7c08b2ebaf6220169`
**Live `/work-orders`:** Tabulator 6.5.0 until cutover.
**Current Revo route:** `/work-orders-revogrid-gate5b6` using RevoGrid Community 4.25.2.

## Current Revo state

Implemented/qualified in isolated Revo candidate:

- real employee/year read path.
- Change Engine.
- Sheet History separated from Dirty/Save ownership.
- manual edit foundation.
- Paste.
- Range Clear with Delete/Backspace.
- readonly Remaining protection.
- Remaining recalculation.
- Excel-like filter layer.
- sort.
- header/column selection support.
- multi-row Insert/Delete.
- Undo/Redo for accepted Gate 5B-5 operations.
- stable `ClientKey` session identity.
- Unified Validation owner for required identity fields, identity format/duplicates, date, Basket, financial rules, and supported custom-field types.
- soft validation: invalid input remains visible, error state is exposed, and Save eligibility is blocked until errors are corrected.
- incremental validation for changed/identity-related rows, with validation cell styling supplied through Revo cell properties rather than scroll-time DOM scanning.

Latest accepted Range Clear regression on this baseline used a real-browser journey and covered Delete, Backspace, Undo, Redo, mixed editable/readonly range, Remaining recalculation, row structure, filter and sort interactions.

Gate 5B-6 Unified Validation was subsequently accepted at `6a6f3ce` with self-tests, hardened real-browser validation assertions, full existing Grid regression, and user manual browser acceptance.

## Not implemented yet in Revo production path
- production database Save.
- full persistence/concurrency handshake using `RowVersion`.
- server validation/error mapping.
- production custom-column CRUD/layout persistence parity.
- production manager/KPI/search parity.
- final reconnect/recovery qualification.
- production self-hosted Revo assets.
- `/work-orders` cutover.

## Business decisions vs implementation

`Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` contains approved target Business rules that older audits may have listed as unresolved.

Do **not** mistake those target decisions for current code behavior.

Current production code does not yet necessarily enforce:

- downstream-interaction identity/delete locking.
- BranchManager-only Reopen.
- durable business audit timeline.
- ProjectManager global read-only Work Orders screen.
- specialist module architecture.
- final invoice naming/model beyond existing derived Remaining calculation.

Those are approved product contracts for later implementation.

---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-24

## Native V1 AI-engineering state

- Architecture V1 is frozen.
- The former Project Brain and V2/V3 AI-team infrastructure is archived under `Documentation/Archive/AI-Team-V3/`.
- Native V1 has one neutral reviewer contract, a Git-visible-state fingerprint, and a tiny Native V1 Receipt writer/storage. It has no router, Lead, child-reviewer, harness, transport, collector, learning engine, database, or dashboard.
- Native Codex telemetry is not available as a structured local session stream in this repository. Receipt telemetry fields remain `null` unless a Native session supplies an observed value.
- Native V1.2 receipts record every completed real mission, including diagnostic missions without a Candidate, using factual timing, lifecycle events, concise material Decision Trace entries, `participants[]`, `reviews[]`, and supplied failure context. Missing telemetry remains `null`; no acceptance, push, reviewer transport, risk classification, or diagnosis outcome is inferred locally.
- Official review-gate evidence is one independent Native subagent review when Main records that review is required. CLI/child/ephemeral/sandbox/archived reviewer transports cannot satisfy the gate, and no second review is launched automatically after sufficient `NO_FINDINGS_EVIDENCE_SUFFICIENT` evidence.

---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-22

> هذا القسم هو الوصف الأحدث للواقع الحالي، وينسخ أقسام الـOverride الأقدم عند التعارض. الكود الحالي والاختبارات في نفس الـcommit يظلان الدليل النهائي لما هو منفذ.

**Latest reviewed Git HEAD:** `04e0f1a`
**Current reviewed source snapshot:** `ERP_REVO_FULL_REVIEW_04e0f1a.zip`

## Work Orders grid state

- `/work-orders` الحقيقي ما زال Tabulator 6.5.0 ولم يحدث production cutover بعد.
- RevoGrid Community 4.25.2 يعمل في المسار المعزول `/work-orders-revogrid-gate5b5`.
- المسار المعزول وصل فعليًا إلى Change Engine + Sheet History/Dirty separation + Paste + Excel-like Filter + dedicated Sort/Header Selection + structural Insert/Delete History + derived Remaining Amount synchronization.
- `RemainingAmount` مشتق من `WorkOrderValue - PartialAmount` في Revo Gate ويظل server-side `WorkOrderFinancialRules` هو المرجع النهائي عند Save.
- Gate 5B-5 لا يملك حتى الآن real database Save binding أو `/work-orders` cutover؛ هذا Gap مقصود وموثق في `DEC-038`.
- **Scope rule:** inspect the current runtime/dependency path before including or excluding Tabulator. `/work-orders` remains the current employee runtime until actual RevoGrid cutover; RevoGrid is the isolated target/new architecture and Tabulator is not its design authority.

## Open before real Revo Save/cutover

- unified working-sheet Validation foundation وفق `DEC-040` ما زال Planned؛ server validation موجود لكن السلوك الجديد للـclient لم يُنفذ بعد.
- multi-cell value Clear/Delete في Revo Gate يحتاج إصلاح الـshared range-operation path؛ single-cell clear يعمل.
- Filter popup search يحتاج استرجاع selection السابقة عند مسح نص البحث بدل الاحتفاظ باختيار نتائج البحث فقط.
- stable row identity/`RowVersion` must be carried through the Revo Save path before real persistence cutover.
- local/self-hosted pinned RevoGrid assets + MIT license remain required before production cutover.

## Historical AI engineering foundation (archived)

- Project Brain V1 and its `PartialAmount` Change Mapper canary are preserved under `Documentation/Archive/AI-Team-V3/` as historical evidence only.

---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-20

> هذا القسم ينسخ أي وصف أقدم لحالة Grid Engine أو “Current task” عند التعارض. الكود الحالي يظل الحقيقة لما هو منفذ.

**Audit baseline:** `00503ab`
**Current production runtime baseline retained:** `0f6bd3b`
**Latest reviewed Git HEAD:** `dc0b2b0`
**Current source package reviewed:** `ERPPrototype_Current_Review_2026-08-20.zip`

## Grid engine state

- `/work-orders` ما زال يعمل فعليًا بـ **Tabulator 6.5.0** و`tabulatorTest` + الوحدات الحالية.
- **RevoGrid Community 4.25.2** تم اختياره كـtarget replacement بعد اختبارات isolated؛ لم يتم ربطه بعد بالصفحة الحقيقية أو Save path الحقيقي.
- ملفات `wwwroot/grid-shootout/` و`ERPPrototype.E2ETests/RevoGridCommunityAutomationRunner.cs` هي Lab/Test evidence وليست production Work Orders runtime.
- لا يوجد في الحالة الحالية RevoGrid production adapter أو RevoGrid package محلي داخل runtime الحقيقي.
- Server authority لم يتغير: `WorkOrderQueryService` للقراءة، `WorkOrderSavePlanBuilder` للتحضير/validation، `WorkOrderService` للحفظ/authorization/transaction، وSQL/RowVersion كخط الدفاع النهائي.

## لماذا تغير الاتجاه

Tabulator ظل قابلًا للعمل لكنه احتاج تراكمًا كبيرًا من grid-specific stabilization حول range/navigation/Virtual DOM/clipboard/structure. بعد اختبار بدائل في isolated shootout، RevoGrid أثبت السلوك المطلوب على 100,000 صف مع مسار أبسط، لذلك تم اعتماد **استبدال المحرك فقط** بدل الاستمرار في micro-patching Tabulator.

## ما زال غير منفذ

- Gate 5A: RevoGrid داخل Blazor page مع **نفس real `LoadSheetAsync` data contract** وفي Route معزول.
- Gate 5B: Dirty/Delta Save + Save result merge + Undo/Redo after Save + Custom Columns/column layouts على RevoGrid.
- Gate 5C: frozen visual parity + full regression + controlled cutover.
- Local/self-hosted pinned RevoGrid 4.25.2 package + retained MIT license.
- إزالة Tabulator production runtime تتم **بعد** نجاح cutover فقط، وليس أثناء Gate 5A.
- بقية Online Reliability / narrow Save / concurrency / security / localization / Offline work تظل لاحقة كما في الـMaster.

---

# CURRENT IMPLEMENTATION OVERRIDE — 2026-08-17

> هذا القسم يحدد الواقع الفعلي الأحدث. التفاصيل التاريخية أسفل الملف لا تُستخدم لتجاوز هذا القسم.

**Audit baseline:** `00503ab`
**Latest confirmed Git checkpoint from captured log:** `0f6bd3b`
**Current source package reviewed:** `ERPPrototype_Current_2026-08-17.zip`

## منفذ فعليًا الآن بعد الـAudits

- Test Foundation strengthened; unexpected page/console/request/HTTP 5xx errors are treated as test failures.
- `LDR-002` fixed: Work Orders waits for the complete required runtime before Ready.
- Grid initialization now requires positive acknowledgement, has bounded retry/cleanup, and manual Retry recovery.
- Clean Open / Real User / 10k Torture measurement infrastructure exists.
- Financial sorting optimization is present and accepted.
- Built-in `?perf=baseline` / `?perf=deep` profiler exists.
- Temporary ManualPerformanceCapture experiment is **not** in current source.
- Existing Online Work Orders behavior, server authority, RowVersion, SQL uniqueness/transactions remain.

## ما زال غير منفذ

- ArrowDown performance fix: **not implemented**; investigation is current.
- Save/year event-boundary reliability fix (`CSB-001`): still open after a rejected experiment was rolled back.
- Narrow physical Delta Save / OperationId receipt contract.
- IndexedDB Draft/Outbox production implementation.
- Production Service Worker Offline Work Orders.
- final Sync/Preflight/conflict engine.
- final OTP/capability/localization foundations and specialist sub-workflows.


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
