# Change Summary — Phase 9.2D3

**Date:** 2026-08-04  
**Scope:** Work Orders grid zoom stability and vertical navigation

## المشكلة

ظهر اهتزاز بصري داخل الشيت عند Browser Zoom غير 100%، وخصوصًا قرب 90%. الاختبار اليدوي أثبت أن `Ctrl + 0` يزيل الاهتزاز، لذلك المشكلة ليست في قاعدة البيانات أو عدد صفوف DOM، بل في تفاعل Virtual DOM ومواضع Scroll الكسرية مع مسار التصحيح المخصص.

## السبب الهندسي المستهدف

كان ارتفاع الصف الاسمي `34px` يتحول عند Zoom كسري إلى عدد غير صحيح من Physical Pixels. في الوقت نفسه كان ArrowUp correction القديم:

- يعمل حتى ثلاث Animation Frames.
- يكتب إلى `scrollTop` أكثر من مرة.
- يستخدم `Math.ceil` على فرق قد يكون كسريًا.

هذا يسمح لـTabulator والكود المخصص بتصحيح الموضع بالتبادل، فتظهر حركة صغيرة للأمام والخلف.

## التنفيذ النهائي

### Zoom-stable fixed row height

أصبح Tabulator يستقبل `rowHeight` صريحًا. يتم اشتقاقه من ارتفاع اسمي `34px` بهذه الفكرة:

```text
Physical row height = round(34 × devicePixelRatio)
CSS row height = Physical row height ÷ devicePixelRatio
```

النتيجة أن حدود الصف تقع على Physical Pixels صحيحة عند Zoom ومستويات Windows scaling المختلفة.

أمثلة تقريبية:

| devicePixelRatio | CSS row height | Physical pixels |
|---:|---:|---:|
| 0.70 | 34.2857px | 24px |
| 0.80 | 33.75px | 27px |
| 0.90 | 34.4444px | 31px |
| 1.00 | 34px | 34px |
| 1.10 | 33.6364px | 37px |
| 1.25 | 34.4px | 43px |
| 1.50 | 34px | 51px |

### Resize/Zoom lifecycle

عند تغير حجم النافذة أو Browser Zoom:

1. يُحفظ Logical row anchor الحالي.
2. يُعاد حساب Zoom-stable row height.
3. تُحدّث قيمة `table.options.rowHeight`.
4. `setHeight` يعيد بناء Virtual DOM بالقيمة الجديدة.
5. يُستعاد Logical row anchor الحالي.

لا يحدث هذا أثناء التنقل العادي.

### ArrowUp correction cleanup

- أصبح التصحيح Single-Flight.
- يعمل مرة واحدة في Animation Frame التالية.
- يقرأ أحدث Active Range بعد أن يعالج Tabulator الضغطة.
- يتجاهل فروق Sub-pixel وأي فرق أقل من نصف ارتفاع صف.
- يحاذي Target scrollTop إلى Physical Pixel.
- أزيل `arrowUpCorrectionFramesRemaining` بالكامل.

## أثر الحجم والتعقيد

التعديل يستبدل مسار التصحيح المتكرر بمسار واحد، ولا يضيف Listener أو Timer. تمت إضافة وظيفة مركزية واحدة لحساب Row Metrics، ويستخدمها التهيئة ومسار Resize نفسه.

## التحقق المحلي داخل بيئة إعداد الـPatch

- `node --check` نجح للملفات JavaScript الثلاثة.
- اختبار حساب Physical Pixel alignment نجح عند DPR: `0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2`.
- اختبار المحاكاة أكد أن فرق 1px لا يكتب Scroll، بينما فرق صف كامل يكتب مرة واحدة إلى قيمة Physical-Pixel aligned.
- لم يتوفر .NET SDK أو متصفح Playwright في بيئة إعداد الـPatch، لذلك Build وStress وZoom Matrix يجب تنفيذهم على جهاز المشروع قبل الاعتماد.

## حالة المرحلة

Phase 9.2D3 لا تُغلق قبل:

- Stress PASS.
- نجاح Zoom Matrix في متصفح ظاهر.
- مراجعة تقرير أداء جديد عند 90% و100% للتأكد من عدم وجود Regression.
