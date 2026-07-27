# 06 — Regression Test Checklist

**Status:** Mandatory after any grid/runtime change  
**Stable checkpoint:** E6E (E6C foundation)  
**Rule:** لا ننتقل للخطوة التالية إذا فشل اختبار أساسي.

## A. Before Testing

- [ ] المشروع عاد إلى Git checkpoint معروف.
- [ ] `Clean Solution` ثم `Rebuild Solution` نجحا.
- [ ] لا توجد Compiler errors.
- [ ] افتح Developer Tools > Console.
- [ ] استخدم بيانات تجريبية فقط.
- [ ] سجل اسم النسخة/الـcommit والتاريخ.

## B. Login and Access

- [ ] Admin يستطيع تسجيل الدخول.
- [ ] Employee يستطيع تسجيل الدخول.
- [ ] الحساب غير النشط يُرفض.
- [ ] المستخدم الجديد يُجبر على تغيير كلمة المرور.
- [ ] Employee لا يفتح `/admin`.
- [ ] Admin لا يدخل شيت Employee بالخطأ.
- [ ] لا توجد صفحة تسجيل عام.

## C. Grid Smoke Test — بعد كل تعديل JavaScript

- [ ] افتح `/work-orders`.
- [ ] الصفوف تُحمّل وعددها صحيح.
- [ ] ArrowUp يعمل.
- [ ] ArrowDown يعمل.
- [ ] ArrowLeft يعمل.
- [ ] ArrowRight يعمل.
- [ ] الكتابة المباشرة تعدل الخلية.
- [ ] Double-click يفتح المحرر.
- [ ] Enter داخل المحرر يحفظ القيمة بدون سلوك غير متوقع.
- [ ] الضغط المستمر على Enter خارج المحرر يظل سريعًا بعد الصف 1,040 وحتى الصفوف العميقة.
- [ ] Basket list تعمل.
- [ ] أول كليك يمين قبل أي كليك شمال يفتح القائمة بدون `activeRange.occupies` error.
- [ ] لا يوجد Red Console error.

## D. Selection and Clipboard

- [ ] تحديد خلية واحدة.
- [ ] تحديد نطاق متعدد الصفوف والأعمدة.
- [ ] Copy إلى Excel يعطي القيم الصحيحة.
- [ ] Paste من Excel يبدأ من الخلية المحددة.
- [ ] Paste متعدد الخلايا يمكن التراجع عنه مرة واحدة.
- [ ] Delete/Backspace يمسح النطاق.
- [ ] Undo يعيد النطاق.
- [ ] Redo يعيد المسح.

## E. Rows and History

- [ ] Insert one above.
- [ ] Insert one below.
- [ ] Insert multiple rows.
- [ ] التحديد داخل خلية يكفي؛ لا يشترط الضغط على رقم الصف.
- [ ] Delete one row.
- [ ] Delete multiple selected rows.
- [ ] Cancel deletion leaves rows unchanged.
- [ ] Undo/Redo insert.
- [ ] Undo/Redo delete.
- [ ] الصف الجديد لا يكرر Temporary Id بطريقة تكسر الحفظ.

## F. Validation

- [ ] WO Number أقل/أكثر من 9 أرقام يُرفض.
- [ ] Work Type أقل/أكثر من 3 أرقام يُرفض.
- [ ] Arabic digits تتحول بصورة صحيحة.
- [ ] Invalid date يظهر خطأ.
- [ ] Basket خارج القائمة يُرفض.
- [ ] Notes أكبر من الحد تُرفض.
- [ ] Duplicate pair يظهر خطأ واضح.
- [ ] Previous/Next validation ينتقلان للخلية الصحيحة.

## G. Save

- [ ] حفظ صف جديد.
- [ ] حفظ تعديل.
- [ ] حفظ حذف.
- [ ] حفظ الثلاثة معًا.
- [ ] لا تغييرات يعرض رسالة مناسبة.
- [ ] بعد الحفظ لا يبقى الصف Dirty.
- [ ] Temporary Id يستبدل Database Id بدون صف مكرر.
- [ ] RowVersion يتحدث.
- [ ] Conflict بين جلستين يُمنع ولا يكتب فوق بيانات أحدث.
- [ ] Duplicate race تمنعه قاعدة البيانات.

## H. Year

- [ ] تغيير السنة بدون تعديلات يعمل.
- [ ] تغيير السنة مع تعديلات غير محفوظة يُمنع.
- [ ] بعد الحفظ يمكن تغيير السنة.
- [ ] الرجوع للسنة الأصلية يعرض البيانات الصحيحة.
- [ ] Assignment Date بسنة أخرى يطبق السلوك الحالي ويظهر الرسالة.
- [ ] لا تتكرر listeners بعد عدة تغييرات سنة.

## I. Resize and Viewport

- [ ] اذهب إلى صف عميق مثل 1,500 أو 2,500.
- [ ] سجل أول صف ظاهر.
- [ ] صغر النافذة.
- [ ] كبر النافذة.
- [ ] أول صف ظاهر يبقى نفسه أو أقرب فرق بصري مقبول لا يتراكم.
- [ ] التحديد يظل مرئيًا.
- [ ] الأسهم الأربعة تظل تعمل.
- [ ] لا يقفز الشيت لأول صف.

## J. Performance

### 3,000 rows

- [ ] سجل Initial load time.
- [ ] سجل Tabulator ready time من Console.
- [ ] اختبر البحث.
- [ ] اختبر الفلاتر.
- [ ] اختبر تعديل وحفظ.
- [ ] اختبر ArrowDown من أول الشيت لآخره.
- [ ] اختبر ArrowUp للعودة.
- [ ] اترك الصفحة مفتوحة ثم أعد الاختبار.
- [ ] راقب Memory وLong Tasks.

### 10,000 rows

- [ ] كرر الاختبارات على بيانات تجريبية.
- [ ] لا تعتمد النتيجة لمجرد أن الصفحة فتحت.
- [ ] سجل الأرقام وقارنها بـ3,000 صف.
- [ ] إذا فشل، افتح قرار server-side/progressive loading قبل إضافة ميزات أخرى.

## K. Reconnection and Azure

- [ ] افصل الشبكة لثوانٍ.
- [ ] Reconnect modal يظهر.
- [ ] الاتصال يعود.
- [ ] لا تضيع تغييرات غير محفوظة بدون تحذير.
- [ ] Azure App Service يبدأ بدون 500.30.
- [ ] سجلات startup وSQL واضحة.
- [ ] Connection String يأتي من Azure settings.
- [ ] اختبار من شبكة الشركة وأجهزتها.

## L. Latest Manual Evidence — 2026-07-27

- Clean/Rebuild: PASS حسب اختبار المستخدم.
- المشروع يعمل محليًا: PASS.
- Enter sustained navigation: PASS.
- First right-click range guard: PASS.
- Connected smoke/regression checks reported by the user: PASS.
- Automated browser tests: غير موجودة حتى الآن.

## M. Result Record

بعد الاختبار اكتب:

```text
Version/Commit:
Date:
Tester:
Rows:
Passed:
Failed:
Console errors:
Performance numbers:
Decision: Accept / Roll back / Investigate
```

## Simple Example

بعد تعديل Resize لا يكفي أن نجرب التصغير فقط.  
لأن Resize يشترك مع Lifecycle والتحديد، نختبر أيضًا الأسهم وتغيير السنة. مثل تغيير باب السيارة: يجب التأكد أن الزجاج والقفل ما زالا يعملان، وليس أن الباب يغلق فقط.
