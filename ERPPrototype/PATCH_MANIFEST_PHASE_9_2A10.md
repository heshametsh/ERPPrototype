# Phase 9.2A10 — Active Baskets Compact Matrix

**الحالة:** Candidate — لا تعمل Commit أو Tag قبل نجاح الاختبارات وقبول الشكل بصريًا.

## نقطة البداية

تُركّب هذه الحزمة فوق **Phase 9.2A9** الحالية.

## قرار منطق العرض

ملخص السلال يعرض فقط الـBasket التي تحتوي حاليًا على أمر عمل واحد أو أكثر:

- Basket عددها `0` لا تظهر ولا تستهلك مساحة.
- عندما يدخل أول أمر عمل إلى Basket فارغة، تظهر فورًا.
- عندما يخرج آخر أمر عمل من Basket ويصبح عددها `0`، تختفي فورًا.
- البيانات الداخلية ما زالت تحتفظ بكل مراحل الـWorkflow؛ التغيير في العرض فقط.

## شكل الملخص

يظل الأسلوب شبيهًا بجدول Excel:

```text
اسم السلة | عدد أوامر العمل | القيمة المتبقية
```

لكن المسافات أصبحت أضيق:

- ارتفاع صف البيانات حوالي `19px`.
- ارتفاع رأس المجموعة حوالي `18px`.
- Padding أفقي `3px` فقط.
- فجوة `2px` فقط بين المجموعات والقيم.
- أرقام المبالغ تستخدم `tabular-nums` للمحاذاة الدقيقة.

## توزيع السلال النشطة

- من 1 إلى 5 سلال نشطة: تظهر في صف واحد.
- من 6 إلى 10 سلال نشطة: تتوزع تقريبًا على صفين.
- أكثر من ذلك: حد أقصى خمس مجموعات متجاورة.
- على الشاشات الصغيرة يعاد توزيع المجموعات تلقائيًا.

## ما لم يتغير

- حساب عدد أوامر العمل في كل Basket.
- حساب `Remaining Amount`.
- ترتيب مراحل الـWorkflow في البيانات.
- البحث والفلاتر والحفظ وUndo/Redo.
- ملخص الهيدر وشريط `Selected`.
- قاعدة البيانات والـMigrations.

## الملفات المعدلة

- `wwwroot/js/tabulatorBasketDashboard.js`
- `wwwroot/app.css`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/WorkOrdersPage.cs`

## الاختبارات المضافة أو المعدلة

اختبار المتصفح أصبح يتأكد من الآتي:

1. في بيانات الاختبار الأولية تظهر Basket `تحت التنفيذ` فقط.
2. Basket الفارغة لا تُرسم في الواجهة، مع بقاء قيمتها الصفرية في Snapshot الداخلي.
3. عند نقل أول أمر عمل إلى `انتهاء امر العمل` تظهر Basket الجديدة فورًا.
4. بعد Undo وخروج آخر أمر منها تختفي مرة أخرى.
5. لا يوجد تمرير أفقي، وصف الملخص يظل منخفض الارتفاع.

عدد اختبارات المتصفح المستهدف يظل **55/55**.

## فحوص ثابتة نُفذت قبل التسليم

- `node --check` لملف JavaScript: PASS.
- Harness يحاكي السلال النشطة والفارغة والاختفاء الكامل: PASS.
- توازن أقواس CSS: PASS.
- فحص أقواس ملفات C# المعدلة: PASS.
- لا تحتوي الحزمة على `bin` أو `obj` أو `.vs` أو `.git`: PASS.

لم يتم تشغيل .NET أو SQL Server أو Playwright داخل بيئة إعداد الحزمة.

## التركيب

فك محتويات ZIP مباشرة داخل المجلد الذي يحتوي على:

```text
ERPPrototype.csproj
```

ووافق على استبدال الملفات.

لا تشغّل `Update-Database`.

## الاختبار

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المطلوبة:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

## الفحص اليدوي

1. تأكد أن السلال الصفرية غير ظاهرة.
2. انقل أمر عمل إلى Basket غير ظاهرة؛ يجب أن تظهر فورًا.
3. استخدم Undo؛ إذا رجع عددها إلى صفر يجب أن تختفي.
4. تأكد أن المسافات بين الاسم والعدد والمبلغ قريبة من جدول Excel المصوّر.
5. تأكد أن الشيت يعرض صفوفًا أكثر من التصميم السابق.

## Rollback قبل Commit

```powershell
git restore -- wwwroot/js/tabulatorBasketDashboard.js wwwroot/app.css ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs ERPPrototype.E2ETests/WorkOrdersPage.cs
```
