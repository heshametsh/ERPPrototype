# 11 — Documentation Change Summary — 2026-07-27

## Scope

تمت مراجعة حزمة `ERPPrototype(19).zip` على أساس أن E6C هي النسخة المستقرة الرسمية.

لم يتم تغيير أي ملف Runtime أو C# أو Razor أو JavaScript أو CSS أو Migration.

## Step 1 — تثبيت مصدر الحقيقة

### What was done

- تثبيت E6C في التوثيق كـBaseline.
- توضيح أن R2/R3 recovery experiments ليست جزءًا من النسخة.
- إنشاء Documentation Index.

### Why

حتى لا نركب Patch تجريبي أو وثيقة قديمة فوق النسخة المستقرة.

### Simple example

مثل كتابة رقم الإصدار الصحيح على الصندوق قبل تخزينه، حتى لا نفتح صندوقًا مشابهًا بالخطأ.

## Step 2 — تحديث START HERE

### What was done

استبدال الوثيقة القديمة التي كانت تشير إلى Syncfusion بنسخة تطابق Blazor وTabulator والكود الحالي.

### Why

المطور أو AI الجديد يجب ألا يبدأ من تعليمات تقنية لم تعد موجودة.

### Example

الوثيقة القديمة كانت كخريطة لمبنى تم تغييره؛ الجديدة ترسم الأبواب الموجودة فعلًا.

## Step 3 — استبدال Project Context v2.0

### What was done

- إنشاء `01_PROJECT_CONTEXT.md` Version 3.0.
- أرشفة Version 2.0 التي تعتمد Power Apps/Dataverse.

### Why

وجود وثيقتين Approved بتقنيتين متعارضتين يجعل أي قرار لاحق غير موثوق.

### Example

لا يمكن أن يكون لدينا عقدان حاليان، أحدهما يقول SQL Server والآخر يقول Dataverse.

## Step 4 — تحديث AI Decision Principles

### What was done

رفع النسخة إلى 1.3 وإضافة:

- Proactive Engineering Foundation Rule.
- Non-programmer Explanation Rule.
- Change Impact Rule.
- أمثلة إلزامية بعد كل خطوة.

### Why

حتى لا ينتظر AI أن يكتشف المستخدم الحاجة للتوثيق أو الاختبارات أو التنظيم بالمصادفة، وحتى يفهم المستخدم ما يحدث رغم أنه غير مبرمج.

### Example

بدل قول "أضفنا optimistic concurrency"، يجب شرح أنها ختم نسخة يمنع الكتابة فوق تعديل أحدث.

## Step 5 — توثيق الواقع الحالي

### What was done

إنشاء Current Implementation من الكود الفعلي:

- التقنية.
- الأدوار.
- تدفق البيانات.
- قواعد الحفظ.
- ما يعمل وما لا يعمل.
- حدود المراجعة.

### Why

نفصل بين "منفذ" و"مخطط" و"مطلوب مستقبلًا".

## Step 6 — وضع حدود Architecture

### What was done

تحديد:

- UI.
- Application Services.
- EF/SQL.
- JavaScript feature modules.
- Shared state صغير.
- Dependency direction.

### Why

حتى لا يؤثر تعديل Resize على Keyboard أو Year switch بدون أن نعرف.

## Step 7 — تثبيت Grid Behaviour and Tests

### What was done

- توثيق عقد سلوك E6C.
- إنشاء Regression Checklist يختبر كل المميزات المتأثرة.

### Why

Compile أو Syntax PASS لا يكفيان لإثبات أن الشيت يعمل.

## Step 8 — تسجيل المشاكل والقرارات

### What was done

- Known Issues/Technical Debt register.
- Decisions Log.
- Refactor Roadmap.
- Release Readiness gates.

### Why

حتى لا ننسى مشكلة أو نعيد قرارًا بلا سبب أو نخلط Prototype بإصدار تجاري.

## Step 9 — تنظيم الملفات القديمة

### What was done

- نقل تقارير 2026-07-25 والوثائق المتعارضة إلى Archive.
- حفظها للتاريخ بدل حذف المعرفة.
- حذف `ERPPrototype.csproj.user` من الحزمة لأنه إعداد محلي خاص بالجهاز.

### Why

الجذر يحتوي فقط على نقاط البدء الحالية، والقديم لا يظهر كأنه مرجع معتمد.

## Static Verification

Passed:

- JavaScript syntax for project-owned files.
- JSON and project XML parsing.
- E6C markers present.
- Failed recovery experiment flags absent.
- Source baseline manifest generated.

Not performed:

- .NET restore/build.
- SQL/browser/Azure tests.

## Final Result

الحزمة الحالية هي E6C نفسها من ناحية Runtime، مع أساس توثيق وتنظيم يحدد:

- أين نحن؟
- ماذا يعمل؟
- ما المشكلة؟
- لماذا اتخذنا القرارات؟
- ماذا نختبر؟
- ما ترتيب العمل القادم؟


---

## Runtime Checkpoint Update — E6D / E6E

### Step 10 — Enter repeat performance guard

**What was done:** Plain Enter navigation was added to the same central vertical frame gate used by ArrowUp and ArrowDown.

**Why:** Holding Enter previously built a browser key-repeat backlog and became slow near row 1,040.

**Simple example:** Enter and the arrow keys now use the same controlled queue instead of Enter creating a separate traffic jam.

**Verification:** User confirmed sustained Enter navigation remained fast and the connected navigation behavior still worked.

### Step 11 — First right-click range guard

**What was done:** When the sheet has no range, the first right-click creates a genuine one-cell range before Tabulator handles the mouse event.

**Why:** Tabulator 6.5 attempted to call `activeRange.occupies` before creating the first range and threw an exception.

**Simple example:** The system now creates the selection first, then opens the right-click menu.

**Verification:** User confirmed the first right-click, context menu, and connected tests work without the previous red Console error.

### Current state

- E6C remains the foundation Git baseline.
- E6E is the current stable runtime checkpoint.
- Long-session vertical fatigue remains open.
- The next engineering phase is gradual module extraction, starting with Diagnostics.


---

## Runtime Checkpoint Update — E6F and Phase 0 Closure

### Step 12 — Structural focus safety

**What was done:** Added a bounded focus retry guard after structural data rebuilds.

**Why:** A Virtual DOM cell element may not exist immediately after Insert/Delete or Undo/Redo, causing `element?.focus is not a function`.

**Simple example:** The code waits for the button to appear before trying to press it.

**Verification:** User tested Insert/Delete/Undo/Redo/Copy-Paste/Save; Console showed no errors.

### Step 13 — Provisional baseline

**What was done:** Accepted two clean navigation reports and calculated a temporary comparison baseline.

**Why:** The user chose to stop repeated runs; a practical reference is still needed before refactor.

**Limitation:** Different viewport widths mean the result is not a strict median and cannot prove small improvements.

### Current state

- E6F is the current stable checkpoint.
- Phase 0 is complete.
- Long-session fatigue remains open.
- Next: Phase 1 — Extract Diagnostics without touching keyboard or lifecycle.
