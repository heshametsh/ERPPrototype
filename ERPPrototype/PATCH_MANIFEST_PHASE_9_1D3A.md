# Phase 9.1D3A — Status Excel-Style Value Filter Pilot

**الحالة:** Candidate — يحتاج Build وIntegration وBrowser Stress على جهاز المستخدم  
**القاعدة المطلوبة:** النسخة المقبولة بعد Phase 9.1D2-R1  
**لا توجد Migration أو Backfill.**

## لماذا هذه الخطوة مختلفة قليلًا عن الخطة الأولية؟

مراجعة الكود أثبتت أن عمودي `Work Type` و`Basket` يحتويان بالفعل على فلتر قيم شبيه بـExcel، كما أن قائمة كل واحد منهما تُبنى بعد تطبيق فلاتر الأعمدة الأخرى. لذلك لم نكرر كودًا يعمل بالفعل.

هذه الخطوة تضيف نفس السلوك إلى أول عمود ناقص فعليًا: `Status`، وتستخدمه لاختبار الترابط في الاتجاهين مع `Work Type`.

## السلوك المضاف

- يظهر رمز فلتر في عمود `Status`.
- الفلتر يعرض القيم الموجودة فعلًا في الشيت، وليس مربع كتابة شرط.
- يدعم البحث داخل القيم، `Select All`، اختيار قيمة أو عدة قيم، و`Clear Filter`.
- يدعم قيمة `(Blank)` للصفوف التي لا تحتوي Status.
- عند فلترة `Status` تتحدث قيم فلتر `Work Type` وفق الصفوف المتبقية.
- عند فلترة `Work Type` تتحدث قيم فلتر `Status` وفق الصفوف المتبقية.
- ملخص أوامر العمل المفتوحة في الهيدر لا يتغير بسبب الفلتر.
- الأعمدة المالية تظل ترتيبًا رقميًا فقط بدون فلتر.
- شريط `Selected` لا يتغير.

## بيانات اختبار المتصفح

قاعدة E2E المؤقتة توزع Status على أربع حالات متساوية:

- `تحت التنفيذ`
- `مراجعة`
- `متوقف`
- قيمة فارغة

هذا التغيير يخص قاعدة الاختبار المؤقتة فقط، ولا يغير بيانات التطوير أو الإنتاج.

## الملفات المعدلة

- `wwwroot/js/tabulatorFilters.js`
- `wwwroot/js/tabulatorTest.js`
- `wwwroot/js/tabulatorLifecycle.js`
- `wwwroot/js/tabulatorClipboardHistory.js`
- `ERPPrototype.E2ETests/E2ETestDatabase.cs`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`
- `Tools/Invoke-ERPTests.ps1`

## التركيب

فك محتويات ZIP داخل المجلد الذي يحتوي على `ERPPrototype.csproj`، ووافق على استبدال الملفات.

لا تشغّل `Update-Database`.

## الاختبار الآلي

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المطلوبة:

```text
Integration tests: 17/17 PASS
Browser checks: 50/50 PASS (Stress)
ERPPrototype automated verification: PASS
```

## المراقبة اليدوية المطلوبة

1. افتح فلتر `Status` وتأكد من ظهور القيم الثلاث و`(Blank)`.
2. اختر `تحت التنفيذ`؛ يجب أن يظهر ربع بيانات الاختبار.
3. افتح فلتر `Work Type` أثناء ذلك؛ يجب أن يعرض `401` فقط.
4. امسح فلتر Status، ثم اختر `401` من Work Type؛ فلتر Status يجب أن يعرض `تحت التنفيذ` فقط.
5. اختر `(Blank)` وتأكد أن الصفوف ذات Status الفارغ فقط تظهر.
6. تأكد أن إجماليات الهيدر المفتوحة لم تتغير وأن شريط Selected ما زال يعمل.

## التحقق الثابت المنفذ هنا

- JavaScript syntax: PASS لكل ملفات المشروع.
- Value-filter logic harness: PASS للترابط في الاتجاهين وفلترة Blank.
- C# lexical balance: PASS للملفات المعدلة.
- Project XML parse: PASS.
- `git diff --check`: PASS.

لم يتم تشغيل .NET Build أو SQL Server أو Playwright داخل بيئة إعداد الحزمة.

## ما تبقى بعد نجاح الخطوة

Phase 9.1D3B يعمم نفس السياسة تدريجيًا على الأعمدة المتبقية. عمودا `Work Order Number` و`Notes` يحتاجان معالجة أداء خاصة لأنهما قد يحتويان آلاف القيم المختلفة؛ لن نضع آلاف Checkboxes في الـDOM بدون قياس أو Virtual List.
