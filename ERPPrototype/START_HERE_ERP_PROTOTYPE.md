# START HERE — ERP Prototype

**الحالة:** مرجع البدء الحالي
**آخر تحديث:** 2026-07-31
**نقطة الكود المقبولة:** `Phase8.9-Stable`
**الخطوة الحالية:** `Phase 9.0` تأسيس اختبارات المتصفح الآلية قبل استكمال تعديلات الشيت
**جاهزية الإنتاج:** غير جاهز لعميل حقيقي قبل استكمال الصلاحيات والتشغيل والأمان والنسخ الاحتياطي واختبارات الشبكة

## اقرأ بالترتيب

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/01_PROJECT_CONTEXT.md`
3. `Documentation/03_CURRENT_IMPLEMENTATION.md`
4. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
5. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
6. `Documentation/10_RELEASE_READINESS_PLAN.md`

## ما هو المشروع؟

نظام ويب لمتابعة أعمال شركات المقاولات المتعاملة مع الشركة السعودية للكهرباء أو جهات مشابهة. النظام لا يستبدل الأنظمة الرسمية؛ بل يجمع المتابعة الداخلية لأوامر العمل والمراحل والتأخير والإنتاجية بدل ملفات Excel المتفرقة.

## التقنية الموجودة فعليًا

- Blazor Web App بنمط Interactive Server.
- ASP.NET Core Identity.
- Entity Framework Core 10 وSQL Server/LocalDB/Azure SQL.
- Tabulator 6.5 لشيت أوامر العمل.
- Modular Monolith تدريجي داخل مشروع واحد.

لا توجد Syncfusion في تنفيذ شيت أوامر العمل الحالي، وخطة Power Apps القديمة ليست الاتجاه الحالي.

## أهم قواعد أوامر العمل

- الزوج `WorkOrderNumber + WorkTypeCode` فريد عالميًا عبر الشركة وكل السنوات.
- فهرس القراءة يعتمد على `DepartmentId + WorkYear + DisplayOrder`.
- موظف القسم يعدّل داخل قسمه فقط.
- `RowVersion` يمنع الكتابة فوق تعديل أحدث.
- الحفظ يدعم الإضافة والتعديل والحذف ونقل السنة داخل Transaction واحدة.
- حذف أمر مرتبط بموديول آخر سيُمنع عند تنفيذ تلك الموديولات.

## ما الذي يعمل الآن؟

- تسجيل الدخول دون تسجيل عام.
- حساب Admin واحد وأدوار `ProjectManager` و`BranchManager` و`Employee`.
- إنشاء الفروع والأقسام الأربعة الثابتة.
- شيت أوامر العمل لموظف القسم حسب السنة.
- التعديل المباشر، البحث، الفلاتر، Copy/Paste، إدراج وحذف الصفوف، Undo/Redo، والحفظ التفاضلي.
- منع التكرار العالمي، اكتشاف تعارض الجلسات، ونقل الأمر للسنة المطابقة لتاريخ الإسناد.
- فصل وحدات JavaScript الكبيرة إلى مالكي Validation وHistory وStructure وLifecycle وInteractions وDirty State.
- فصل قراءة السيرفر في `WorkOrderQueryService`.
- فصل التطبيع والتحقق وتجهيز الحفظ في `WorkOrderSavePlanBuilder`.
- 10 اختبارات آلية لمسار الحفظ على قاعدة SQL Server مؤقتة ومعزولة.
- مشروع `ERPPrototype.E2ETests` مرشح في Phase 9.0 لتشغيل أول رحلة متصفح آلية على تطبيق وقاعدة مؤقتين.

## ما الذي لم يكتمل كمنتج؟

- صفحات وصلاحيات التشغيل الكاملة لـBranchManager وProjectManager.
- إدارة حسابات الفرع وإعادة تعيين كلمة المرور.
- Excel Import/Export.
- المستودع والفواتير والمراحل المالية.
- Dashboard والتقارير النهائية.
- Audit Log وClient error reporting والنسخ الاحتياطي ومراجعة إعدادات Production.
- تغطية متصفح آلية شاملة للحفظ والنسخ واللصق وUndo/Redo وبقية الرحلات؛ Phase 9.0 يغطي الأساس فقط.
- اختبار 10,000 صف وشبكة الشركة.

## حالة التنظيم

- Phase 8.1–8.7: فصل الصفحة، التحقق، History، Structure، Lifecycle، Interactions، رحلة الحفظ، وDirty State — مكتملة ومختبرة.
- Phase 8.8-R1: فصل استعلامات القراءة — مكتملة ومختبرة.
- Phase 8.8-R2A: شبكة أمان SQL Server — مكتملة ونجحت 6/6.
- Phase 8.8-R2: فصل Save Plan — مكتملة ونجحت الشبكة الموسعة 10/10.
- لا توجد R3 أو R4 إضافية لـ`WorkOrderService` الآن. أي Refactor جديد يحتاج مشكلة فعلية مثبتة.

## حالة Phase 8.9

Phase 8.9 مقبولة ومغلقة. دليل القبول: Release Build PASS، اختبارات الحفظ 10/10، Git hygiene PASS، ونسخة مصدر نظيفة 3.06 MB. لا يوجد Refactor إضافي مخطط له بدون مشكلة أو ميزة تثبت الحاجة.

## Phase 9.0 — أساس اختبارات المتصفح

المرحلة المرشحة تضيف مشروعًا مستقلًا يشغّل نسخة محلية من التطبيق على منفذ عشوائي وقاعدة SQL Server مؤقتة، ثم يستخدم Playwright لتنفيذ:

```text
Login → فتح شيت الموظف → التأكد من الفرع والقسم → عرض السنة الحالية → تغيير السنة → عرض بيانات السنة المختارة
```

لرؤية المتصفح أثناء الاختبار من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

التشغيل ينفذ أيضًا اختبارات الحفظ العشرة أولًا. القبول يتطلب:

```text
Result: 10/10 passed.
Result: 4/4 browser checks passed.
Phase 9.0 automated foundation verification: PASS
```

في أول تشغيل فقط قد يتم تنزيل Chromium إلى Browser Cache الخاص بالمستخدم. التنزيل ليس داخل المشروع ولا يدخل ZIP المصدر.

## ما بعد Phase 8

الترتيب المقترح للميزات:

1. إكمال شيت أوامر العمل: الأعمدة المالية والإجماليات.
2. الفلاتر والترتيب وحفظ أحجام الأعمدة.
3. الأعمدة المخصصة والملاحظات الطويلة وتسريع Auto-scroll.
4. صلاحيات وتجربة BranchManager وProjectManager.
5. إدارة حسابات الفرع.
6. Excel Import/Export، ثم المستودع والفواتير.

## قاعدة تسليم الملفات

- تعديل بسيط في ملف واحد: تعليمات مباشرة.
- تعديل كبير أو حساس: ZIP Patch.
- نقطة مراجعة كبيرة: يجوز تسليم نسخة مصدر كاملة نظيفة.
- لا تُرسل ملفات `bin` أو `obj` أو `.vs` أو `*.user` أو ملفات تنفيذ ومكتبات مبنية.
- استخدم `Tools/New-CleanProjectArchive.ps1` عند تجهيز المشروع للرفع.
