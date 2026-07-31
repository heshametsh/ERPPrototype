# 13 — Change Summary — Phase 6.1 Lifecycle Audit

**التاريخ:** 2026-07-29  
**الأساس:** `M5D4R3-Stable-Range-UX`  
**نوع التغيير:** Diagnostics only — لا تغيير في سلوك الشيت ولا Recovery ولا Rewrite

## نتيجة Phase 6.0

أثبت اختبار الأسهم النظيف أن الأداء يتدهور تدريجيًا بعد جلسة طويلة:

- ArrowDown انتقل تقريبًا من متوسط 33.7ms إلى 60.4ms.
- ArrowUp انتقل تقريبًا من متوسط 34.8ms إلى 57.4ms.
- ظهرت Long Tasks وLong Animation Frames في الحالة المتعبة.
- الذاكرة لم تنمُ باستمرار؛ كانت ترتفع وتنخفض مع Garbage Collection.
- معالج Keydown وScroll handler وحدهما لا يفسران زمن الرسم الكامل.

## ما أضيف في Phase 6.1

### `wwwroot/js/tabulatorPerformance.js`

- وضع جديد: `/work-orders?perf=lifecycle`.
- تقسيم آلي للتقرير إلى نوافذ كل 30 ثانية.
- لكل نافذة: عدد المدخلات، زمن الأسهم، Scroll، Long Tasks، Long Animation Frames، الذاكرة، وحالة الموارد.
- قياس رصيد Event Listener registrations.
- قياس Timeouts وIntervals وAnimation Frames النشطة والقمم.
- قياس Mutation/Resize/Intersection/Performance Observers.
- Snapshot للمالكين المعروفين: Grid، Performance Observatory، Filters، وRange Auto-scroll.

### `wwwroot/js/tabulatorRangeAutoScroll.js`

- إضافة `snapshot()` للقراءة التشخيصية فقط.
- لا تغيير في سرعة Auto-scroll أو ملكية التحديد أو أحداث السحب.

## حدود القياس

- وضع Lifecycle تشخيصي ويضيف حملًا بسيطًا؛ لا يستخدم لإثبات تحسين المنتج النهائي.
- رصيد Listeners يعتمد على `addEventListener - removeEventListener`. التسجيلات التي يزيلها المتصفح تلقائيًا عبر `once` أو `AbortSignal` قد تجعل الرقم حدًا أعلى تقريبيًا، ولذلك يسجل التقرير عددها بوضوح.
- أي إصلاح لاحق يعاد اختباره في `perf=baseline`.

## التوثيق المصحح

- Phase 6 الحالية هي مرحلة الجلسة الطويلة، وليست مرحلة Clipboard القديمة.
- الاسم النهائي هو `ProjectManager`.
- قاعدة التفرد عالمية عبر الشركة وكل السنوات.
- `Employee` هو اسم الـRole التقني، وDepartment Employee / موظف القسم هو اسم العرض.
- ملفات `*.user` ومنها `ERPPrototype.csproj.user` لا تدخل حزم التسليم المستقبلية.

## الاختبار التالي

تشغيل تقرير Lifecycle واحد طويل بالأسهم فقط. التقرير نفسه يقسم الزمن تلقائيًا، لذلك لا نحتاج COLD/LONG/FATIGUED منفصلة ولا علامات يدوية.
