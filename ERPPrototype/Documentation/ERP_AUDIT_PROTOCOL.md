# CURRENT-STATE POINTER - 2026-09-04

This document remains authoritative for its own subject area.

For the latest implementation checkpoint, active issues and execution sequence use `03_CURRENT_IMPLEMENTATION.md`, `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `09_REFACTOR_ROADMAP.md` and `10_RELEASE_READINESS_PLAN.md`.

Only older statements that describe Gate 5A/B10/B11 or Real DB Save as the current next step are historical.

---

# ERP Prototype — Independent Engineering Audit Protocol

**Purpose:** هذا الملف هو الدليل الإلزامي لتنفيذ جميع المراجعات الهندسية المتبقية في مشروع ERP Prototype.

## 1. القاعدة الأهم — Independent Audit

كل مراجعة هندسية يجب أن تبدأ **من الصفر تمامًا**.

أثناء تنفيذ Audit جديد:

- استخدم **الكود الحالي فقط** كمصدر للحكم على التنفيذ.
- لا تقرأ نتائج المراجعات السابقة.
- لا تستخدم Findings السابقة كفرضيات.
- لا تحاول إثبات أن تصميمًا سابقًا جيد أو سيئ.
- لا تعتبر تكرار Finding قديم دليلًا على صحته قبل اكتشافه من الكود الحالي بشكل مستقل.
- لو توصلت لنتيجة تخالف مراجعة سابقة، سجّل النتيجة الجديدة كما هي.
- لا تتم مقارنة النتائج بالمراجعات السابقة إلا **بعد إغلاق المراجعة المستقلة بالكامل**.

الهدف: منع Confirmation Bias.

---

## 2. لا تقفل المراجعة بسرعة

كل Audit يجب أن يكون Deep Review حقيقي، وليس بحثًا سريعًا عن عدة Findings.

قبل إعلان انتهاء أي Audit يجب:

1. مراجعة جميع المناطق المرتبطة بالموضوع.
2. البحث عن الأدلة المضادة أيضًا، وليس المشاكل فقط.
3. التحقق من أن Findings ليست مجرد تفضيلات هندسية.
4. مراجعة التقرير نفسه مرة ثانية قبل الإغلاق:
   - هل Severity صحيحة؟
   - هل Finding مؤكدة فعلًا؟
   - هل يوجد Finding مكرر؟
   - هل هناك زاوية لم يتم فحصها؟
   - هل توجد نتيجة إيجابية مهمة يجب الحفاظ عليها؟
5. لا تعتبر عدد Findings هدفًا. قد تكون النتيجة صفر مشاكل إذا كان الكود سليمًا.

---

## 3. Source of Truth

ترتيب الثقة أثناء الـAudit:

1. **الكود الحالي في ZIP / Repository الحالي** — المصدر الأول لما هو منفذ فعليًا.
2. قاعدة البيانات / migrations / tests الموجودة في نفس النسخة.
3. الوثائق الحالية فقط لفهم متطلبات المنتج والقرارات المعتمدة.
4. التقرير الهندسي السابق يستخدم **بعد انتهاء المراجعة المستقلة فقط** للمقارنة والدمج.

إذا تعارض الكود مع الوثائق:
- لا تحل التعارض بصمت.
- سجّله كـFinding أو Open Decision حسب طبيعته.

---

## 4. Audit Evidence Rules

أي Finding مؤكد يجب أن يجيب، حسب أهمية المشكلة، على:

- ما المشكلة؟
- أين توجد؟
- ما الدليل من الكود؟
- لماذا هي مشكلة فعلية؟
- ما التأثير على ERP Prototype؟
- هل هي:
  - Confirmed
  - Potential / تحتاج Runtime Test
  - Product Decision
- Severity / Priority.
- هل يلزم إصلاحها قبل Pilot أو يمكن تأجيلها؟
- أبسط اتجاه إصلاح ممكن.
- ما الاختبارات المطلوبة بعد الإصلاح؟
- هل الإصلاح قد يتداخل مع Offline أو Localization بحيث لا نعمل الشغل مرتين؟

لا تعتبر:
- كبر الملف وحده مشكلة.
- كثرة Layers وحدها مشكلة.
- Loop وحده مشكلة.
- Duplication مقصود بين Client validation وServer validation مشكلة.
- Refactor أجمل هندسيًا Finding بدون تأثير حقيقي.

---

## 5. Simplicity Rule

هدف المشروع هو أبسط تصميم كامل وآمن.

دائمًا اسأل:

> هل بنعمل 5 خطوات لحاجة ممكن تتعمل بخطوتين بدون فقد الأمان أو المميزات؟

لكن لا تبسط على حساب:

- Security
- Data Integrity
- Concurrency
- RowVersion
- Transactions
- Server-side authorization
- Required business validation
- Excel-like behavior
- Offline requirements المستقبلية

---

## 6. Performance Rule

عند مراجعة الأداء، لا تعتمد على الإحساس.

افصل التكلفة إلى:

- Browser CPU
- Browser RAM
- JavaScript allocations/clones/scans/sorts
- Tabulator rendering
- Blazor Circuit memory
- JS Interop
- Serialization / payload
- Network
- Server CPU/RAM
- EF Core
- SQL queries/locks/indexes

اسأل كيف تتغير التكلفة عند:

- 1,000 rows
- 5,000 rows
- 10,000 rows
- 50,000 rows كاختبار Scaling وليس بالضرورة Supported Target

لا توصي Optimization بدون دليل أو Benchmark إلا إذا كان التعقيد الحسابي نفسه واضحًا وخطيرًا.

أي Benchmark معزول يجب وصفه كـ**isolated benchmark** وليس زمن البرنامج الحقيقي.

---

## 7. Failure / Recovery Rule

في كل مسار حساس اسأل:

- ماذا لو انقطع النت قبل العملية؟
- أثناءها؟
- بعد SQL Commit؟
- ماذا لو Blazor Circuit مات؟
- ماذا لو السيرفر Restart؟
- ماذا لو JavaScript فشل؟
- ماذا لو SQL فشل؟
- ماذا لو المستخدم عمل Refresh؟
- ماذا لو فتح Tabين؟
- هل المستخدم يعرف هل العملية تمت أم لا؟
- هل يستطيع Resume بدون فقد شغله؟
- هل Retry Idempotent؟

افصل دائمًا بين:

- حماية البيانات في SQL.
- الحفاظ على شغل المستخدم غير المحفوظ.
- معرفة المستخدم للحقيقة بعد الفشل.

---

## 8. Offline Awareness

Work Orders مخطط لها Offline مستقبلًا.

لذلك عند أي Finding اسأل:

- هل يجب إصلاحها الآن؟
- هل Offline architecture ستحلها من الجذر؟
- هل لازمة في Online وOffline معًا؟
- هل إصلاحها الآن سيُرمى عند بناء Offline؟

لا تستخدم Offline كذريعة لتأجيل:
- Security
- Data Integrity
- Concurrency
- Server authority
- Sync correctness
- Idempotency
- Conflict detection

ولا تبنِ Recovery معقد مرتين إذا Offline durable local state سيحل نفس المشكلة لاحقًا.

---

## 9. Questions / Product Decisions

**لا توقف الـAudit لطرح أسئلة المنتج أثناء المراجعة** إلا إذا استحال إكمال الفحص بدونها.

بدل ذلك:
- سجّل كل سؤال في قسم `Open Decisions / Questions`.
- استمر بأفضل تحليل ممكن.
- اجمع جميع الأسئلة للنهاية.
- نناقشها مع المستخدم واحدًا واحدًا بعد انتهاء المراجعات.

---

## 10. Communication with User

المستخدم غير مبرمج ويريد أقصى اختصار.

أثناء العمل:
- Updates قصيرة جدًا.
- اشرح بمنطق البرنامج وليس الكود.
- مثال:
  - "تعديل صف واحد بيخلي البرنامج يراجع السنة كلها."
  - وليس شرح implementation طويل إلا عند الطلب.

في النتيجة:
- عدد Findings.
- أهم 3–7 نقاط فقط.
- ما هو قوي ويجب الحفاظ عليه.
- رابط التقرير المستقل.
- لا تدخل في التفاصيل إلا إذا طلب المستخدم.

---

## 11. Report Separation

كل Audit له ملف مستقل:

`NN_AUDIT_NAME.md`

أثناء المراجعة:
- لا تعدل التقرير المجمع.

بعد إغلاق الـAudit المستقل بالكامل:
1. افتح `12_ENGINEERING_AUDIT_REPORT.md`.
2. قارن النتائج.
3. أضف **الجديد فقط**.
4. لو Finding قديمة ظهرت مرة أخرى:
   - لا تنشئ ID جديدًا.
   - سجّل أن Audit مستقلًا آخر أكدها.
5. لا تكرر الأدلة الطويلة داخل Master Report.
6. التقرير المستقل يحتفظ بالتفاصيل الكاملة.

---

## 12. No Code Changes During Audit

حتى انتهاء جميع المراجعات:

- لا تعدل Runtime code.
- لا تعمل Performance fixes.
- لا تعمل Security fixes.
- لا تعمل Refactor.
- لا تغيّر Architecture.
- لا تغيّر UI frozen baseline.

الاستثناء الوحيد:
- ملفات التقارير نفسها.
- أدوات تحليل مؤقتة خارج المشروع إذا احتجناها للفحص.

---

## 13. Frozen Work Orders UI

لا تعيد فتح التصميم المرئي بدون طلب صريح.

القيم المعتمدة:

- Grid row height = 22
- Grid header height = 42
- Grid font size = 13.25 px
- KPI height = 44
- Selected bar height = 34
- Basket min/default = 184
- Basket max = 320

Primary usage:
- Split Screen 100%
- support 90/80/75/70/67

Performance/architecture refactor لا يجب أن يغيّر هذه القيم تلقائيًا.

---

## 14. Reviews Completed

تمت المراجعات التالية كـAudits مستقلة وأُغلقت قبل بدء الـRuntime remediation:

1. Architecture Red-Team
2. Code Simplicity
3. Execution Flow
4. Performance Cost
5. State & Ownership
6. Failure / Recovery
7. Data-flow & Serialization
8. Concurrency & Multi-user
9. Maintainability
10. Testability
11. Security-by-design
12. Offline + Localization Readiness
13. Technology Fit

كما اكتمل:
- Final Cross-Audit Synthesis.
- Post-audit product-decision consolidation.
- التصنيف الأساسي للـFindings وخطة الـRemediation.

---

## 15. Current Engineering Phase

**Independent audit sequence — COMPLETE.**

العمل الحالي ليس Audit جديدًا من القائمة أعلاه؛ هو **post-audit remediation + measured performance investigation**.

الحالة الحالية في 2026-08-17:

- Test Foundation: مكتمل.
- `LDR-002`: مغلق ومثبت.
- Clean performance/torture baseline: مكتمل.
- Initialization recovery: مكتمل ومثبت في الكود الحالي.
- Financial Sort optimization: مكتمل ومقبول.
- **Current investigation:** ArrowDown / reopened `GRID-001`.

قاعدة التحقيق الحالية:

> ابدأ من الكود الحالي فقط، واستخدم القياسات كدليل، لكن لا تعتبر التشخيص المبدئي Root Cause حتى يثبته مسار التنفيذ في الكود.

لا Patch قبل تحديد السبب البرمجي.

---

## 16. Future Independent Reviews

لا توجد مراجعة مستقلة مجدولة حاليًا من القائمة القديمة.

إذا ظهر لاحقًا Audit جديد:
- يطبق هذا البروتوكول من الصفر على الكود الحالي؛
- لا يستخدم Findings السابقة أثناء الاكتشاف؛
- يقارن ويُدمج في الـMaster فقط بعد إغلاقه.

أما العمل الحالي فيستمر حسب الـMaster المدمج:
1. ArrowDown root-cause + smallest safe fix.
2. Resume Online Reliability.
3. Narrow Save/Delta/receipt contract.
4. Concurrency/Security/Localization.
5. Offline/Sync.
6. Production gates.

---

## 17. Final Principle

لا تحاول إثبات أن المشروع جيد.
ولا تحاول إثبات أنه سيئ.

**حاول فقط معرفة الحقيقة من الكود.**

أي جزء سليم:
> سجّل أنه سليم ولا تلمسه.

أي جزء معقد بدون داعٍ:
> أثبت التعقيد وتأثيره ثم اقترح أبسط تحسين.

أي خطر غير مثبت:
> اتركه Potential حتى يثبت.

أي Finding تتكرر في Audits مستقلة:
> تزيد الثقة فيها، لكنها تظل Finding واحدة في التقرير الأساسي.
