# CURRENT-STATE POINTER - 2026-09-04

This document remains authoritative for its own subject area.

For the latest implementation checkpoint, active issues and execution sequence use `03_CURRENT_IMPLEMENTATION.md`, `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `09_REFACTOR_ROADMAP.md` and `10_RELEASE_READINESS_PLAN.md`.

Only older statements that describe Gate 5A/B10/B11 or Real DB Save as the current next step are historical.

---

# CURRENT GRID/SELECTION ARCHITECTURE OVERRIDE — 2026-08-30

This section records the accepted Gate 5B-10 selection boundary. Older architecture sections remain valid unless they conflict with this boundary.

## Selection ownership

- RevoGrid Community remains owner of native cell range, focus, keyboard navigation/editing, scrolling and virtualization.
- Gate 5B-10 registers a narrow ERP selection plugin through Revo `grid.plugins` for product concepts Community does not natively provide: whole-row/whole-column Plain/Ctrl/Shift selection.
- ERP semantic state stores stable identities (`ClientKey` for rows, column `prop` for columns), not a duplicate full cell-range engine.
- Revo native focus/range stays active; the plugin synchronizes the active contiguous row/column portion through public `setCellsFocus(...)`.
- Row Header events enter through `rowHeaders.cellProperties`; Column Header events enter through Revo `beforeheaderclick`.
- selected visuals are produced through Revo render properties (`cellProperties`, row-header properties and column properties), so virtualization owns creation/destruction of rendered DOM.
- changed column headers use public `updateColumns(...)`; do not reassign `grid.columns` merely to force a repaint because RTL/display ordering can diverge from logical ordering.
- command targeting combines Revo native active range with ERP semantic selection through the existing read-only selection-context boundary.
- do not create a parallel full selection coordinator, use Revo private selection stores as a new dependency, clear Revo focus to manufacture a non-empty selection, or repaint virtualized DOM by scanning rendered cells.

## Filter/current-view safety boundary

- Revo Filter owns which rows are trimmed from the current result.
- ERP row-selection semantics must prune rows that leave the current Filter result.
- any new sheet mutation that resolves row/cell targets must intersect those resolved targets with the current filtered result before mutation.
- Scroll is only virtualization/viewport movement and must not prune selection.
- Sort changes position, not Work Order identity, and must not prune identity-based selection.
- Save/Undo/Redo operate on already-created state/history; they are not reinterpreted as new hidden-row targeting.

## Current implementation status

The accepted implementation checkpoint is Gate 5B-10 at `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`. Filter-pruning, identity-preserving Sort/Scroll behavior, visible virtualization-safe row/column selection and dataset-switch clearing are implemented and accepted. The next bounded architecture work is the snapshot-safe Save contract; selection architecture should remain closed unless new regression evidence requires change.

---

# TARGET DOMAIN ARCHITECTURE OVERRIDE — 2026-08-26

This section defines the current long-term architecture direction after the 14-review synthesis.

## 1. One Work Order, Many Specialist Modules

```text
Master Work Orders
        |
        v
   WorkOrder root/reference
        |
   +----+------+---------+----------+
   |           |         |          |
Municipality Execution Inspection Documents ...
```

Rules:

- Master Work Orders creates original Work Order.
- specialist modules reference same Work Order.
- never create independent copies per department.
- specialist lifecycle/data belongs in specialist modules, not dozens of Master columns.
- Work Order remains shared reference, not god object implementing every subsystem.

## 2. Grid Boundary

> Revo owns grid mechanics; ERP owns business meaning.

Revo/adapter may own:

- virtualization.
- ranges.
- focus/navigation.
- clipboard mechanics.
- column mechanics.
- filter/sort mechanics.

ERP owns:

- validation.
- financial rules.
- logical transaction/History semantics.
- Dirty/Save state.
- authorization.
- persistence identity/RowVersion.
- business audit.
- specialist workflows.

All unavoidable Revo internals use should be isolated behind narrowest practical adapter.

## 3. Business Audit Boundary

Client Undo/Redo is not Audit.

Durable Business History is server-side and later records sensitive operations such as identity correction, manager-authorized delete, closure/reopen and specialist lifecycle events where required.

## 4. Manager Boundary

- BranchManager: operational authority inside one branch.
- ProjectManager: global visibility over Branch Managers/branches, Work Orders read-only.
- Admin: system/account role; operational authority is not implied automatically.

See `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

