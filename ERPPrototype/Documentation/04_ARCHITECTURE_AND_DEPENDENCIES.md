# 04 — Architecture and Dependencies

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
- WorkOrderService
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
- إبقاء WorkOrderService هو مدخل أوامر العمل من UI.
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
| Final field validation | WorkOrderService |
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

