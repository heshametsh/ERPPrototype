# Technology Evolution — ERP Prototype

**Status:** Current / Approved  
**Created:** 2026-08-20  
**Purpose:** حفظ تاريخ الانتقال بين التقنيات، وسبب اختيار كل تقنية، وسبب الاستمرار أو الاستبدال، بدون إعادة كتابة التاريخ بعد كل تغيير.

> هذه الوثيقة تسجل **تطور القرار التقني**.  
> ما هو منفذ فعليًا الآن يظل مرجعه `03_CURRENT_IMPLEMENTATION.md` والكود الحالي.  
> القرارات التفصيلية يظل مرجعها `08_DECISIONS_LOG.md`.  
> التقارير القديمة لا تُحذف؛ تبقى Evidence تاريخية.

---

## 1. Power Apps + Dataverse — الاتجاه الأول

**الحالة:** Archived / Superseded.

### ما الذي نعرفه من الوثائق الحالية؟

كان Power Apps + Dataverse اتجاهًا سابقًا للمشروع في `UDS_PROJECT_CONTEXT_v2.0`. الوثائق الحالية لا تحتفظ بالتفصيل الكامل لسبب اختياره أول مرة، لذلك لا يتم اختراع سبب بعد الواقعة.

### لماذا خرجنا منه؟

القرار المعتمد في `DEC-001` كان الانتقال إلى:

- Blazor Web App
- ASP.NET Core
- Entity Framework Core
- SQL Server

والسبب الموثق:

- تحكم أكبر في تجربة Excel-like.
- تحكم أكبر في الأداء.
- تحكم أوضح في الصلاحيات.
- امتلاك التطبيق والكود وقاعدة البيانات مباشرة.
- ملاءمة أفضل لبناء منتج تجاري قابل للتطوير.

**النتيجة:** وثائق Power Apps/Dataverse القديمة أصبحت Archived وليست اتجاه التنفيذ الحالي.

---

## 2. Blazor + ASP.NET Core + EF Core + SQL Server — أساس الـERP الحالي

**الحالة:** Current / Retained.

هذا لم يكن مجرد بديل للشيت؛ هو انتقال في **أساس التطبيق نفسه**.

### لماذا تم اختياره؟

بحسب `DEC-001`:

- التحكم في تجربة الاستخدام بدل حدود منصة جاهزة.
- القدرة على بناء Excel-like Work Orders.
- التحكم في الأداء والصلاحيات.
- امتلاك الـbusiness logic والـdatabase schema.
- مناسب لاتجاه المنتج التجاري.

### ما الذي أثبته حتى الآن؟

الـArchitecture الحالي بُني واستمر على:

- Blazor Web App — Interactive Server.
- ASP.NET Core.
- ASP.NET Core Identity.
- EF Core.
- SQL Server / LocalDB محليًا، وAzure SQL ضمن نموذج النشر المخطط.
- Modular Monolith بدل Microservices المبكرة.

### القرار الحالي

**لا يوجد قرار لاستبدال هذا الأساس.**

اختيار RevoGrid لاحقًا هو تغيير **Grid Engine داخل Work Orders فقط**، وليس Rewrite للـERP ولا تغييرًا لـBlazor/EF/SQL.

---

## 3. Syncfusion — مرحلة Grid تاريخية وسيطة

**الحالة:** Historical / Removed.

الحزمة الحالية التي تمت مراجعتها في 2026-08-20 لا تحتوي على Syncfusion runtime/package references، والوثائق الحالية تؤكد أن Work Orders الفعلي لم يعد يستخدم Syncfusion.

### ماذا نستطيع توثيقه بثقة؟

- Syncfusion كان ضمن مرحلة سابقة من تطوير الشيت.
- عندما استقر القرار على Tabulator، لم تعد Syncfusion موجودة في تنفيذ Work Orders الحالي.
- السبب الموثق لاختيار Tabulator كان الوصول لتجربة أقرب إلى Excel والتحكم في:
  - Keyboard.
  - Range selection.
  - Clipboard.

### ما الذي لا تدعيه هذه الوثيقة؟

الـsource package الحالي لا يحتفظ بتقرير مستقل كامل يشرح **كل** أسباب اختيار Syncfusion أصلًا أو كل تفاصيل قرار تركها. لذلك لا يتم اختراع Timeline أدق من Evidence المتوفر.

**القاعدة المستقبلية:** أي انتقال تقني جديد يجب أن يسجل أسبابه وقت القرار، لا بعد شهور.

---

## 4. Tabulator 6.5.0 — أول Grid وصل لمرحلة Work Orders حقيقية واسعة

