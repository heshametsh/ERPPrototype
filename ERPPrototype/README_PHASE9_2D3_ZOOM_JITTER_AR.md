# Phase 9.2D3 — Minimal Zoom Jitter Candidate

## النطاق

هذا التعديل يستبدل ملف تشغيل واحد فقط:

`ERPPrototype/wwwroot/js/tabulatorTest.js`

ولا يغير:

- `rowHeight`
- إعدادات أو إعادة بناء الـVirtual DOM
- ارتفاع الشيت أو منطق الـResize
- قاعدة البيانات أو الحفظ
- كود Playwright أو Integration Tests
- Copy/Paste أو Undo/Redo

## سبب التعديل

تصحيح `ArrowUp` القديم كان يستخدم `Math.ceil(hiddenPixels)`. عند Zoom غير 100% تصبح قياسات الصف والـscroll كسورًا، فيمكن أن يتحرك الشيت أكثر من اللازم بجزء من البكسل، ثم يعيد Tabulator محاذاته إلى موضع الصف. هذا يظهر بصريًا كحركة عكسية صغيرة أو اهتزاز.

التعديل يحاذي مقدار التصحيح إلى شبكة الـPhysical Pixels باستخدام `devicePixelRatio`، مع التقريب لأسفل حتى لا يتجاوز مقدار الجزء المخفي مطلقًا.

## التحقق قبل التطبيق

Hash الملف المستقر قبل التعديل:

`A44D24C70523BA1037ACB74132D00EC6BC8831BEF719508DA69ABCB66475F764`

Hash الملف بعد التعديل:

`3065790FB0E3546D2019AACD43225F49A8B55D7682A98CC200300341985F33B0`

## التطبيق

فك محتويات ZIP داخل جذر الـRepository التالي:

`C:\Users\SinDbaD\source\repos\ERPPrototype`

المسار النهائي يجب أن يكون:

`C:\Users\SinDbaD\source\repos\ERPPrototype\ERPPrototype\wwwroot\js\tabulatorTest.js`

## التحقق المطلوب

1. تشغيل Stress Suite أولًا.
2. بعد نجاحه، اختبار ArrowDown وArrowUp يدويًا عند:
   `70%، 80%، 90%، 100%، 110%، 125%، 150%`.
3. الاختبار يكون من أول الشيت ووسطه ونهايته، وبالذات ArrowUp عند حدود الـVirtual DOM.
4. لا تُعاد إضافة Patch D3 السابق؛ هذا Candidate مستقل فوق نقطة الـRollback المستقرة.
