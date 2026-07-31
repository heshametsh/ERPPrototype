# 00 — Documentation Index

**الحالة:** Approved  
**آخر تحديث:** 2026-07-31  
**الهدف:** تحديد الوثيقة الصحيحة بسرعة بدل الاعتماد على المحادثات أو النسخ القديمة.

## المصدر المعتمد

ترتيب الثقة عند التعارض:

1. الكود الحالي عند Checkpoint `Phase8.6-R1-Stable` مع Patch المرحلة الجاري اختبارها.
2. الوثائق الحالية داخل هذا المجلد وحالتها `Approved`.
3. القرارات المسجلة في `08_DECISIONS_LOG.md`.
4. المحادثات للتفسير المؤقت فقط.
5. `Documentation/Archive` تاريخ قديم وغير صالح لاتخاذ قرار حالي.

لا يتم حل تعارض مهم بصمت. يتم تسجيله في Known Issues أو Decisions Log.

## الوثائق الحالية

| الوثيقة | مسؤوليتها | افتحها عندما تسأل |
|---|---|---|
| `01_PROJECT_CONTEXT.md` | المنتج، النطاق، التقنية، المبادئ الثابتة | ما هو المشروع وإلى أين يتجه؟ |
| `02_AI_DECISION_PRINCIPLES.md` | طريقة تفكير وتواصل AI وتسليم التعديلات | كيف يجب أن يقترح وينفذ ويشرح؟ |
| `03_CURRENT_IMPLEMENTATION.md` | ما هو موجود فعلًا في الكود | ماذا يعمل الآن وماذا لا يعمل؟ |
| `04_ARCHITECTURE_AND_DEPENDENCIES.md` | حدود الموديولات واتجاه الاعتماد | أين يجب وضع كل مسؤولية؟ |
| `05_WORK_ORDERS_GRID_BEHAVIOUR.md` | عقد سلوك شيت أوامر العمل | كيف يجب أن تعمل الأسهم والحفظ والصفوف والخلايا؟ |
| `06_REGRESSION_TEST_CHECKLIST.md` | اختبارات تمنع كسر الميزات | ماذا أختبر بعد أي تعديل؟ |
| `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md` | المشاكل المعروفة وترتيبها | ما المخاطر المؤجلة وما الذي يمنع الإصدار؟ |
| `08_DECISIONS_LOG.md` | القرارات الهندسية وأسبابها | لماذا اخترنا هذا الحل؟ |
| `09_REFACTOR_ROADMAP.md` | خطة فصل الكود بدون Rewrite | ما ترتيب التنظيم القادم؟ |
| `10_RELEASE_READINESS_PLAN.md` | بوابات Prototype/Pilot/Commercial | متى يصبح صالحًا للتجربة أو البيع؟ |
| `11_CHANGE_SUMMARY_2026-07-27.md` | إنشاء أساس التوثيق الهندسي | ماذا فعلت مراجعة E6C؟ |
| `12_CHANGE_SUMMARY_2026-07-29.md` | إغلاق Phase 5 وتثبيت M5D4R3 | ما الذي تغير في الحفظ والتكرارات والتحديد وDelete وAuto-scroll؟ |
| `13_CHANGE_SUMMARY_2026-07-29_PHASE6_1.md` | Baseline الجلسة الطويلة وLifecycle Audit | ما نتيجة Phase 6.0 وما أداة قياس Phase 6.1؟ |
| `14_CHANGE_SUMMARY_2026-07-29_PHASE6_CLOSURE.md` | قرار إغلاق Phase 6 بدون Performance Patch | لماذا قُبل الأداء الحالي ولماذا أُجل Search Debounce؟ |
| `15_CHANGE_SUMMARY_2026-07-29_PHASE7A_CLIPBOARD_HISTORY.md` | تحسين مرشح لسرعة Paste وUndo/Redo | ما التعديل محدود المخاطر المطلوب اختباره قبل اعتماده؟ |
| `16_CHANGE_SUMMARY_2026-07-31_PHASE8_5.md` | Field-level change tracking and generic batch editing | ماذا تغير في Phase 8.5 وكيف نختبره؟ |
| `17_CHANGE_SUMMARY_2026-07-31_PHASE8_5_R1.md` | تصحيح طريقة تطبيق التعديلات الجماعية الكبيرة | لماذا نجح المنطق وفشل الأداء في R5، وما التصحيح المطلوب اختباره؟ |
| `18_CHANGE_SUMMARY_2026-07-31_PHASE8_5_R2.md` | منع إعادة تحديث آلاف الصفوف المرئية بعد الحفظ | لماذا كان تغيير السنة يعيد السرعة، وما الذي يتغير في نتيجة الحفظ؟ |
| `19_CHANGE_SUMMARY_2026-07-31_PHASE8_6_R1.md` | فصل مالك دورة حياة الشيت | كيف نضمن أن تغيير السنة يغلق الشيت القديم قبل فتح الجديد؟ |
| `20_CHANGE_SUMMARY_2026-07-31_PHASE8_6_R2.md` | فصل ملكية تفاعلات الشيت | أين أصبحت الأسهم والتحديد وResize وكليك اليمين وCopy/Paste مرتبطة؟ |

## المجلدات المساعدة

- `Review/`: نتائج فحص وManifest للنسخ المرجعية.
- `Archive/`: وثائق قديمة محفوظة للتاريخ فقط.

## قاعدة منع التكرار

كل معلومة لها مالك واحد:

- الرؤية والنطاق في Project Context.
- الواقع الحالي في Current Implementation.
- السلوك التفصيلي للشيت في Grid Behaviour.
- المشكلة في Known Issues.
- سبب القرار في Decisions Log.
- ملخص كل مرحلة في Change Summary الخاص بتاريخها.


- `21_CHANGE_SUMMARY_2026-07-31_PHASE8_7_R1.md` — Blazor save workflow extraction and focused regression.
