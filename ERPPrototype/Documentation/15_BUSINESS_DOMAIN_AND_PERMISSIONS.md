# 15 — Business Domain, Roles, Permissions, and Work Order Lifecycle

**Status:** Canonical / Approved business decisions  
**Effective date:** 2026-08-26  
**Business-decision review baseline:** `a74c9c908a2372b0e9141dcf7f6ef772bd6c07b3`  
**Purpose:** منع إعادة فتح قرارات Business سبق حسمها، وفصل ما هو **قرار منتج معتمد** عما هو **منفذ حاليًا في الكود**.

> عند التعارض بين هذه الوثيقة ووثيقة أقدم في Business semantics، هذه الوثيقة هي المرجع الأحدث.  
> الكود الحالي يظل المرجع لما هو **منفذ فعليًا الآن**. القرار المعتمد هنا قد يكون Target behavior لم يُنفذ بعد.

---

## 1. Product Operating Model

ERP Prototype ليس مجرد Spreadsheet وليس هدفه أن يصبح ERP عام ضخم.

الهدف هو **نظام تشغيل يومي لمقاول كهرباء** يكون فيه:

1. **Master Work Orders Sheet** سريع جدًا للموظف الذي يستقبل أوامر العمل أولًا.
2. **Work Order واحد مشترك** يدور على كل أقسام الفرع.
3. كل قسم متخصص يرى نفس أمر العمل ويضيف بيانات شغله هو، بدل إنشاء نسخة منفصلة من أمر العمل.
4. الإدارة ترى الاستثناءات والتأخير والقيم والمخاطر من شاشات إدارة، لا من قراءة آلاف الصفوف يدويًا.

الشكل المستهدف:

```text
Saudi Electricity / source of the Work Order
                |
                v
Master Work Orders Employee
                |
                v
          One Work Order
                |
   +------------+-------------+-------------+
   |            |             |             |
Municipality  Execution    Inspection    Other specialist flows
   |            |             |             |
specialist    specialist    specialist    specialist
data/history  data/history  data/history  data/history
```

**قاعدة:** الأقسام لا تنشئ نسخًا مستقلة من نفس Work Order.

---

## 2. Master Work Orders Sheet

الشيت الذي يتم بناؤه الآن هو **المصدر التشغيلي الأساسي** لأمر العمل.

موظف الشيت يجلس في شركة الكهرباء/بيئة العمل التي تستقبل أوامر العمل أولًا، وهو الذي:

- يسجل Work Order لأول مرة في ERP.
- يحافظ على البيانات الأساسية المشتركة.
- يغير Basket أثناء انتقال أمر العمل في الفرع.
- يعدل البيانات العامة المسموح بها.
- يسجل القيم المالية الأساسية المسموح بها.
- يظل قادرًا على تحديث البيانات التشغيلية حتى بعد أن تبدأ الأقسام الأخرى التعامل مع الأمر، باستثناء العمليات الحساسة الموضحة لاحقًا.

هذا الشيت يظل واجهة سريعة تشبه Excel في الإنتاجية، لكنه ليس المكان الذي نحشر فيه كل تفاصيل البلدية والتنفيذ والفحص والمواد والمستندات.

---

## 3. Specialist Department Model

كل قسم متخصص سيكون له شاشة/شيت/Queue خاصة به تعرض Work Orders التي تخصه.

أمثلة مستقبلية:

- Municipality.
- GIS / Route / Site.
- Execution.
- Inspection / Quality.
- Engineering.
- Materials / Warehouse.
- Commercial / Certificates / Invoicing.
- Documents / Evidence.

كل Specialist module:

- يشير إلى نفس `WorkOrderId`.
- يمتلك بياناته وتاريخه وقواعده.
- لا يكرر الـMaster Work Order.
- لا يحول كل تفاصيله إلى أعمدة في Master Sheet.
- لا يضيف عشرات الحالات إلى الـMain Basket لمجرد أن لديه Sub-workflow داخلي.

### Example — Municipality

Master employee may only need a compact indicator such as:

```text
لم يتم التقديم
تم التقديم
```

Municipality employee may need deeper details such as:

```text
Request Number
Submission Date
Rejected / Resubmitted
License Number
Issue Date
Expiry
Excavation Completion
Site Clearance
```

كل ذلك يخص **نفس Work Order**.

