# Phase 9.1D3B — Remaining Linked Excel-Style Value Filters

**الحالة:** Candidate — يحتاج Build وIntegration وBrowser Stress على جهاز المستخدم
**القاعدة المطلوبة:** النسخة المقبولة بعد Phase 9.1D3A
**نوع الحزمة:** Incremental Patch فوق 9.1D3A، وليست نسخة مشروع كاملة
**لا توجد Migration أو Backfill.**

## الهدف

إكمال سياسة الأعمدة الحالية:

- كل عمود غير مالي يعرض فلتر قيم شبيهًا بـExcel بدون ترتيب.
- الأعمدة المالية الثلاثة تظل ترتيبًا رقميًا فقط بدون فلتر.
- قيم كل فلتر تُبنى بعد تطبيق فلاتر الأعمدة الأخرى.
- ملخص الأوامر المفتوحة في الهيدر وشريط `Selected` لا يتغيران.

## السلوك المضاف

### Work Order Number

- أضيفت أيقونة فلتر قيم.
- تعرض أرقام أوامر العمل الموجودة فعلًا في السنة الحالية.
- البحث داخل الفلتر يبحث في كل الأرقام، وليس العناصر الظاهرة في الشاشة فقط.
- اختيار رقم واحد يعزل أمر العمل المطابق.
- لا يوجد ترتيب على العمود؛ الأعمدة المالية وحدها هي أعمدة الترتيب الحالية.

### Notes

- أضيفت أيقونة فلتر قيم.
- تعرض الملاحظات الموجودة فعلًا، مع دعم `(Blank)` تلقائيًا عند وجود قيمة فارغة.
- يمكن اختيار ملاحظة أو عدة ملاحظات والبحث داخل القائمة.

### الترابط بين الفلاتر

مثال:

1. اختر رقم أمر عمل واحدًا.
2. افتح فلتر Notes.
3. تظهر ملاحظة أمر العمل المختار فقط.
4. امسح الفلتر واختر ملاحظة واحدة.
5. يعرض فلتر Work Order Number رقم الأمر المرتبط بها فقط.

نفس محرك الترابط يظل مستخدمًا مع `Work Type` و`Assignment Date` و`Basket` و`Status`.

## حماية الأداء للقوائم الكبيرة

عمودا Work Order Number وNotes قد يحتويان آلاف القيم المختلفة. إنشاء آلاف مربعات الاختيار داخل DOM عند فتح الفلتر يسبب بطئًا غير ضروري.

لذلك:

- عند تجاوز 250 قيمة، تستخدم القائمة Virtual List.
- تُنشأ عناصر الجزء المرئي فقط مع هامش صغير أعلى وأسفل.
- البحث والاختيار يظلان على جميع القيم.
- قوائم القيم الصغيرة مثل Work Type وStatus تظل تعمل بالطريقة البسيطة الحالية.
- مجموعات الفلاتر النشطة تُجهز مرة واحدة قبل فحص الصفوف، بدل إنشاء `Set` جديد لكل صف.

فحص ثابت محلي على 40,000 صف أكد:

- استخراج 40,000 رقم مختلف و40,000 ملاحظة مختلفة نجح.
- الترابط في الاتجاهين نجح.
- زمن استخراج القائمتين مع الفرز كان قرابة 424ms في بيئة إعداد الحزمة؛ فتح فلتر واحد ينفذ نصف هذا العمل تقريبًا، بينما DOM يحتفظ فقط بالجزء المرئي.

هذه نتيجة فحص ثابت وليست بديلًا عن اختبار الأداء على جهاز المستخدم.

## الأعمدة بعد هذه الخطوة

### فلتر قيم بدون ترتيب

- Work Order Number
- Work Type
- Assignment Date — يظل بفلتر التاريخ الهرمي الحالي
- Basket
- Status
- Notes

### ترتيب رقمي بدون فلتر

- Work Order Value
- Partial Amount
- Remaining Amount

## الملفات المعدلة

- `wwwroot/js/tabulatorFilters.js`
- `wwwroot/js/tabulatorTest.js`
- `wwwroot/js/tabulatorLifecycle.js`
- `wwwroot/js/tabulatorClipboardHistory.js`
- `wwwroot/app.css`
- `ERPPrototype.E2ETests/E2ETestDatabase.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `Tools/Invoke-ERPTests.ps1`

## التركيب

فك محتويات ZIP داخل المجلد الذي يحتوي على:

```text
ERPPrototype.csproj
```

ووافق على استبدال الملفات.

لا تشغّل `Update-Database`.

## الاختبار الآلي

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المطلوبة:

```text
Integration tests: 17/17 PASS
Browser checks: 53/53 PASS (Stress)
ERPPrototype automated verification: PASS
```

الاختبارات الجديدة تتأكد من:

- وجود فلتر بدون ترتيب في كل الأعمدة غير المالية.
- وجود 1,000 قيمة في Work Order Number وNotes داخل بيانات Stress.
- تفعيل Virtual List للقائمتين الكبيرتين.
- البحث عن آخر قيمة رغم أنها خارج الجزء المرئي الأول.
- ترابط Work Order Number مع Notes في الاتجاهين.
- استمرار اختبارات Status وWork Type وBlank والفلاتر الأخرى.

## المراقبة اليدوية المطلوبة

1. افتح فلتر Work Order Number؛ يجب أن يتحرك داخله التمرير بسلاسة.
2. ابحث عن رقم قرب نهاية الشيت؛ يجب أن يظهر فورًا.
3. اختر الرقم وافتح Notes؛ يجب أن تظهر ملاحظته فقط.
4. امسح الفلتر وكرر بالعكس من Notes إلى Work Order Number.
5. تأكد أن الأعمدة المالية ما زالت بلا فلتر.
6. تأكد أن الهيدر وشريط Selected لم يتغير شكلهما أو سلوكهما.

## الرجوع قبل التثبيت في Git

إذا فشل الاختبار أو لم يعجبك السلوك، ومن دون عمل Commit جديد:

```powershell
git restore --worktree --staged -- ERPPrototype
Remove-Item .\ERPPrototype\PATCH_MANIFEST_PHASE_9_1D3B.md -Force -ErrorAction SilentlyContinue
git status --short
```

## التحقق المنفذ داخل بيئة إعداد الحزمة

- JavaScript syntax لكل ملفات المشروع: PASS.
- منطق 40,000 صف والترابط في الاتجاهين: PASS.
- C# lexical balance للملفات المعدلة: PASS.
- Project XML parse: PASS.
- فحص بنية الحزمة والبصمات: PASS.

لم يتم تشغيل .NET Build أو SQL Server أو Playwright داخل بيئة إعداد الحزمة.
