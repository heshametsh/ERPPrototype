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