**الحالة الحالية:** Current production/runtime grid.  
**الحالة المستقبلية:** Superseded as target; retained until RevoGrid cutover passes.

### لماذا اخترناه؟

`DEC-004` وثّق السبب:

- تجربة أقرب إلى Excel.
- تحكم في Keyboard.
- تحكم في Range selection.
- تحكم في Clipboard.
- كان مناسبًا للـprototype validation.

### ماذا نجح فيه؟

Tabulator لم يكن تجربة فاشلة. عليه بُنيت واختُبرت أجزاء مهمة من المنتج:

- Editable Work Orders grid.
- Range selection.
- Copy/Paste.
- Delete/Backspace.
- Undo/Redo.
- Custom Columns.
- Dirty State.
- Save reconciliation.
- Filters/Sort.
- Column hide/show/width persistence.
- Lifecycle ownership.
- Interaction ownership.
- 10k-oriented performance and regression infrastructure.

كما أن عملية التنظيف الهندسي فصلت أجزاء كبيرة من `tabulatorTest.js` إلى Modules أوضح بدل Rewrite كامل.

### لماذا قررنا عدم الاستمرار عليه كمحرك مستقبلي؟

المشكلة لم تكن Feature واحدة فقط؛ كانت **تكلفة الاستقرار المستمرة** حول سلوك الشيت عالي التفاعل.

الـMaster Audit سجل في الاختبار الحقيقي:

- ArrowDown average ≈ **131.8 ms**.
- P95 ≈ **214.7 ms**.
- Tabulator `onkeydown` كان أكبر Script متكرر مرتبط بالكيبورد بمتوسط ≈ **41.06 ms**.
- 124 ArrowDown inputs أنتجت 254 `range-changed` events.
- لم يثبت Memory Leak؛ Virtual DOM ظل bounded، لذلك المشكلة لم تكن ببساطة “Tabulator كله معيوب”.

خلال التطوير احتجنا أيضًا إلى طبقات مخصصة لإدارة:

- selection/range behavior,
- clipboard ownership,
- lifecycle,
- resize restoration,
- dirty state,
- field changes,
- range auto-scroll,
- performance instrumentation.

القرار لم يكن “نرمي Tabulator بسبب Bug”.  
القرار كان: **قبل إضافة طبقات أكثر، نقارن محركات Grid أخرى بنفس متطلبات المنتج.**

---

## 5. Grid Shootout — مقارنة قبل الاستبدال

**الحالة:** Completed — 2026-08-20.

تم فصل الاختبارات عن `/work-orders` الحقيقي داخل `wwwroot/grid-shootout/` حتى لا يكون الاختيار مبنيًا على الانطباع.

تمت مقارنة أكثر من مرشح، ووصلت المقارنة النهائية إلى:

- RevoGrid Community.
- Univer.

الاختيار لم يعتمد على الشكل فقط؛ اعتمد على:

- 100,000 rows.
- Whole-column selection.
- Heavy scroll.
- Sort / Filter.
- Paste 5,000.
- End-of-sheet Paste.
- Undo/Redo.
- Undo/Redo after Save.
- Readonly behavior.
- Delete/Restore 1,000 rows.
- Custom Columns.
- Split Screen.
- RTL.
- Browser Zoom.

---

## 6. Univer 0.25.1 — منافس نهائي تم رفضه

**الحالة:** Evaluated / Not selected.

### ما الذي نجح فيه؟

- Selection.
- Scroll.
- Sort.
- Filter.
- Paste 5,000.

في اختبار Paste 5,000:

- `SheetValueChanged` سجل `H102:H5101` = 5,000 خلية.
- `ClipboardPasted` سجل اكتمال العملية في نحو 869ms في التجربة المقبولة.

### لماذا لم يتم اختياره؟

قاعدة المنتج المعتمدة عند نهاية الشيت هي:

> إذا كان Clipboard يحتوي 4,000 قيمة والمتاح 200 صف فقط، نلصق 200 فقط ولا نزيد عدد صفوف الشيت.

Univer Native خالف القاعدة:

- قبل Paste: **100,001** total rows (100,000 data + header).
- بعد Paste: **103,801** total rows.
- أي أنه أضاف **3,800 صف** لإكمال الـ4,000 قيمة.

كان يمكن بناء workaround في الـERP لاعتراض العملية، لكن هذا يعني كودًا إضافيًا حول سلوك أساسي بينما المنافس الآخر وافق سلوك المنتج بصورة أبسط.

**النتيجة:** Univer خرج من المنافسة، ولا يوجد سبب حالي لاستكمال Gate ERP عليه.

---

## 7. RevoGrid Community 4.25.2 — المحرك المختار