---

## 4. Roles and Operational Scope

### 4.1 `Employee` / Department Employee

الـIdentity role التقني الحالي هو `Employee`.

القاعدة التشغيلية:

- يرى ويعدل نطاق القسم المسموح له به.
- Master Work Orders employee ينشئ ويحدث الـMaster Work Order.
- specialist employees يعملون داخل نطاقهم/موديولاتهم المسموحة.
- exact specialist Identity role names are not frozen yet.

### 4.2 `BranchManager` — مدير الفرع

مدير الفرع مسؤول عن **الفرع بالكامل وكل أقسامه**.

له:

- رؤية كل Work Orders داخل فرعه.
- رؤية تفاصيل المسارات التابعة للفرع حسب التصميم النهائي.
- الصلاحيات الحساسة على Work Orders في فرعه بعد وجود downstream interaction.
- صلاحية Reopen لأمر العمل المغلق داخل فرعه.
- الوصول إلى Business history المطلوبة للعمليات الحساسة.

مدير الفرع هو **صاحب الـOperational override داخل الفرع**.

### 4.3 `ProjectManager` — مدير المشاريع

مدير المشاريع هو **مدير مديري الفروع**.

له:

- رؤية كل الفروع.
- رؤية كل مديري الفروع.
- المقارنة والمتابعة والرقابة على مستوى الشركة/المشاريع.
- Drill-down إلى تفاصيل الفروع والأقسام وأوامر العمل.

لكنه:

- **Read-only على Work Orders.**
- لا يغير Work Order Number/Type.
- لا يحذف Work Orders.
- لا ينفذ Reopen.
- لا يحل محل Branch Manager في الاستثناءات التشغيلية.

### 4.4 `Admin`

`Admin` مسؤول عن إدارة النظام والحسابات والإعدادات التقنية.

هذه الوثيقة لا تمنحه تلقائيًا صلاحيات تشغيلية على Work Orders لمجرد أنه Admin.  
أي Operational permissions للـAdmin يجب أن تكون صريحة في تصميم الصلاحيات، لا افتراضًا.

---

## 5. Work Order Identity

الهوية التجارية الأساسية:

```text
WorkOrderNumber + WorkTypeCode
```

- `WorkOrderNumber`: 9 digits.
- `WorkTypeCode`: 3 digits.
- الزوج فريد على مستوى الشركة وكل السنوات.
- التعديل ممكن، لكنه يصبح عملية حساسة بعد بدء الاعتماد على الهوية في أقسام أخرى.

### 5.1 Before downstream interaction

طالما لم يسجل أي قسم آخر **Business interaction حقيقي** على Work Order:

Master employee may:

- edit `WorkOrderNumber`.
- edit `WorkTypeCode`.
- delete the Work Order if it was entered incorrectly.

### 5.2 After downstream interaction

بعد وجود Business interaction حقيقي من قسم آخر:

- `WorkOrderNumber` change → `BranchManager` only.
- `WorkTypeCode` change → `BranchManager` only.
- Delete → `BranchManager` only.
- `ProjectManager` remains read-only.

Master employee **does not lose normal control of the row**.  
He can continue changing fields such as Basket and other allowed operational data.

---

## 6. What Counts as Downstream Interaction?

**مجرد ظهور Work Order في شاشة قسم آخر لا يعتبر Interaction.**

Interaction begins only when another department/module records a real business action or business record linked to the Work Order.

Examples:

- Municipality request submitted or request number recorded.
- Municipality license recorded.
- Execution activity/start recorded.
- Inspection result recorded.
- A real material transaction recorded.
- Another specialist module saves meaningful business data tied to the Work Order.

Preferred implementation principle:

> Do not depend on a manually maintained `HasInteraction` flag if the system can derive the condition reliably from actual linked business records/events.

The exact technical implementation is not frozen here.

---

## 7. Delete, Cancel, and Historical Trace

### Before interaction

If a Work Order was entered incorrectly and no other module has interacted with it:

- Master employee may delete it normally.

### After interaction

If another module has already interacted with it:

- deletion requires `BranchManager`.
- the system must preserve a historical trace sufficient to understand that the Work Order existed and what happened to it.

The exact persistence technique is not frozen:

- soft delete,
- archive/tombstone,
- audit record,
- or another safe design

may be selected later.

