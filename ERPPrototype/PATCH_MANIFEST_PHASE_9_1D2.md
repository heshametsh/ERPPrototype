# Phase 9.1D2 — Financial Sort Only + Header Polish

**Status:** Candidate — لا يتم إنشاء Commit أو Tag قبل نجاح الاختبارات.

**Base required:** النسخة الحالية بعد نجاح `Phase 9.1D1` وإصلاح اختيار Basket في اختبار المتصفح.

## نطاق هذه الخطوة فقط

هذه الحزمة تنفذ تعديلين محدودين:

1. إزالة الفلاتر من أعمدة المبالغ الثلاثة مع الإبقاء على الترتيب الرقمي فقط.
2. تحسين شكل ملخص أوامر العمل المفتوحة الموجود أعلى الشيت.

لا تنفذ هذه الحزمة فلتر Excel الجديد لباقي الأعمدة؛ ذلك سيكون في `Phase 9.1D3` بعد قبول هذه الخطوة.

## أعمدة المبالغ

الأعمدة التالية تصبح Sort فقط بدون Filter:

- `Work Order Value`
- `Partial Amount`
- `Remaining Amount`

السلوك:

- الضغط على أيقونة الترتيب يرتب رقميًا تصاعديًا أو تنازليًا.
- أمر العمل يتحرك كصف كامل.
- يظل الترتيب بعمود واحد فقط.
- لا تظهر أيقونة فلتر في الأعمدة المالية.
- ملخص الصفوف المحددة أسفل الشيت يظل كما هو بأربع قيم.

## تحسين ملخص الهيدر

ملخص الأوامر المفتوحة ما زال يعرض:

- `Open Work Orders`
- `Open Work Order Value`
- `Open Partial Amount`
- `Open Remaining Amount`

التحسين بصري فقط:

- كل رقم داخل بطاقة مستقلة.
- اسم الإجمالي أعلى الرقم بدل التصاقهما في سطر واحد.
- الأرقام تستخدم محاذاة رقمية ثابتة وواضحة.
- عند تضييق الشاشة تتحول البطاقات إلى صفين ثم عمود واحد.

منطق الحساب لم يتغير: البحث والترتيب لا يغيران إجماليات الأوامر المفتوحة، بينما تغيير البيانات نفسها يحدثها.

## الملفات المعدلة

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/js/tabulatorTest.js`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`

ملف `WorkOrdersPage.cs` داخل الحزمة يحافظ على إصلاح اختيار Basket الذي نجح في `Phase 9.1D1`.

## التركيب

فك محتويات ZIP مباشرة داخل مجلد المشروع الداخلي الذي يحتوي على:

```text
ERPPrototype.csproj
```

وافق على استبدال الملفات.

لا توجد Migration ولا Backfill. لا تشغّل `Update-Database`.

## الاختبار

من مجلد الحل الخارجي شغّل:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المطلوبة:

```text
Integration tests: 17/17 PASS
Browser checks: 47/47 PASS (Stress)
ERPPrototype automated verification: PASS
```

اختبار المتصفح يتحقق من:

- عدم وجود Filter Button في الأعمدة المالية الثلاثة.
- وجود Sort Button في الأعمدة المالية الثلاثة.
- ترتيب `Work Order Value` تصاعديًا وتنازليًا.
- ترتيب `Partial Amount` رقميًا مع القيم الفارغة.
- ترتيب `Remaining Amount` رقميًا.
- استمرار الترتيب بعمود واحد وتحرك الصف كاملًا.
- استمرار إجماليات الهيدر وشريط التحديد والحفظ وباقي السيناريوهات.

## المراجعة البصرية المطلوبة

بعد فتح الشيت تأكد من:

- ظهور اسم كل إجمالي أعلى رقمه داخل بطاقة منفصلة.
- عدم التصاق النص بالرقم مثل `Open Work Orders3,972`.
- اختفاء رمز الفلتر من أعمدة المبالغ.
- بقاء سهم الترتيب ظاهرًا ويعمل.
- شريط `Selected` أسفل الشيت لم يتغير.

## الفحص المنفذ قبل التسليم

تم بنجاح:

- JavaScript syntax check لجميع ملفات JavaScript بالمشروع.
- `git diff --check`.
- التأكد الثابت من إزالة Financial Header Popups الثلاثة.
- التأكد من بقاء Numeric Sorters الثلاثة.
- عدد اختبارات Stress ما زال 47 Check.
- فحص بنية ملفات الحزمة وبصمات SHA-256.

لم يتم تشغيل Build أو SQL Server أو Playwright داخل بيئة إعداد الحزمة لعدم توفر .NET وSQL Server؛ الاعتماد النهائي يكون من نتيجة جهازك.

## الرجوع قبل Commit

إذا كانت `Phase 9.1D1` مثبتة في Commit نظيف، يمكن الرجوع عن ملفات هذه الخطوة بالأمر:

```powershell
git restore --source HEAD --staged --worktree -- `
  ERPPrototype/Components/Pages/WorkOrders.razor.css `
  ERPPrototype/wwwroot/js/tabulatorTest.js `
  ERPPrototype/ERPPrototype.E2ETests/WorkOrdersPage.cs `
  ERPPrototype/ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs `
  ERPPrototype/ERPPrototype.E2ETests/Phase9FoundationRunner.cs
```