## 5. Future Module Boundary

Municipality, Documents, Commercial, Materials, HSE and other future areas should not be implemented by expanding `WorkOrderService` indefinitely.

Each should have a coherent application/domain boundary and link back to WorkOrder identity.

The product remains a Modular Monolith; this does not require Microservices.

---

# 04 — Architecture and Dependencies

## CURRENT GRID-ENGINE TRANSITION — 2026-08-20

**Current runtime:** `/work-orders` still uses Tabulator 6.5.0.
**Selected target:** RevoGrid Community 4.25.2.
**Scope:** replace the browser grid engine only; preserve the current Blazor/server/database boundaries.

### Gate 5 architecture rule

```text
Isolated RevoGrid Work Orders route
        |
        | same real load DTO / employee scope
        v
WorkOrderQueryService / WorkOrderService
        |
        v
EF Core / SQL Server

Browser side:
RevoGrid 4.25.2
        |
        +--> Work Orders-specific adapter/state
        |
        +--> existing business behavior contract
```

Rules:

- Do not run Tabulator and RevoGrid as two state owners for the **same live Work Orders page**.
- Gate 5A may coexist as a separate route only.
- Reuse the server read/save contracts where they are business contracts; do not copy Tabulator internals into the server.
- Do not port Tabulator-specific range/Virtual-DOM workarounds unless an equivalent RevoGrid defect is independently reproduced.
- Public RevoGrid APIs are preferred over undocumented internals.
- Before final cutover, the exact `4.25.2` assets and MIT license must be self-hosted/pinned; the production path must not depend on `latest` or an external CDN.
- The current C#/Razor page calls a 22-method `tabulatorTest` surface. Gate 5 must replace that dependency deliberately; it must not create a second parallel facade that leaves both implementations authoritative.
- Frozen UI dimensions and `05_WORK_ORDERS_GRID_BEHAVIOUR.md` remain the product contract regardless of engine.

---

**Status:** Approved direction
**Current state:** One project with partial separation
**Target:** Modular Monolith without a full rewrite

## 1. Decision

نستمر كتطبيق واحد قابل للنشر، لكن نفصل المسؤوليات داخله إلى موديولات واضحة.

لا نستخدم Microservices.
لا نقسم المشروع إلى عشرات المشاريع الآن.
لا نعيد كتابة الشيت من الصفر.

## 2. Current Layers

```text
UI
- Razor pages/components
- Tabulator JavaScript

Application logic
- WorkOrderQueryService — read-only sheet queries
- WorkOrderSavePlanBuilder — pure save input normalization and validation
- WorkOrderService — compatibility facade plus authorized transactional persistence
- UserManagementService

Data and identity
- ApplicationDbContext
- EF Core
- ASP.NET Core Identity

Infrastructure
- SQL Server
- Azure App Service / Azure SQL
```

## 3. Required Dependency Direction

```text
UI -> Application Services -> Data Access -> SQL Server
```

Rules:

- UI may request an operation but does not own business authority.
- JavaScript may improve speed and user feedback but cannot be the final guard.
- Services own use-case rules and permission checks.
- Database owns final constraints and relationships.
- A low-level module must not call UI code.

## 4. Shared State: Small and Explicit

فكرة فصل كل ميزة صحيحة، لكن لا نجعل كل ميزة تملك نسخة منفصلة من نفس البيانات.

الحالة المشتركة الضرورية فقط تكون في `GridSessionState`:

- الخلية/النطاق النشط.
- الصفوف المعدلة.
- الصفوف المحذوفة.
- Undo/Redo stacks.
- validation errors.
- filter state.
- lifecycle flags.

كل Feature تتعامل مع الحالة عبر API واضحة، ولا تعدل متغيرات Feature أخرى مباشرة.

## 4.1 Work Orders JavaScript Loading Boundary — 2026-08-13

