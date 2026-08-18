# 00 — Documentation Index

**Status:** Current / Approved  
**Last update:** 2026-08-17
**Audit baseline:** `00503ab`  
**Latest confirmed runtime checkpoint:** `0f6bd3b`

## ترتيب الثقة عند التعارض

1. **الكود الحالي + Migrations + Tests في نفس الـbaseline** — الحقيقة لما هو منفذ فعليًا.
2. `12_ENGINEERING_AUDIT_REPORT.md` — الـMaster الحالي للـFindings والقرارات والخطة المستقبلية.
3. `ERP_AUDIT_PROTOCOL.md` — قواعد تنفيذ أي Audit مستقل جديد.
4. الوثائق التشغيلية الحالية: `03`, `05`, `06`, `07`, `08`, `09`, `10`.
5. Git history / Change Summaries — تاريخ التنفيذ والقرارات القديمة.
6. المحادثات — تفسير مؤقت فقط؛ القرار النهائي يجب أن ينتقل للوثائق.

**قاعدة:** لا يتم حل تعارض مهم بصمت. إذا تعارض قرار قديم مع الـMaster، يُعامل القرار القديم كـSuperseded ما لم يثبت الكود خلاف ذلك.

## ابدأ من هنا

| الوثيقة | الاستخدام |
|---|---|
| `../START_HERE_ERP_PROTOTYPE.md` | دخول سريع للحالة الحالية وخطوة التنفيذ التالية |
| `12_ENGINEERING_AUDIT_REPORT.md` | **المرجع الهندسي الرئيسي الحالي**: Findings + قرارات + Offline + SEC validation + المستقبل + ترتيب التنفيذ |
| `ERP_AUDIT_PROTOCOL.md` | منهج المراجعات المستقلة ومنع Confirmation Bias |
| `41_HANDOFF_2026-08-16_POST_AUDIT.md` | تسليم تاريخي لمرحلة ما قبل الـRuntime remediation |
| `42_HANDOFF_2026-08-17_PERFORMANCE_RECONCILIATION.md` | **التسليم الحالي** بعد Test/LDR/Recovery/Sort وقياسات ArrowDown |
| `03_CURRENT_IMPLEMENTATION.md` | ما الموجود في baseline الحالي فعليًا |
| `05_WORK_ORDERS_GRID_BEHAVIOUR.md` | عقد سلوك شيت Work Orders الحالي |
| `06_REGRESSION_TEST_CHECKLIST.md` | اختبارات عدم كسر السلوك الحالي + متطلبات التوسعة الجديدة |
| `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md` | المشكلات الحالية؛ الـMaster أعلى منه عند التعارض |
| `08_DECISIONS_LOG.md` | سجل القرارات؛ تمت إضافة قرارات ما بعد الـAudit في أعلى الملف |
| `09_REFACTOR_ROADMAP.md` | التاريخ السابق + ترتيب remediation الحالي في أعلى الملف |
| `10_RELEASE_READINESS_PLAN.md` | بوابات Staging/Pilot/Production الحالية |

## وثائق المنتج والهندسة الأساسية

| الوثيقة | الاستخدام |
|---|---|
| `01_PROJECT_CONTEXT.md` | نطاق المنتج والسياق |
| `02_AI_DECISION_PRINCIPLES.md` | طريقة الاقتراح والتنفيذ والتواصل |
| `04_ARCHITECTURE_AND_DEPENDENCIES.md` | حدود الموديولات واتجاه الاعتماد |

## Evidence / History

- `11_CHANGE_SUMMARY_...` إلى `40_CHANGE_SUMMARY_...` = سجل تاريخي لمراحل سابقة.
- `Review/` = أدلة مراجعة/قياسات سابقة.
- Git history = المرجع التاريخي النهائي للملفات التي أزيلت أو تغيرت.

## الحالة الحالية المختصرة

- كل الـIndependent Audits المخططة اكتملت.
- Final Cross-Audit Synthesis اكتمل.
- Product decision session بعد الـAudits اكتملت بدرجة كبيرة.
- SEC browser/offline feasibility تم اختبارها عمليًا بنجاح قوي؛ ما زال اختبار **الكابل الحقيقي + الدومين الحقيقي + Proxy/Firewall** Gate مفتوحًا.
- Runtime remediation بدأ بالفعل: Test Foundation + `LDR-002` + initialization recovery + financial Sort optimization مكتملة.
- `GRID-001` أُعيد فتحه بعد قياس ArrowDown الحقيقي؛ **ArrowDown root-cause investigation هو العمل الحالي.**
