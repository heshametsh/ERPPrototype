# Phase 9.2D3 — Zoom-Stable Grid Navigation

## الهدف

إزالة الاهتزاز البصري داخل شيت أوامر العمل عند استخدام Browser Zoom مختلف عن 100%، مع الحفاظ على إصلاح ArrowUp القديم بدون إنشاء مسارات تصحيح متنافسة.

## الدليل الذي بُني عليه التعديل

- عند Zoom يقارب 90% كان `devicePixelRatio` يقارب `0.9` وكان `scrollTop` كسريًا، وظهر اهتزاز بصري أثناء التنقل.
- بعد `Ctrl + 0` أصبح `devicePixelRatio = 1` واختفى الاهتزاز بصريًا.
- الكود السابق كان يشغّل ArrowUp correction لمدة ثلاث Animation Frames ويستخدم `Math.ceil(hiddenPixels)`، ما يسمح بأكثر من كتابة Scroll لنفس الحركة مع تقريب زائد عند Zoom كسري.

## الملفات المعدلة

1. `wwwroot/js/tabulatorTest.js`
2. `wwwroot/js/tabulatorInteractions.js`
3. `wwwroot/js/tabulatorLifecycle.js`
4. `Components/Pages/WorkOrders.razor.css`
5. `Documentation/35_CHANGE_SUMMARY_2026-08-04_PHASE9_2D3.md`

## التعديل الوظيفي

- أصبح للشيت `rowHeight` ثابت معروف لـTabulator بدل الاعتماد على قياس CSS فقط.
- يتم تحويل ارتفاع الصف الاسمي `34px` إلى أقرب ارتفاع CSS يساوي عددًا صحيحًا من Physical Pixels حسب `devicePixelRatio`.
- يعاد حساب الارتفاع فقط عند تهيئة الشيت أو Resize/Browser Zoom، وليس أثناء كل ضغطة زر.
- ArrowUp correction أصبح Single-Flight بكتابة Scroll واحدة فقط.
- أُلغي مسار الثلاث Frames وأُلغي `Math.ceil`.
- لا يحدث التصحيح إلا إذا كانت الخلية مخفية بأكثر من نصف ارتفاع صف، حتى لا نتعامل مع فروق Sub-pixel الطبيعية كخطأ.
- قيمة Scroll التصحيحية نفسها تُحاذى مع Physical Pixel.

## ما لم يتغير

- لا تغيير في قواعد الأعمال.
- لا تغيير في الحفظ أو SQL Server أو EF Core.
- لا تغيير في الأعمدة أو الفلاتر أو الصلاحيات.
- لا تغيير في Copy/Paste أو Undo/Redo.
- لا إضافة Listener جديد.
- لا إضافة Timer جديد.

## التثبيت

استخرج محتويات ZIP في مجلد الحل الذي يحتوي على مجلد `ERPPrototype`، ووافق على استبدال الملفات.

مثال المسار:

```text
C:\Users\SinDbaD\source\repos\ERPPrototype
```

## التحقق المطلوب قبل اعتماد المرحلة

### 1. Build وStress

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

### 2. Zoom Matrix يدوي في متصفح ظاهر

اختبر المستويات التالية:

```text
70%، 80%، 90%، 100%، 110%، 125%، 150%
```

في كل مستوى:

- ArrowDown لمسافة طويلة.
- ArrowUp لمسافة طويلة.
- Enter لمسافة طويلة.
- Wheel في المنتصف وقرب نهاية الشيت.
- التوقف عند حدود Virtual DOM ثم عكس الاتجاه.

شرط النجاح:

- لا يوجد اهتزاز أو حركة عكسية صغيرة.
- الخلية النشطة تظل ظاهرة بالكامل.
- لا يختفي إطار التحديد.
- لا يقفز الشيت إلى صف بعيد.

## Rollback

الرجوع يتطلب استعادة النسخ السابقة من الملفات الأربعة البرمجية المذكورة أعلاه فقط.
