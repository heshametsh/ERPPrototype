# Phase 9.2A7 — Vertical Basket Summary + Prominent Search

**Status:** Candidate — لا يتم عمل Commit أو Tag قبل نجاح الاختبارات وقبول الشكل بصريًا.

## Base

يُركّب فوق النسخة الحالية التي نجحت عليها Phase 9.2A6، وتشمل إصلاح مزامنة ارتفاع الشيت وشريط `Selected` المنفصل.

## هدف الخطوة

إلغاء الشكل المرئي القائم على الكروت، وتحويل ملخص الـBasket إلى قوائم رأسية عملية تشبه جدولًا مختصرًا، مع تثبيت بحث أمر العمل كعنصر مستقل وواضح في أقصى يمين منطقة الأوامر.

## التغيير المرئي

### Basket Summary

على الشاشات الواسعة، تظهر ثلاث قوائم رأسية متجاورة. توزيع الـ13 Basket يكون متوازنًا `5 + 4 + 4` لتقليل الارتفاع والمحافظة على مساحة الشيت.

كل قائمة تحتوي صف عناوين ثابت:

- `Basket`
- `Orders`
- `Remaining Amount`

وكل Basket يظهر كسطر واحد، بدون Card منفصلة وبدون خلفيات داخلية للأرقام. السلال التي قيمتها صفر تظل ظاهرة بلون أهدأ.

على الشاشات المتوسطة تتحول القوائم إلى عمودين، وعلى الشاشات الصغيرة إلى قائمة واحدة.

### Work Order Search

بحث أمر العمل يظل أعلى الصفحة، لكنه أصبح:

- في أقصى اليمين تحت أزرار الأوامر.
- مستقلًا عن رسالة حالة الحفظ.
- أعرض وأكثر وضوحًا.
- محتفظًا بنفس `data-testid` ونفس منطق البحث الحالي.

## ما لم يتغير

- حساب أعداد الـBasket.
- حساب `Remaining Amount`.
- تحديث Dashboard مع Edit / Paste / Undo / Redo / Save.
- الفلاتر والترتيب.
- ملخص الهيدر.
- شريط `Selected` ومكانه المنفصل أسفل الشيت.
- قاعدة البيانات أو الـMigrations.

## الملفات المعدلة

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/js/tabulatorBasketDashboard.js`
- `wwwroot/app.css`

## فحوص ثابتة تم تنفيذها

- `node --check` لملف `tabulatorBasketDashboard.js`: PASS.
- فحص توزيع 13 Basket إلى `5,4,4`: PASS.
- فحص توازن أقواس CSS: PASS.
- تأكيد بقاء `data-testid="work-orders-search"`: PASS.

لم يتم تشغيل .NET أو SQL Server أو Playwright داخل بيئة إعداد الحزمة.

## التركيب

فك محتويات ZIP مباشرة داخل المجلد الذي يحتوي على `ERPPrototype.csproj`، ووافق على استبدال الملفات.

لا تشغّل `Update-Database`.

## الاختبار

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المتوقعة:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

## فحص بصري مطلوب

- بحث أمر العمل ظاهر بمفرده في أقصى اليمين.
- كل الـ13 Basket ظاهرة.
- كل سطر يوضح اسم السلة والعدد والقيمة المتبقية تحت عناوين واضحة.
- لا يوجد شكل Cards منفصلة.
- الشيت ما زال يحصل على مساحة مناسبة.
- شريط `Selected` ظاهر أسفل الشيت ولا يغطي آخر خلية.

## Rollback

قبل الـCommit، يمكن الرجوع باستعادة الملفات الأربعة من آخر Commit مستقر:

```powershell
git restore -- Components/Pages/WorkOrders.razor Components/Pages/WorkOrders.razor.css wwwroot/js/tabulatorBasketDashboard.js wwwroot/app.css
```
