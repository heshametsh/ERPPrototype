ERP Grid Finalists — Gate 2 Torture
===================================

الهدف
- ضغط RevoGrid 4.25.2 وUniver 0.25.1 بعد تصحيح أخطاء Gate 1.
- لا يغيّر Work Orders الحقيقية.

مهم
- ابدأ بـ 50,000 صف.
- لا تنتقل إلى 100,000 إلا إذا نجح المرشح وظيفيًا على 50,000.
- أي خطأ Selection/Paste/Undo/Redo/Readonly أو انهيار = Fail حتى لو الأداء سريع.

الرابط
http://localhost:5265/grid-shootout/finalists-gate2.html

ما الجديد عن Gate 1
- يعتبر G:G في Univer تحديد عمود Basket صحيحًا.
- RevoGrid RTL يتحقق من Basket بالعمود المرئي الصحيح بعد عكس ترتيب الأعمدة.
- اختبار Whole-column Selection مستقل.
- Bulk 5,000×1 + Undo/Redo.
- قاعدة نهاية الشيت: 4,000 قيمة والمتاح 200 -> يطبق 200 فقط ولا يضيف صفوف.
- دورات Custom Columns / Delete-Restore / Sort / Filter / Split / RTL أكثر.
- RevoGrid Full-column selection المجاني يُختبر عبر Range API المملوك للـERP لأن Header Column Selection الجاهز ميزة Pro.