**الحالة:** Selected replacement target / Not yet production-integrated.

### النسخة

**RevoGrid Community 4.25.2**

- الـLab والـbaseline مربوطان بهذه النسخة تحديدًا.
- لا نستخدم `latest` في التطبيق.
- قبل cutover النهائي: self-host/package exact 4.25.2 داخل deployment assets والاحتفاظ بترخيص MIT.

### لماذا اختير؟

لأنه حقق متطلبات Work Orders الأساسية على 100,000 صف مع نتيجة أبسط وأخف من البدائل التي تم اختبارها.

الـFrozen Baseline الرسمي:
`wwwroot/grid-shootout/REVOGRID_FROZEN_BASELINE_2026-08-20.json`

### 100k Core baseline

- Rows: **100,000**.
- Whole Basket selection: PASS.
- Guided heavy scroll: PASS.
  - Scroll events: 199.
  - Worst long task: 53ms أثناء القياس الموجه.
  - Worst frame: 83.4ms أثناء القياس الموجه.
- Sort: PASS.
- Filter: PASS — 12,500 NeedLicense ثم 100,000 بعد reset.
- Paste 5,000: PASS.
- End-of-sheet 4,000→available 200: PASS بدون زيادة الصفوف.

Frozen session metrics:

- Long tasks: 7.
- Long task total: 523ms.
- Long task max: 104ms.
- Heap: ≈27.9MB.
- DOM nodes: 630.

### ERP behavior gates

- Edit + Dirty + Undo/Redo + Save + Undo/Redo after Save: PASS.
- Paste 5,000 كعملية History واحدة: PASS.
- Readonly: PASS.
- Delete/Undo/Redo 1,000 rows: PASS.
- Custom Column add/Undo/Redo: PASS.
- Split selection stability: PASS — 4/4.
- RTL + scroll: PASS.
- Browser Zoom:
  - Native selection loss ظهر مرة في Gate 4I عند 90%.
  - ERP selection-preserve Gate 4J نجح عند 90→80→67→100.
  - وفي Gate 4J نفسه كان الـrange موجودًا حتى قبل restore في كل المستويات، لذلك الـnative loss لم يكن reproducible باستمرار.
- القرار العملي: الاحتفاظ بطبقة selection-preserve صغيرة وآمنة عند zoom/viewport change.

### لماذا هو الاختيار الحالي؟

لأنه حتى الآن يعطي:

- سلوك Excel-like المطلوب.
- 100k headroom.
- أقل ضغط ذاكرة من Univer في الاختبارات.
- end-of-sheet Paste يطابق قاعدة المنتج.
- Split/RTL/Zoom قابلين للضبط بدون إعادة بناء Grid.
- كمية أقل من workarounds المتوقعة مقارنة بمواصلة Tabulator.

---

## 8. ما الذي لم يحدث بعد؟

اختيار RevoGrid **ليس Cutover**.

`/work-orders` الحقيقي ما زال Tabulator 6.5.0.

الانتقال المعتمد:

### Gate 5A — Real Blazor/Data Integration

- Route منفصل.
- RevoGrid 4.25.2.
- نفس real employee/year read path.
- Core + Custom Columns.
- لا Save destructive.
- لا تغيير لـ`/work-orders`.

### Gate 5B — Real Save/ERP Behavior

- Dirty/Delta Save.
- Validation.
- Authorization.
- RowVersion.
- temporary → saved identity.
- Undo/Redo after Save.
- Custom Column/Layout persistence.

### Gate 5C — Visual + Regression + Cutover

- نفس الأحجام المجمدة.
- Split / RTL / Zoom.
- full regression.
- pinned/self-hosted package + MIT license.
- controlled switch of `/work-orders`.

**Tabulator لا يُحذف قبل نجاح Gate 5C وقبول checkpoint مستقل.**

---

## 9. القاعدة من الآن

أي تغيير تقني كبير يضاف هنا وقت اتخاذ القرار باستخدام نفس النموذج:

1. التقنية/النسخة.
2. لماذا اخترناها.
3. ما الذي نجح فيها.
4. ما المشكلة التي ظهرت.
5. هل المشكلة في المنتج أم في Test Harness.
6. لماذا استمرينا أو خرجنا منها.
7. ما Evidence/Benchmark الذي دعم القرار.
8. ما Rollback path.
9. هل التغيير محرك Feature فقط أم تغيير Architecture.

بهذا لا تصبح الوثائق مجرد وصف للحالة الحالية؛ تصبح **ذاكرة هندسية تشرح كيف ولماذا وصل المشروع إلى حالته الحالية**.
