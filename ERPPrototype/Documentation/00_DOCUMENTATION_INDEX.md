# 00 — Documentation Index

**Status:** Current / Approved  
**Last update:** 2026-08-22
**Audit baseline:** `00503ab`  
**Current production runtime baseline retained:** `0f6bd3b`  
**Latest reviewed Git HEAD:** `04e0f1a`

## Native V1 cleanup override — 2026-08-24

The active AI-engineering surface is defined by `AGENTS.md`, this Decisions Log, `.ai/prompts/native-reviewer-v1.md`, and `ERPPrototype/Tools/AITeam/NativeV1/`. Project Brain, V2/V3 qualification, and the old reviewer/harness infrastructure are archived under `ERPPrototype/Documentation/Archive/AI-Team-V3/`; they are retained for history only.

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
| `13_TECHNOLOGY_EVOLUTION.md` | **سجل تطور التقنية**: Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid، ولماذا استمر أو تغير كل قرار |
| `ERP_AUDIT_PROTOCOL.md` | منهج المراجعات المستقلة ومنع Confirmation Bias |
| `41_HANDOFF_2026-08-16_POST_AUDIT.md` | تسليم تاريخي لمرحلة ما قبل الـRuntime remediation |
| `42_HANDOFF_2026-08-17_PERFORMANCE_RECONCILIATION.md` | تسليم تاريخي قبل قرار تغيير Grid Engine؛ يظل Evidence لأداء Tabulator |
| `03_CURRENT_IMPLEMENTATION.md` | ما الموجود في baseline الحالي فعليًا |
| `05_WORK_ORDERS_GRID_BEHAVIOUR.md` | عقد سلوك شيت Work Orders الحالي |
| `06_REGRESSION_TEST_CHECKLIST.md` | اختبارات عدم كسر السلوك الحالي + متطلبات التوسعة الجديدة |
| `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md` | المشكلات الحالية؛ الـMaster أعلى منه عند التعارض |
| `08_DECISIONS_LOG.md` | سجل القرارات؛ تمت إضافة قرارات ما بعد الـAudit في أعلى الملف |
| `09_REFACTOR_ROADMAP.md` | التاريخ السابق + ترتيب remediation الحالي في أعلى الملف |
| `10_RELEASE_READINESS_PLAN.md` | بوابات Staging/Pilot/Production الحالية |
| `Archive/AI-Team-V3/ERPPrototype/Documentation/AI_AGENT_WORKFLOW_V3.md` | Historical AI-team workflow; archived and not active |
| `Archive/AI-Team-V3/` | Historical Project Brain, qualification, reviewer, and harness material; not an active dependency |

## وثائق المنتج والهندسة الأساسية

| الوثيقة | الاستخدام |
|---|---|
| `01_PROJECT_CONTEXT.md` | نطاق المنتج والسياق |
| `02_AI_DECISION_PRINCIPLES.md` | طريقة الاقتراح والتنفيذ والتواصل |
| `04_ARCHITECTURE_AND_DEPENDENCIES.md` | حدود الموديولات واتجاه الاعتماد |
| `13_TECHNOLOGY_EVOLUTION.md` | Timeline تقني موحد وEvidence لكل انتقال |

## Evidence / History

- `11_CHANGE_SUMMARY_...` إلى `40_CHANGE_SUMMARY_...` = سجل تاريخي لمراحل سابقة.
- `Review/` = أدلة مراجعة/قياسات سابقة.
- Git history = المرجع التاريخي النهائي للملفات التي أزيلت أو تغيرت.

## الحالة الحالية المختصرة

- كل الـIndependent Audits المخططة اكتملت.
- Final Cross-Audit Synthesis اكتمل.
- Product decision session بعد الـAudits اكتملت بدرجة كبيرة.
- SEC browser/offline feasibility تم اختبارها عمليًا بنجاح قوي؛ ما زال اختبار **الكابل الحقيقي + الدومين الحقيقي + Proxy/Firewall** Gate مفتوحًا.
- Runtime remediation الأساسية السابقة ما زالت محفوظة: Test Foundation + `LDR-002` + initialization recovery + financial Sort optimization.
- **Grid Engine selection completed on 2026-08-20:** RevoGrid Community **4.25.2** is the selected Work Orders replacement target after isolated 100k + ERP behavior gates.
- `/work-orders` الحقيقي ما زال Tabulator 6.5.0؛ قرار RevoGrid لم يتحول بعد إلى production integration.
- Univer comparison stopped after a real native mismatch with the approved end-of-sheet Paste rule.
- **Current Revo state:** isolated `/work-orders-revogrid-gate5b5` has Edit/Paste/History/Dirty/Filter/Sort/Header Selection/Insert-Delete/Remaining sync; real database Save and production cutover are still not implemented.
- **Current engineering foundation task:** Native V1 cleanup is frozen by `DEC-041`; `DEC-040` remains the normative validation decision for the ERP runtime.
- Grid qualification evidence is retained under `wwwroot/grid-shootout/`, including `REVOGRID_FROZEN_BASELINE_2026-08-20.json`.

## Archived Project Brain / qualification

The former Project Brain index, aliases, validator, canary, and CI check are preserved under `Documentation/Archive/AI-Team-V3/` and are not used by Native V1.