**Business requirement:** a manager-authorized deletion after downstream use must not erase all evidence as if the Work Order never existed.

---

## 8. Business History vs Undo/Redo

These are two different things.

### Undo/Redo

Session productivity feature:

- correct recent user actions.
- supports sheet editing.
- may be session-only.
- is not the company audit record.

### Business History / Audit

Durable business history:

- who made a sensitive change.
- when it happened.
- old and new identity values where applicable.
- closure/reopen events.
- manager-authorized deletion/administrative correction.
- later, specialist lifecycle events that management needs to audit.

**Rule:** never use client Undo/Redo history as the durable ERP audit trail.

---

## 9. Financial Model

### 9.1 Invoice types

Current approved business model has only:

1. **Partial Invoice** — فاتورة جزئية.
2. **Final Invoice** — فاتورة نهائية.

### 9.2 Partial Invoice

- Partial Invoice is optional.
- It occurs **once only** for a Work Order.
- Eligibility depends on a financial threshold.
- Example threshold may be around `20,000`, but the actual threshold may vary by region/contract.
- Do **not** hard-code one universal threshold until the source of that configuration is decided.

There is no current model of:

```text
Partial 1
Partial 2
Partial 3
...
```

### 9.3 Final Invoice

The final invoice amount is:

```text
Final Invoice Amount = Work Order Value - Partial Invoice Amount
```

If there is no Partial Invoice:

```text
Final Invoice Amount = Work Order Value
```

### 9.4 Meaning of current `Remaining Amount`

The current UI/implementation name is `Remaining Amount`.

Its approved commercial meaning is effectively:

> the amount of the Work Order not included in the one-time Partial Invoice, which becomes the Final Invoice Amount.

Therefore:

- it is derived.
- it remains read-only.
- it is not stored independently.
- it does **not** become zero after the Final Invoice is issued/approved.
- after final invoicing, the Partial and Final amounts remain visible historically.

Example:

```text
Work Order Value = 100,000
Partial Invoice  = 30,000
Final / Remaining = 70,000
```

After final approval it remains:

```text
Partial = 30,000
Final   = 70,000
```

not:

```text
Remaining = 0
```

**Important:** this field is not a receivables/outstanding-payment balance.

A future UI rename from `Remaining Amount` to a clearer `Final Invoice Amount` may be considered separately; the business meaning is already settled here.

---

## 10. Work Order Closure

`انتهاء أمر العمل` means **full operational and financial completion**.

It is not merely execution/site/inspection completion.

### Reopen

After reaching `انتهاء أمر العمل`:

- ordinary employees cannot reopen it.
- `BranchManager` may reopen it.
- `ProjectManager` is read-only.
- reopen must be recorded in durable Business History.

The exact Reopen UI and whether a reason is mandatory can be finalized when the feature is built.

---

## 11. Basket Semantics

Basket represents the Work Order's **main/general/official stage**.

It must reflect the electricity-company process, but it is **not a rigid gate that stops real work**.

There is an expected flow, but exceptions are allowed.

Example:

```text
Execution
    ↓
Inspection
    ↓
155
    ↓
Modify Estimate
```

In real operation, Inspection may be delayed. The contractor may start Modify Estimate work while the official procedure is still waiting in Inspection.

The ERP must not force:

```text
ERROR — transition prohibited
```

just because the ideal sequence was not completed.

Preferred product behavior:

- record the official/general Basket.
- allow specialist sub-workflows to progress where business reality requires.
- later surface exceptions to management.

Example manager insight:

```text
7 Work Orders started Modify Estimate while still officially waiting for Inspection.
```

---

## 12. Year Movement

Approved behavior:

- `AssignmentDate` determines the business year when it points to another year.
- changing Assignment Date to another year requires **user confirmation before the move**.
- do not silently move the Work Order to another year.
- after confirmation, the save/server layer performs the authoritative move.

This supersedes older documentation that left automatic move vs confirmation open.

---

## 13. Validation Philosophy

Approved for all input paths:

- Manual Edit.
- Paste.
- Bulk edit.
- Range Clear.
- Undo/Redo resulting states.

Invalid user input remains in the sheet and is marked clearly.

The user may continue working.

Save is blocked until all errors are fixed.

Do not reject an entire Paste merely because one value is invalid.

Examples:

