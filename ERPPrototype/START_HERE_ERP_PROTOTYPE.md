# START HERE — ERP Prototype

**الحالة:** Approved — Phase 8 Refactor Closed
**آخر تحديث:** 2026-07-31
**نقطة الكود المقبولة:** `Phase 8.9` بعد نجاح الإغلاق الآلي
**الخطوة الحالية:** العودة إلى مزايا المنتج، بدايةً بصلاحيات وتجربة `BranchManager` و`ProjectManager` ثم إدارة حسابات الفرع
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

## ما الذي لم يكتمل كمنتج؟

- صفحات وصلاحيات التشغيل الكاملة لـBranchManager وProjectManager.
- إدارة حسابات الفرع وإعادة تعيين كلمة المرور.
- Excel Import/Export.
- المستودع والفواتير والمراحل المالية.
- Dashboard والتقارير النهائية.
- Audit Log وClient error reporting والنسخ الاحتياطي ومراجعة إعدادات Production.
- اختبارات متصفح آلية للرحلات الرئيسية واختبار 10,000 صف وشبكة الشركة.

## حالة التنظيم

- Phase 8.1–8.7: فصل الصفحة، التحقق، History، Structure، Lifecycle، Interactions، رحلة الحفظ، وDirty State — مكتملة ومختبرة.
- Phase 8.8-R1: فصل استعلامات القراءة — مكتملة ومختبرة.
- Phase 8.8-R2A: شبكة أمان SQL Server — مكتملة ونجحت 6/6.
- Phase 8.8-R2: فصل Save Plan — مكتملة ونجحت الشبكة الموسعة 10/10.
- Phase 8.9: البناء، الاختبارات، فحص Git، والتنظيف وإنشاء ZIP نظيف — مكتملة ومقبولة.
- الـRefactor مغلق. لا توجد R3 أو R4 إضافية لـ`WorkOrderService` الآن، وأي Refactor جديد يحتاج ميزة أو مشكلة فعلية مثبتة.

## نتيجة إغلاق Phase 8.9

تم تشغيل Workflow الإغلاق على جهاز التطوير وكانت النتيجة:

- Release Build: PASS.
- اختبارات الحفظ وقاعدة البيانات: 10/10 PASS على قاعدة SQL Server مؤقتة ومعزولة.
- Git source hygiene: PASS.
- إنشاء ZIP مصدر نظيف: 169 ملفًا بحجم 3.06 MB.
- لم تُستخدم قاعدة بيانات التشغيل الحقيقية.
- فحص JavaScript الاختياري تم تجاوزه محليًا لعدم وجود Node.js، ثم اجتازت ملفات JavaScript الخاصة بالمشروع فحص Syntax مستقلًا؛ كما أن Phase 8.9 لم تغيّر أي JavaScript تشغيلي.

لإعادة التحقق مستقبلًا من داخل مجلد المشروع شغّل:

```powershell
.\Tools\Invoke-Phase8Closure.ps1
```

الأمر يقوم بالآتي:

1. يحذف نواتج البناء وملفات الجهاز المحلية.
2. يبني التطبيق ومشروع الاختبارات بوضع Release.
3. يفحص Syntax لملفات JavaScript إذا كان Node.js متاحًا.
4. يشغّل اختبارات الحفظ العشرة على قاعدة مؤقتة.
5. ينشئ ZIP مصدر نظيفًا يستبعد `bin/obj/.vs` والبinaries.

النتيجة المسجلة والمطلوبة عند أي إعادة تشغيل:

```text
Phase 8.9 automated verification: PASS
Phase 8.9 closure workflow: PASS
```

لأن Phase 8.9 لم تغيّر كود التشغيل، لم تكن هناك حاجة إلى جولة شيت يدوية جديدة بعد نجاح الأمر.

## ما بعد Phase 8

الترتيب المقترح للميزات:

1. صلاحيات وتجربة BranchManager وProjectManager.
2. إدارة حسابات الفرع.
3. Excel Import/Export.
4. المستودع وربط المواد بأوامر العمل.
5. الفواتير والمراحل المالية.
6. Dashboard والتقارير بعد وجود بيانات فعلية من الموديولات.

## قاعدة تسليم الملفات

- تعديل بسيط في ملف واحد: تعليمات مباشرة.
- تعديل كبير أو حساس: ZIP Patch.
- نقطة مراجعة كبيرة: يجوز تسليم نسخة مصدر كاملة نظيفة.
- لا تُرسل ملفات `bin` أو `obj` أو `.vs` أو `*.user` أو ملفات تنفيذ ومكتبات مبنية.
- استخدم `Tools/New-CleanProjectArchive.ps1` عند تجهيز المشروع للرفع.
