# START HERE — ERP Prototype

**الحالة:** مرجع البدء الحالي
**آخر تحديث:** 2026-08-05
**نقطة الكود المقبولة:** `Phase 9.3D` — Build وMigration ناجحان واختبارات SQL Server `25/25`
**الخطوة الحالية:** `Phase 9.3E` — فلاتر وترتيب وإخفاء الأعمدة المخصصة بأقل حمل على المتصفح والسيرفر
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
- مشروع `ERPPrototype.E2ETests` مقبول بعد نجاح أول رحلة متصفح آلية `4/4` على تطبيق وقاعدة مؤقتين.

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

المرحلة مقبولة على جهاز التطوير بعد أن أضافت مشروعًا مستقلًا يشغّل نسخة محلية من التطبيق على منفذ عشوائي وقاعدة SQL Server مؤقتة، ثم يستخدم Playwright لتنفيذ:

```text
Login → فتح شيت الموظف → التأكد من الفرع والقسم → عرض السنة الحالية → تغيير السنة → عرض بيانات السنة المختارة
```

لرؤية المتصفح أثناء الاختبار من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

التشغيل ينفذ أيضًا اختبارات الحفظ العشرة أولًا. دليل القبول المسجل:

```text
Result: 10/10 passed.
Result: 4/4 browser checks passed.
Phase 9.0 automated foundation verification: PASS
```

في أول تشغيل فقط قد يتم تنزيل Chromium إلى Browser Cache الخاص بالمستخدم. التنزيل ليس داخل المشروع ولا يدخل ZIP المصدر.


## Phase 9.0B — Browser Automation Hardening

المرحلة الحالية لا تضيف ميزة أعمال. هدفها تحويل الرحلة الأولى إلى منصة قابلة للتوسع عبر:

- `data-testid` ثابت لعناصر Login والشيت الأساسية.
- Page Objects مشتركة لـLogin وWork Orders بدل selectors موزعة.
- انتظار صريح لـBlazor وTabulator قبل بدء التفاعل.
- وضعي `Smoke` و`Full`، مع Full افتراضيًا.
- Screenshot وTrace وDiagnostics عند الفشل، وصورة نجاح عند القبول.
- الاحتفاظ بآخر 10 نتائج فقط وتنظيف الأقدم.
- أمر دائم واحد: `Tools/Invoke-ERPTests.ps1`.

التشغيل المرئي الكامل من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

القبول يتطلب اختبارات SQL `10/10` وBrowser Full `9/9`. بعد ذلك تبدأ Phase 9.0C لتغطية تعديل وحفظ وإضافة وحذف وUndo/Redo في الشيت الحالي.

## ما بعد Phase 8

الترتيب المقترح للميزات:

1. إكمال شيت أوامر العمل: الأعمدة المالية والإجماليات.
2. الفلاتر والترتيب وحفظ أحجام الأعمدة.
3. استكمال الأعمدة المخصصة والنصوص الطويلة وتسريع Auto-scroll.
4. صلاحيات وتجربة BranchManager وProjectManager.
5. إدارة حسابات الفرع.
6. Excel Import/Export، ثم المستودع والفواتير.

## قاعدة تسليم الملفات

- تعديل بسيط في ملف واحد: تعليمات مباشرة.
- تعديل كبير أو حساس: ZIP Patch.
- نقطة مراجعة كبيرة: يجوز تسليم نسخة مصدر كاملة نظيفة.
- لا تُرسل ملفات `bin` أو `obj` أو `.vs` أو `*.user` أو ملفات تنفيذ ومكتبات مبنية.
- استخدم `Tools/New-CleanProjectArchive.ps1` عند تجهيز المشروع للرفع.

### Current candidate: Phase 9.2D2

- Observe mode and every artificial Playwright delay were removed.
- Functional Stress remains a 55-check correctness journey and no longer claims
  to be the quantitative performance baseline.
- Year switching now waits for the requested dataset identity, count, and
  aggregate readiness before scrolling.
- The neutral Performance suite traverses the same sheet to its end region and
  compares cold versus long-session input-to-paint latency.
- A full headless performance matrix is available for Arrow, Enter, and Wheel
  with 1,000, 5,000, and 10,000 rows per year.

Acceptance order:

1. `Invoke-ERPTests.ps1 -Suite Stress` must return Integration 17/17 and Browser 55/55.
2. Run the 1,000-row Arrow baseline and inspect its JSON.
3. Run Enter and Wheel separately.
4. Expand to 5,000 and 10,000 rows, or run the full matrix.