```text
Partial > Work Order Value
→ keep entered Partial visible
→ mark invalid
→ Remaining blank/uncomputed
→ Save blocked
```

`Partial = 0` is normalization, not an error:

```text
Partial = 0
→ normalize to empty / null
→ Final/Remaining = Work Order Value
```

---

## 14. Paste at End of Sheet

Approved rule:

If copied data exceeds available target rows:

- paste only into available rows.
- do not automatically grow the sheet merely to fit clipboard data.
- clearly report the partial result in the final production UX.

Example:

```text
Copied rows: 4,000
Available rows: 200
Result: paste 200
Overflow: 3,800 not pasted
```

---

## 15. Custom Columns

Approved principles:

- definitions are scoped to `Department + WorkYear`; each Work Year owns an independent Custom Column catalogue.
- Add, Rename, and Delete affect the currently open Work Year only.
- supported types: Text, Money, Date, Number.
- optional.
- core fields stay protected.
- type changes are restricted once data exists / current server contract keeps type effectively immutable after creation.
- when a Work Order moves to another year, non-empty custom values move with it: reuse the destination column when name + type match, create a missing destination column automatically, and create a safe unique name when the same name has a different type.
- blank custom values do not create destination definitions.
- destination-definition creation, value remapping, and Work Order movement share the same Save transaction.
- column width/visibility layout remains a separate department-scoped concern (`DepartmentId + FieldKey`) and may therefore remain shared across years.
- Custom Columns are for flexible department-specific data.

**Architecture boundary:** do not use Custom Columns as a substitute for real domain modules such as Municipality, Execution, Invoices, HSE, or Materials.

---

## 16. Server Authority and Concurrency

Regardless of Grid library:

- browser validation is UX.
- server revalidates authorization and business rules.
- SQL/database constraints remain final for invariants they own.
- `RowVersion` optimistic concurrency remains the approved concurrency foundation.
- Revo must integrate with the existing server authority; the Grid must not become the business authority.

---

## 17. Long-Term Product Boundary

Preferred direction:

```text
Contract / Project
       |
       v
    Work Order
       |
       +--> Municipality
       +--> Site / GIS
       +--> Execution
       +--> Inspection / Quality
       +--> Documents / Evidence
       +--> Materials
       +--> Commercial / Invoicing
       +--> Activity / Audit
```

The Master Sheet remains the fast control surface.

Do not turn Work Orders into a giant table containing every specialist detail.

---

## 18. Closed Decisions — Do Not Ask Again Unless New Evidence Conflicts

The following are settled:

- Global identity = `WorkOrderNumber + WorkTypeCode`.
- Master Work Orders Sheet creates the original Work Order.
- Specialist departments work on the same Work Order, not copies.
- Branch Manager owns sensitive operational overrides inside his branch.
- Project Manager is above Branch Managers but is read-only on Work Orders.
- Downstream interaction requires a real business action; visibility alone does not count.
- Identity edit/delete become BranchManager-only after downstream interaction.
- Other allowed Master fields remain editable by the employee after downstream interaction.
- Partial invoice is one-time only.
- Final invoice = Work Order Value minus Partial.
- Final/Remaining does not become zero after final invoicing.
- `انتهاء أمر العمل` = operational + financial closure.
- Reopen after closure = BranchManager only.
- Basket follows expected SEC process but remains operationally flexible.
- Year move from AssignmentDate requires confirmation.
- Invalid input stays visible; Save is blocked.
- Partial Paste at end uses available rows only.
- Undo/Redo is not the business audit log.

---

## 19. Still Open — Ask Only When Implementation Reaches These Areas

These are not closed yet and should not be guessed:

1. Exact configuration source/rule for the Partial Invoice eligibility threshold by region/contract.
2. Exact specialist module/role names and fine-grained permissions beyond the approved high-level scope.
3. Exact expected Basket transition matrix and which exceptions deserve warnings/alerts.
4. Exact implementation strategy for durable audit/archive/deleted-record retention.
5. Exact Reopen UI and whether a reason is mandatory.
6. Exact Contract/Project data model when that module begins.
7. Exact manager alert thresholds/SLA rules.
8. Offline/synchronization conflict details when Offline implementation begins.
9. Whether/when `Remaining Amount` is renamed in the UI to `Final Invoice Amount`.

Do not reopen settled questions above while these genuinely open questions remain separate.