- `appLayout.js` remains application-wide because it owns Wide/Split layout for shared shell components as well as Work Orders.
- `workOrdersLoader.js` is the single loading owner for the heavy Work Orders browser runtime.
- The loader is route-based only: `/work-orders` triggers loading. It contains no User, Branch, Department, Year, role, or business-rule condition.
- Tabulator plus the Work Orders `tabulator*.js` feature modules are loaded in their existing dependency order before `tabulatorTest.initialize` is called.
- `tabulatorPerformance.js` is excluded from normal use and loads only when a supported `perf` query mode is explicitly requested.
- Loaded scripts remain cached/in-memory for later visits in the same browser page session; the loader does not attempt unsafe script unloading.

## 5. Target JavaScript Structure

هذا هدف تدريجي، وليس تغييرًا منفذًا الآن:

```text
wwwroot/js/workOrdersGrid/
  workOrdersGridHost.js
  core/
    gridController.js
    gridSessionState.js
    tabulatorAdapter.js
    lifecycle.js
  features/
    navigation.js
    selection.js
    editing.js
    clipboard.js
    history.js
    validation.js
    structure.js
    filtering.js
    resize.js
  diagnostics/
    performanceObserver.js
```

### Responsibility

- `Host`: الواجهة الوحيدة التي يستدعيها Blazor.
- `Controller`: ينسق فقط، ولا يحتوي تفاصيل كل ميزة.
- `Session State`: مصدر واحد للحالة المشتركة.
- `Tabulator Adapter`: المكان الوحيد للتعامل المباشر مع Tabulator API قدر الإمكان.
- `Feature`: تملك listeners/timers/RAF الخاصة بها وتوفر `initialize` و`dispose`.

## 6. C# Boundaries

الاتجاه المستهدف:

```text
Components
  -> Application Services
      -> Domain/Data rules
          -> EF Core
```

توصيات محددة:

- نقل عمليات الفرع من `AdminPanel.razor` إلى `BranchManagementService`.
- استكمال `UserManagementService` بدل كتابة إدارة الحسابات داخل Razor.
- إبقاء `WorkOrderService` كواجهة توافق مؤقتة للصفحة، مع نقل تنفيذ القراءة إلى `WorkOrderQueryService` تدريجيًا وعدم تغيير عقد الصفحة والحفظ في نفس الخطوة.
- عدم وضع قواعد صلاحيات أو uniqueness في JavaScript فقط.

## 7. Database Boundaries

قاعدة البيانات هي آخر خط دفاع:

- Unique Index يمنع التكرار حتى لو حدث سباق بين جلستين.
- Foreign Keys تمنع حذف مرجع مستخدم.
- RowVersion تمنع الكتابة فوق تعديل أحدث.
- Check Constraints تمنع أرقامًا غير صحيحة.

## 8. Ownership Rule

| Concern | Owner |
|---|---|
| Keyboard and viewport behavior | JavaScript grid feature |
| Fast client validation message | JavaScript |
| Save-input normalization and field validation | WorkOrderSavePlanBuilder |
| Authorization and transactional save enforcement | WorkOrderService |
| Permission scope | Server query/service |
| Uniqueness | Service + Database |
| Concurrency | Service + RowVersion |
| Current visual selection | Grid session state |
| User/branch administration use case | Application service |
| Persistence | EF Core / SQL Server |

## 9. Change Isolation Rule

قبل تعديل Feature:

1. تحديد ما تملكه.
2. تحديد الـshared state الذي تلمسه.
3. تحديد event listeners/timers/RAF.
4. تحديد الاختبارات التي قد تتأثر.
5. منع الوصول المباشر إلى internals غير موثقة قدر الإمكان.
6. تنظيف كل resource في `dispose`.

## 10. What We Will Not Do

- Rewrite كامل للشيت.
- نقل كل شيء إلى C# وإلغاء JavaScript.
- Event Bus داخلي بلا احتياج.
- CQRS شامل.
- Shared Utils file ضخم.
- تقسيم مبكر إلى Microservices.
- خلط Refactor مع Feature جديدة في نفس الخطوة.

