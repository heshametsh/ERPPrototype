# Phase 9.2A8 — Excel-Like Basket Tables + Sheet-Local Search

**الحالة:** Candidate — لا تعمل Commit أو Tag قبل نجاح الاختبارات وقبول الشكل بصريًا.

## نقطة البداية

الحزمة **تراكمية** وتشمل شكل Phase 9.2A7 المطلوب، لذلك يمكن تركيبها فوق النسخة الحالية بعد Phase 9.2A6 أو فوق A7 إن كانت مُركبة بالفعل. لا تحتاج تركيب A7 منفصلًا.

## الهدف

تحويل ملخص الـBasket من كروت أو قوائم صغيرة إلى جدولين رأسيين واضحين قريبين من شكل Excel، مع جعل بحث أمر العمل ظاهرًا مباشرة فوق الشيت بدل وجوده أعلى الصفحة وسط أدوات الحفظ.

## شكل Basket الجديد

على شاشة الكمبيوتر تظهر قائمتان متجاورتان بتوزيع `7 + 6`.

كل قائمة تحتوي عناوين عربية واضحة:

- `اسم السلة`
- `عدد أوامر العمل`
- `القيمة المتبقية`

كل Basket يظهر في صف واحد فقط، مع:

- خط عربي مألوف: `Tahoma` ثم `Segoe UI`.
- اسم السلة بحجم أكبر وخط واضح.
- محاذاة أرقام موحدة تحت بعضها.
- صفوف متبادلة أبيض وأزرق فاتح مثل Excel.
- ظهور السلال ذات القيم الصفرية بوضوح دون إخفائها أو جعلها باهتة جدًا.
- عدم وجود Cards أو ظلال أو مستطيلات داخلية منفصلة.

على الشاشات الأضيق من `1120px` تتحول القائمتان إلى قائمة واحدة تحت الأخرى حتى لا تضيق الأعمدة.

## بحث أمر العمل

تم نقل البحث إلى شريط مستقل مباشرة فوق الشيت:

```text
[ ملخص السلال ]
[                    بحث أمر العمل | اكتب رقم أمر العمل... ]
[ الشيت ]
[ Selected totals ]
```

البحث:

- ظاهر في أقصى اليمين.
- أعرض وأسهل في الوصول.
- يحتفظ بنفس `data-testid` ونفس منطق البحث الحالي.
- يظل ظاهرًا أثناء التمرير داخل Tabulator لأن التمرير داخل الشيت نفسه.

## ما لم يتغير

- حساب أعداد الـBasket.
- حساب `Remaining Amount`.
- تحديث الـDashboard مع Edit / Paste / Undo / Redo / Save.
- البحث نفسه ونتائجه.
- الفلاتر والترتيب والحفظ.
- ملخص الهيدر.
- شريط `Selected` المنفصل أسفل الشيت.
- قاعدة البيانات والـMigrations.

## الملفات المعدلة

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/js/tabulatorBasketDashboard.js`
- `wwwroot/app.css`

## فحوص ثابتة تم تنفيذها

- `node --check` لملف `tabulatorBasketDashboard.js`: PASS.
- توازن أقواس CSS في الملفين: PASS.
- وجود عنصر بحث واحد فقط بنفس `data-testid`: PASS.
- توزيع 13 Basket إلى `7 + 6`: PASS.
- وجود العناوين العربية الثلاثة: PASS.

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

## الفحص البصري المطلوب

- السلال ظاهرة كصفوف جدول وليست Cards.
- الخط العربي واضح ويمكن قراءته بدون تكبير المتصفح.
- عناوين العدد والقيمة تمنع أي التباس بين الرقمين.
- بحث أمر العمل موجود مباشرة فوق الشيت ناحية اليمين.
- الشيت وشريط `Selected` ظاهران ولا يوجد تداخل مع آخر خلية.

## Rollback قبل Commit

```powershell
git restore -- Components/Pages/WorkOrders.razor Components/Pages/WorkOrders.razor.css wwwroot/js/tabulatorBasketDashboard.js wwwroot/app.css
```
