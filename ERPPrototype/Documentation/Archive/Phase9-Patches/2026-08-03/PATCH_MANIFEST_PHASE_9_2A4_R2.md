# Phase 9.2A4-R2 — Dashboard Layout Sync

## الأساس

هذا التصحيح مبني مباشرة على المشروع الكامل `ERPPrototype(25).zip` الذي أرسله المستخدم، وليس على افتراضات من Patch سابق.

## المشكلة المؤكدة

صفحة أوامر العمل تقفل تمرير المتصفح على أجهزة سطح المكتب وتجعل التمرير داخل Tabulator فقط.

عند إنشاء Tabulator أول مرة، كان ارتفاع الشيت يُحسب بينما Dashboard الـBasket ما زال يعرض سطر `Calculating Basket totals...` القصير. بعد ذلك يستبدل JavaScript هذا السطر بشبكة Basket من صفين، فينخفض موضع الشيت لأسفل، لكن ارتفاعه القديم يظل كما هو.

النتيجة:

- صف `Selected totals` موجود فعلًا داخل `work-orders-grid-shell`.
- لكن نهاية الـShell تصبح أسفل حدود الشاشة.
- وبما أن تمرير الصفحة مقفول، لا يستطيع المستخدم الوصول إلى الشريط.

لذلك تعديل CSS وحده لم يكن كافيًا.

## التصحيح

### `wwwroot/js/tabulatorLifecycle.js`

أضيفت دورة مزامنة Layout مركزية:

- تنتظر إطارَي رسم بعد اكتمال Dashboard.
- تقيس الموضع الحقيقي الجديد للشيت.
- تعيد حساب ارتفاع Tabulator والـShell من المساحة المتبقية في الشاشة.
- تحفظ موضع الصف الحالي وتعيد تثبيته إذا تغير الارتفاع.
- لا تنفذ `setHeight` عندما يكون الارتفاع صحيحًا بالفعل.
- تُلغى أي Animation Frame معلقة عند Destroy أو تغيير السنة.

### `wwwroot/js/tabulatorBasketDashboard.js`

بعد رسم بطاقات الـBasket واكتمال حجمها الحقيقي، يطلب Dashboard مزامنة Layout بدل ترك الشيت على القياس الذي أُخذ من Loading Placeholder.

## ما لم يتغير

- حسابات Dashboard.
- بيانات الـBasket.
- إجماليات Selected.
- تصميم البطاقات.
- الفلاتر والترتيب.
- الحفظ وUndo/Redo.
- قاعدة البيانات أو Migrations.

## التركيب

فك محتويات الـZIP داخل المجلد الذي يحتوي على `ERPPrototype.csproj`، ووافق على استبدال الملفين.

لا تشغّل `Update-Database`.

## الاختبار

شغّل:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

ثم اختبر بصريًا:

1. حدد خلية أو نطاقًا.
2. يجب أن يظهر `Selected totals` تحت الشيت وداخل الشاشة.
3. انزل بالأسهم إلى آخر صف ظاهر.
4. يجب ألا يغطي الشريط الخلية الأخيرة.
5. غيّر Basket أو مبلغًا ثم Undo/Redo؛ يجب ألا يتحرك موضع الشيت فجأة.

## الفحوص المنفذة هنا

- `node --check` للملفين المعدلين: PASS.
- Harness يحاكي انتقال Dashboard من Placeholder قصير إلى صفين ويثبت إعادة حساب ارتفاع الشيت والـShell: PASS.
- لا يتوفر .NET أو SQL Server في بيئة الإنشاء، لذلك Build وPlaywright يعتمدان على نتيجة جهاز المستخدم.

## الرجوع

استرجع الملفين من آخر Commit مستقر، أو نفّذ:

```powershell
git restore -- wwwroot/js/tabulatorLifecycle.js wwwroot/js/tabulatorBasketDashboard.js
```