## 11. Simple Example

الملف الحالي يشبه لوحة كهرباء واحدة فيها مفاتيح الإنارة والتكييف والمضخة بلا تقسيم واضح.
التقسيم المطلوب لا يعني بناء مبنى جديد؛ يعني وضع كل دائرة في قاطع معروف، مع لوحة رئيسية صغيرة مشتركة. عند إصلاح التكييف لا تنطفئ الإنارة.


## 12. Field Registry and Rule Dependencies — Phase 8.5

The grid no longer spreads field-specific decisions across paste, history, dirty tracking, validation, and save code.

- `tabulatorFieldChanges.js` is the generic browser engine for field definitions, changed-field sets, rule dependencies, and batch application.
- `tabulatorValidation.js` registers the current core field definitions and validation dependencies.
- `WorkOrderFieldRegistry.cs` is the server contract for current persisted core fields and rule dependency sets.
- A feature asks whether a rule is affected by the changed field keys; it does not hard-code unrelated column checks inside each operation.

Future custom fields must use a stable field id and register metadata such as type, label, visibility, width, filter type, and validators. Renaming the visible column must not change the stable id. Custom-field persistence is a later feature and must not be implemented as a database migration for every user-added column.


## 13. Current Lifecycle Boundary — Phase 8.6-R1

`tabulatorLifecycle.js` is the single current owner of lifecycle resources for one Work Orders grid instance:

- creates the mutable grid-session state;
- applies and releases the desktop page-scroll lock;
- removes document/window listeners owned by the grid;
- cancels resize and navigation animation work;
- closes filter popups and detaches range auto-scroll;
- destroys the old Tabulator instance and removes its state.

`tabulatorTest.js` remains the coordinator that builds the Tabulator configuration and binds feature behavior. This patch does not move navigation algorithms or change runtime behavior.

**Work example:** changing the selected year is like closing one Excel workbook before opening another. The old workbook must stop receiving keyboard and copy/paste commands; otherwise one key press could reach both the old and new sheet.

## 14. Current Interaction Boundary — Phase 8.6-R2

`tabulatorInteractions.js` is the single current binding owner for user actions on one live Work Orders sheet:

- grid/container interactions: right-click range guard and resize;
- Tabulator edit and selection events;
- active-sheet pointer tracking and context menu activation;
- keyboard navigation, direct typing, clear, Undo/Redo;
- document Copy/Paste handlers.

`tabulatorLifecycle.js` owns removing document/window/container handlers and cancelling asynchronous work. `tabulatorTest.js` remains the coordinator and keeps the underlying navigation, selection, resize-restoration, clipboard, history, and structure algorithms.

**Dependency direction:**

```text
tabulatorTest.initialize
        |
        +--> tabulatorLifecycle: create/dispose one grid owner
        |
        +--> tabulatorInteractions: bind one live interaction set
        |
        +--> feature modules: execute the requested operation
```

**Work example:** the interaction module is the reception desk that receives one user command and routes it to the correct department. It does not decide duplicate rules or save logic, and it must not create a second route for a future custom column.



## Phase 8.7-R1 Save Boundary

The Work Orders component is now split by workflow ownership:

- `WorkOrders.razor`: markup and bindings.
- `WorkOrders.razor.cs`: page lifecycle, initial/year loading, grid initialization, shared row mapping, and disposal.
- `WorkOrders.Save.cs`: the complete Blazor save orchestration and save-only DTO/helper types.

This is a partial-class boundary, not a new service or network layer. Dependency injection and all existing calls remain unchanged. The extraction deliberately keeps `WorkOrderService` as the business/persistence boundary and `tabulatorTest` as the current browser API.

Practical example: a duplicate `(WorkOrderNumber + WorkTypeCode)` is still rejected by the service and mapped back to the exact cells by the same code. The only architectural change is that this mapping now lives beside the rest of the save journey.

## Phase 8.7-R2 Save Preparation and Result Boundaries

The Blazor save boundary now has three internal responsibilities while remaining one partial component and one user action:

```text
Save button / WorkOrders.Save.cs
        |
        +--> WorkOrders.SaveRequest.cs
        |       browser delta -> service request
        |
        +--> WorkOrderService
        |       authorization, rules, transaction, persistence
        |
        +--> WorkOrders.SaveResult.cs
                service result -> validation marks, row reconciliation, status text
```

These files do not form new network or dependency-injection services. They are review boundaries inside the same component. The service remains the authority for permissions, global uniqueness, concurrency, and database changes.

**Work example:** a duplicate pair is still decided by `WorkOrderService`. `SaveResult` only translates that result into the two red cells and the Arabic message. `SaveRequest` cannot decide that the pair is unique, and the UI coordinator cannot silently save around the service result.



## Phase 8.7-R3 Dirty-State Boundary

Browser change ownership is now explicit:

```text
Field edit / Paste / Undo / Redo / Insert / Delete
        |
        +--> tabulatorFieldChanges / ClipboardHistory / Structure
                    |
                    +--> tabulatorDirtyState.js
                            compare with saved baseline
                            track row + exact changed fields
                            track deleted saved rows
                            expose dirty/deleted Save delta

Successful Save result
        |
        +--> tabulatorTest.applySavedDelta
                    |
                    +--> tabulatorDirtyState.js
                            accept server rows as new baseline
                            clear dirty/deleted sets
```

`tabulatorDirtyState.js` does not decide validation, uniqueness, authorization, year routing, database persistence, Arabic messages, or how Undo/Redo values are applied. It records the resulting data state only.

**Work example:** Clipboard/History may restore 4,950 custom-column values, but it does not manually maintain a second unsaved-row list. It applies the values, then Dirty State compares the affected field against the accepted baseline and decides which rows remain unsaved.


## Phase 8.8-R1 Read/Write Boundary

The first service split is deliberately asymmetric and keeps the verified UI contract stable:

```text
WorkOrders page
      |
      +--> WorkOrderService.LoadSheetAsync (compatibility facade)
      |               |
      |               +--> WorkOrderQueryService
      |                       employee scope + available years + rows
      |
      +--> WorkOrderService.SaveChangesAsync
                      authorization + validation + uniqueness
                      transaction + concurrency + persistence
```

`WorkOrderQueryService` is read-only and uses `AsNoTracking` projections. It cannot save, decide duplicates, move rows, or open a transaction. `WorkOrderService` retains all mutation authority in R1.

**Work example:** loading 2025 and 2026 is a query concern. Changing Assignment Date so an order moves from 2026 to 2027 is a save concern and therefore remains inside the transactional service.


## Phase 8.8-R2A Integration-Test Boundary

The integration suite is a development-only executable and is not a runtime application layer:

```text
ERPPrototype.IntegrationTests
        |
        +--> ProjectReference: ERPPrototype
        +--> real ApplicationDbContext + SQL Server migrations
        +--> real WorkOrderService / WorkOrderQueryService
        +--> random temporary database
```

The application does not depend on the test project. `ERPPrototype.csproj` removes the test folder from its recursive compile, content, embedded-resource, and none item globs. The test project depends inward on the application, never the reverse.

**Work example:** an Employee from Department A sends a modified row that belongs to Department B. The test calls the service directly, bypassing the browser, and proves the server rejects the request and leaves the database row unchanged.


## Phase 8.8-R2 Save-Plan Boundary

The save path now has one pure preparation boundary before database execution:

```text
Browser save request
        |
        +--> WorkOrderSavePlanBuilder
        |       group new/changed/deleted rows
        |       normalize changed fields and editable values
        |       validate field rules and required RowVersion presence
        |       return plan or early failure
        |
        +--> WorkOrderService
                authorize employee scope
                global duplicate check + unique index
                load current rows and enforce RowVersion
                execute year movement/add/update/delete
                one transaction + commit/rollback
```

The builder has no DbContext, SQL query, transaction, logger, or UI dependency. It may reject an invalid request, but it cannot declare a work-order identity globally unique or persist a row.

**Work example:** a Basket-only edit is grouped and normalized by the builder. The service then confirms the employee owns the department and applies the update using the database RowVersion inside the existing transaction.
