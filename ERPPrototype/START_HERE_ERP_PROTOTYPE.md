# CURRENT HANDOFF — 2026-08-30 — POST V4R3

This is the newest handoff. Older handoffs remain historical when they conflict.

**Accepted Revo checkpoint:** `0e7a6be512f92fe076f21261b86da5079897d48e`
**Current Revo route:** `/work-orders-revogrid-gate5b11`
**Current milestone:** Gate 5B-11 + Selection Core V4R3
**Next mission:** Real DB Save

## Current state

- Gate 5B-11 snapshot-safe Save handshake is accepted.
- Selection Core V4R3 is accepted.
- Rows remain identified by `ClientKey`.
- Columns remain identified by `prop`.
- Revo remains owner of native focus, range, editing and virtualization.
- ERP owns semantic row/column selection identity.
- Filter, Sort and Structure movement preserve the intended selected identity.
- Revo native range is resynchronized when a still-selected item changes visible position.
- rapid Ctrl interaction is protected from stale asynchronous range updates.
- no parallel cell-selection engine was introduced.
- no production database Save exists yet.

## Acceptance evidence

- Build PASS.
- Gate 5B-10 browser journey PASS.
- Gate 5B-11 Save browser journey PASS.
- Full B9 -> B11 regression PASS.
- manual V4R3 browser verification PASS.

## Next engineering sequence

Real DB Save
-> RowVersion concurrency and failure recovery
-> database-connected custom structure persistence
-> production qualification
-> controlled Revo cutover

---

# CURRENT HANDOFF — 2026-08-30

> This is the newest handoff. Older handoffs below are historical when they conflict.

**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**B10 starting baseline:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**Live Work Orders:** Tabulator 6.5.0 until accepted Revo cutover.
**Selected target:** RevoGrid Community 4.25.2.
**Current isolated Revo route:** `/work-orders-revogrid-gate5b10`.
**Current stable Revo milestone:** Gate 5B-10 Header Selection.
**Next bounded mission:** snapshot-safe Save contract, then real DB Save and concurrency/recovery.

## What Gate 5B-10 added

- Plain/Ctrl/Shift whole-row and whole-column selection.
- row identity is `ClientKey`; column identity is `prop`.
- Revo remains owner of native cell focus/range, keyboard/editing and virtualization.
- the ERP extension is registered through `grid.plugins`; it uses Revo render hooks and public APIs instead of a DOM-scanning painter or Revo source patch.
- Revo native range is kept in sync with the active contiguous row/column portion through `setCellsFocus(...)`; ERP semantic state holds the identity-based whole-row/whole-column selection needed for Ctrl behavior.
- Filter prunes rows that leave the current result and clearing the Filter does not silently reselect them.
- Sort preserves selected Work Order identity; Scroll/virtualization preserves and repaints visible selection.
- right-click inside selection preserves it; right-click outside uses the clicked target.
- year/dataset switch clears semantic selection.
- disjoint Ctrl multi-cell ranges remain postponed.

## Acceptance evidence

- `dotnet build` — PASS.
- Gate 5B-9 Structure Workspace real-browser regression — PASS.
- Gate 5B-10 Header Selection real-browser journey — PASS for native range, Rows, row context, Sort identity, Filter pruning, row virtualization, Columns, column context and dataset switch.
- user manual browser verification — PASS on 2026-08-30, including Ctrl/Shift, Sort, Filter, Scroll, Right-click and RTL header/data alignment.
- B10 acceptance asserts employee-visible rendered state; internal Revo/provider state is supplemental evidence only.

## Current engineering sequence

```text
Stable Gate 5B-10 checkpoint
→ snapshot-safe Save contract
→ real DB Save
→ RowVersion concurrency / Save failure recovery
→ high-value production parity
→ production qualification
→ controlled cutover
```

## Read first

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/47_GATE5B10_ACCEPTANCE_2026-08-30.md`
3. `Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`
4. `Documentation/03_CURRENT_IMPLEMENTATION.md`
5. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
6. `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
7. `Documentation/08_DECISIONS_LOG.md`
8. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
9. `Documentation/09_REFACTOR_ROADMAP.md`

---

# CURRENT HANDOFF — 2026-08-29

> This is the newest handoff. Older handoffs below are historical when they conflict.

**Current accepted Git HEAD:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**14-review / Final Lead Review baseline:** `a74c9c908a2372b0e9141dcf7f6ef772bd6c07b3`
**Live Work Orders:** Tabulator 6.5.0 until accepted Revo cutover.
**Selected target:** RevoGrid Community 4.25.2.
**Current isolated Revo route:** `/work-orders-revogrid-gate5b9`.
**Current stable Revo milestone:** Gate 5B-9 Structure Workspace, including the Gate 5B-7 persistence-identity foundation and Gate 5B-8 selection-context foundation.
**Next bounded Grid mission:** rebuild Gate 5B-10 selection behavior cleanly from the B9 checkpoint; no rejected B10 experiment is part of this baseline.

## What B7-B9 added

- **Gate 5B-7 — Persistence Identity:** keeps `ClientKey`, database `Id`, and `RowVersion` identity stable through temporary row deletion and Undo/Redo. This is a client persistence-identity foundation; real database Save is still not connected to the Revo route.
- **Gate 5B-8 — Selection Context:** right-click inside an existing range/whole-column selection preserves its meaning; right-click outside targets the clicked location. A whole-column selection is not interpreted as permission to operate on every source row.
- **Gate 5B-9 — Structure Workspace:** one neutral Rows/Columns context menu; explicit Insert count/direction; selection-aware row/custom-column delete with safe Current-vs-Selection scope; custom-column Insert/Delete in Sheet History; single-cell clipboard fill across a selected range.
- Year/dataset switch clears selection because it replaces the Work Orders dataset.

## Approved selection/filter rule for the next mission

This is an **approved behavior contract, not yet implemented at `202cf3f`**:

- Scroll does not remove selection.
- Sort preserves selection by Work Order identity.
- If Filter removes a row from the current result, that row leaves row selection immediately and does not become selected again merely because the filter is later cleared.
- A new sheet mutation that resolves row/cell targets (for example Delete, Clear, Paste, or a structural row action) must intersect its target with the current filtered result as a final safety check.
- A change that was legitimately made while a row was visible remains dirty and Save may persist it even if a later Filter hides that row.
- Undo/Redo continues to describe the earlier logical operation; Filter visibility must not corrupt History semantics.

## Gate 5B-10 architecture boundary

- Revo remains owner of native cell range, focus, keyboard, editing, and virtualization.
- ERP may add only the missing semantic row/column selection behavior needed by the product, including Ctrl/Shift row/column selection.
- Do not create a second full selection engine, DOM repaint scanner, or clear Revo focus merely to simulate selection.
- Disjoint Ctrl multi-cell ranges are postponed; they require complete Copy/Paste/Delete/Undo semantics before adoption.
- Future tests must prove visible employee behavior under virtualization, not only internal selection-store state.

## Read first

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`
3. `Documentation/03_CURRENT_IMPLEMENTATION.md`
4. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
5. `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
6. `Documentation/08_DECISIONS_LOG.md`
7. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
8. `Documentation/09_REFACTOR_ROADMAP.md`
9. `Documentation/46_FINAL_LEAD_REVIEW_2026-08-26.md`

## Current engineering sequence

```text
Stable B9 checkpoint
→ clean B10 row/column selection extension
→ persistence Save contract
→ real DB Save
→ concurrency / failure recovery
→ high-value production parity
→ production qualification
→ controlled cutover
```
---

# CURRENT HANDOFF — 2026-08-26

> This is newest handoff. Older handoffs below are historical when they conflict.

**Current accepted Git HEAD:** `6a6f3cef807f58a41bcfefa7c08b2ebaf6220169`
**14-review / Final Lead Review baseline:** `a74c9c908a2372b0e9141dcf7f6ef772bd6c07b3`
**Live Work Orders:** Tabulator 6.5.0 until cutover.
**Selected target:** RevoGrid Community 4.25.2.
**Current isolated Revo route:** `/work-orders-revogrid-gate5b6`.
**Latest accepted grid milestone:** Gate 5B-6 Unified Validation at `6a6f3ce`, after automated real-browser regression and user manual acceptance.
**Next major Revo product step:** persistence identity/`RowVersion`, then snapshot-safe Save contract and real DB Save.

## Read first

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/15_BUSINESS_DOMAIN_AND_PERMISSIONS.md` — **do not re-ask settled Business questions before reading this**
3. `Documentation/46_FINAL_LEAD_REVIEW_2026-08-26.md`
4. `Documentation/03_CURRENT_IMPLEMENTATION.md`
5. `Documentation/08_DECISIONS_LOG.md`
6. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
7. `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
8. `Documentation/09_REFACTOR_ROADMAP.md`

## Product north star

```text
Fast Master Work Orders Sheet
        ↓
One trusted Work Order
        ↓
Specialist departments work on their own part
        ↓
Managers see exceptions/risks/actions
```

## Business decisions now settled

See `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

Do not reopen without new conflicting business evidence:

- one-time Partial Invoice.
- Final Invoice = Work Order Value - Partial.
- Final/Remaining does not zero after final approval.
- operational + financial closure.
- BranchManager-only Reopen.
- downstream interaction definition.
- BranchManager-only identity/delete after downstream interaction.
- ProjectManager global read-only.
- flexible Basket / no rigid blocking State Machine.
- year move requires confirmation.

## Current engineering direction

```text
Persistence identity / RowVersion
→ Snapshot-safe Save
→ Real DB Save
→ Concurrency / failure recovery
→ important parity
→ production qualification
→ cutover
→ Operational ERP foundation
```

Tabulator is now a behavior-reference source during migration, not long-term design authority.

---

# CURRENT HANDOFF — 2026-08-22

> **هذا هو ملخص البدء الأحدث.** أي Handoff أقدم أسفل الملف يبقى تاريخيًا عند التعارض.

**Latest reviewed Git HEAD:** `04e0f1a`
**Current `/work-orders` engine:** Tabulator 6.5.0 — ما زال live/fallback.
**Current Revo target:** RevoGrid Community 4.25.2 on `/work-orders-revogrid-gate5b5`.
**Revo state:** Edit/Paste/History/Dirty/Filter/Sort/Header Selection/Insert-Delete/Remaining sync موجودة في المسار المعزول؛ real database Save/cutover غير منفذ بعد.
**Approved next product behavior:** `DEC-040` soft working-sheet Validation؛ التنفيذ لم يبدأ بعد.
**Current engineering foundation task:** Project Brain V1 + `PartialAmount` Change Mapper Canary قبل الاعتماد على Agent routing.

## اقرأ أولًا الآن

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/03_CURRENT_IMPLEMENTATION.md`
3. `Documentation/08_DECISIONS_LOG.md`
4. `Documentation/AI_AGENT_WORKFLOW_V3.md`
5. `Documentation/brain/README.md`
6. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md` عند أي Work Orders behavior change
7. `Documentation/06_REGRESSION_TEST_CHECKLIST.md` قبل إغلاق أي تغيير

---

# CURRENT HANDOFF — 2026-08-20

> **هذا القسم هو الحالة الحالية المعتمدة.** أي خطة أقدم أسفل الملف تُعامل كتاريخ إذا تعارضت مع هذا القسم أو مع `Documentation/12_ENGINEERING_AUDIT_REPORT.md`.

**Audit baseline:** `00503ab`
**Current production runtime baseline retained:** `0f6bd3b` — accepted financial-sort optimization
**Latest reviewed Git HEAD:** `dc0b2b0` — `Checkpoint before Univer Gate U1`
**Current source ZIP reviewed:** `ERPPrototype_Current_Review_2026-08-20.zip`
**Current `/work-orders` engine:** Tabulator 6.5.0 — still the live implementation.
**Selected replacement engine:** **RevoGrid Community 4.25.2** — selected after isolated 100,000-row and ERP-behaviour qualification; not yet integrated into `/work-orders`.
**Current task:** **Gate 5A — isolated Blazor + RevoGrid real-data integration. No production cutover yet.**

## Grid-engine decision

- RevoGrid Community 4.25.2 is the selected target for Work Orders.
- The decision changes the grid engine only; it does **not** reopen the ASP.NET Core / Blazor Server / EF Core / SQL Server architecture.
- Univer is no longer a finalist. It passed normal 5,000-value Paste, but its native end-of-sheet behavior expanded the sheet from 100,001 to 103,801 rows when only 200 rows were available for a 4,000-value Paste.
- RevoGrid passed the accepted isolated 100k core gate and the ERP behavior gates: selection, heavy scroll, sort/filter, 5,000 Paste, end-of-sheet truncation, session Undo/Redo including after Save, readonly, 1,000-row delete/restore, custom columns, Split, RTL and Zoom-preserve.
- RevoGrid must be pinned to **4.25.2**. Final application runtime must not depend on `latest`.
- Before production cutover, vendor/self-host the exact package and its MIT license inside the project/deployment assets instead of relying on a CDN.

## قواعد الانتقال

- لا تغيير للأحجام المجمدة.
- لا Offline الآن.
- لا نعيد بناء Work Orders من الصفر.
- لا ننقل Tabulator-specific hacks حرفيًا إلى RevoGrid؛ ننقل **سلوك المنتج** فقط باستخدام RevoGrid public APIs قدر الإمكان.
- `WorkOrderService`, `WorkOrderQueryService`, `WorkOrderSavePlanBuilder`, RowVersion, SQL uniqueness and transaction authority remain the server foundation.
- Tabulator remains the fallback/current `/work-orders` implementation until RevoGrid passes real-data Blazor integration, Save/Delta integration, visual parity and the full regression gate.
- لا Patch أداء جديد على Tabulator لمجرد تحسينه أثناء الهجرة إلا إذا كان ضروريًا لحماية الاستخدام الحالي قبل cutover.

## اقرأ أولًا

1. `Documentation/12_ENGINEERING_AUDIT_REPORT.md`
2. `Documentation/08_DECISIONS_LOG.md`
3. `Documentation/13_TECHNOLOGY_EVOLUTION.md` — لماذا انتقل المشروع بين التقنيات
4. `Documentation/00_DOCUMENTATION_INDEX.md`
5. `Documentation/03_CURRENT_IMPLEMENTATION.md`
6. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
7. `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
8. `Documentation/42_HANDOFF_2026-08-17_PERFORMANCE_RECONCILIATION.md` — historical pre-grid-selection handoff

---

# START HERE — ERP Prototype

> تحديث 2026-08-12: أمر التحقق الآلي المعتمد الوحيد هو `Tools/Invoke-ERPTests.ps1`. مراجع أدوات Phase 8/Phase 9 القديمة في الأقسام التاريخية أدناه للتوثيق فقط؛ الأدوات القديمة أزيلت من شجرة المصدر. آخر تحقق مقبول: Integration `25/25` وSmoke Browser `11/11`.


**الحالة:** مرجع البدء الحالي
**آخر تحديث:** 2026-08-05
**نقطة الكود المقبولة:** `Phase 9.3D` — Build وMigration ناجحان واختبارات SQL Server `25/25`
**الخطوة الحالية:** `Phase 9.3E` — فلاتر وترتيب وإخفاء الأعمدة المخصصة بأقل حمل على المتصفح والسيرفر
**جاهزية الإنتاج:** غير جاهز لعميل حقيقي قبل استكمال الصلاحيات والتشغيل والأمان والنسخ الاحتياطي واختبارات الشبكة

## اقرأ بالترتيب

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/01_PROJECT_CONTEXT.md`
3. `Documentation/03_CURRENT_IMPLEMENTATION.md`
4. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
5. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
6. `Documentation/10_RELEASE_READINESS_PLAN.md`

## ما هو المشروع؟

نظام ويب لمتابعة أعمال شركات المقاولات المتعاملة مع الشركة السعودية للكهرباء أو جهات مشابهة. النظام لا يستبدل الأنظمة الرسمية؛ بل يجمع المتابعة الداخلية لأوامر العمل والمراحل والتأخير والإنتاجية بدل ملفات Excel المتفرقة.

## التقنية الموجودة فعليًا

- Blazor Web App بنمط Interactive Server.
- ASP.NET Core Identity.
- Entity Framework Core 10 وSQL Server/LocalDB/Azure SQL.
- Tabulator 6.5 لشيت أوامر العمل.
- Modular Monolith تدريجي داخل مشروع واحد.

لا توجد Syncfusion في تنفيذ شيت أوامر العمل الحالي، وخطة Power Apps القديمة ليست الاتجاه الحالي.

## أهم قواعد أوامر العمل

- الزوج `WorkOrderNumber + WorkTypeCode` فريد عالميًا عبر الشركة وكل السنوات.
- فهرس القراءة يعتمد على `DepartmentId + WorkYear + DisplayOrder`.
- موظف القسم يعدّل داخل قسمه فقط.
- `RowVersion` يمنع الكتابة فوق تعديل أحدث.
- الحفظ يدعم الإضافة والتعديل والحذف ونقل السنة داخل Transaction واحدة.
- حذف أمر مرتبط بموديول آخر سيُمنع عند تنفيذ تلك الموديولات.

## ما الذي يعمل الآن؟

- تسجيل الدخول دون تسجيل عام.
- حساب Admin واحد وأدوار `ProjectManager` و`BranchManager` و`Employee`.
- إنشاء الفروع والأقسام الأربعة الثابتة.
- شيت أوامر العمل لموظف القسم حسب السنة.
- التعديل المباشر، البحث، الفلاتر، Copy/Paste، إدراج وحذف الصفوف، Undo/Redo، والحفظ التفاضلي.
- منع التكرار العالمي، اكتشاف تعارض الجلسات، ونقل الأمر للسنة المطابقة لتاريخ الإسناد.
- فصل وحدات JavaScript الكبيرة إلى مالكي Validation وHistory وStructure وLifecycle وInteractions وDirty State.
- فصل قراءة السيرفر في `WorkOrderQueryService`.
- فصل التطبيع والتحقق وتجهيز الحفظ في `WorkOrderSavePlanBuilder`.
- 10 اختبارات آلية لمسار الحفظ على قاعدة SQL Server مؤقتة ومعزولة.
- مشروع `ERPPrototype.E2ETests` مقبول بعد نجاح أول رحلة متصفح آلية `4/4` على تطبيق وقاعدة مؤقتين.

## ما الذي لم يكتمل كمنتج؟

- صفحات وصلاحيات التشغيل الكاملة لـBranchManager وProjectManager.
- إدارة حسابات الفرع وإعادة تعيين كلمة المرور.
- Excel Import/Export.
- المستودع والفواتير والمراحل المالية.
- Dashboard والتقارير النهائية.
- Audit Log وClient error reporting والنسخ الاحتياطي ومراجعة إعدادات Production.
- تغطية متصفح آلية شاملة للحفظ والنسخ واللصق وUndo/Redo وبقية الرحلات؛ Phase 9.0 يغطي الأساس فقط.
- اختبار 10,000 صف وشبكة الشركة.

## حالة التنظيم

- Phase 8.1–8.7: فصل الصفحة، التحقق، History، Structure، Lifecycle، Interactions، رحلة الحفظ، وDirty State — مكتملة ومختبرة.
- Phase 8.8-R1: فصل استعلامات القراءة — مكتملة ومختبرة.
- Phase 8.8-R2A: شبكة أمان SQL Server — مكتملة ونجحت 6/6.
- Phase 8.8-R2: فصل Save Plan — مكتملة ونجحت الشبكة الموسعة 10/10.
- لا توجد R3 أو R4 إضافية لـ`WorkOrderService` الآن. أي Refactor جديد يحتاج مشكلة فعلية مثبتة.

## حالة Phase 8.9

Phase 8.9 مقبولة ومغلقة. دليل القبول: Release Build PASS، اختبارات الحفظ 10/10، Git hygiene PASS، ونسخة مصدر نظيفة 3.06 MB. لا يوجد Refactor إضافي مخطط له بدون مشكلة أو ميزة تثبت الحاجة.

## Phase 9.0 — أساس اختبارات المتصفح

المرحلة مقبولة على جهاز التطوير بعد أن أضافت مشروعًا مستقلًا يشغّل نسخة محلية من التطبيق على منفذ عشوائي وقاعدة SQL Server مؤقتة، ثم يستخدم Playwright لتنفيذ:

```text
Login → فتح شيت الموظف → التأكد من الفرع والقسم → عرض السنة الحالية → تغيير السنة → عرض بيانات السنة المختارة
```

لرؤية المتصفح أثناء الاختبار من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

التشغيل ينفذ أيضًا اختبارات الحفظ العشرة أولًا. دليل القبول المسجل:

```text
Result: 10/10 passed.
Result: 4/4 browser checks passed.
Phase 9.0 automated foundation verification: PASS
```

في أول تشغيل فقط قد يتم تنزيل Chromium إلى Browser Cache الخاص بالمستخدم. التنزيل ليس داخل المشروع ولا يدخل ZIP المصدر.


## Phase 9.0B — Browser Automation Hardening

المرحلة الحالية لا تضيف ميزة أعمال. هدفها تحويل الرحلة الأولى إلى منصة قابلة للتوسع عبر:

- `data-testid` ثابت لعناصر Login والشيت الأساسية.
- Page Objects مشتركة لـLogin وWork Orders بدل selectors موزعة.
- انتظار صريح لـBlazor وTabulator قبل بدء التفاعل.
- وضعي `Smoke` و`Full`، مع Full افتراضيًا.
- Screenshot وTrace وDiagnostics عند الفشل، وصورة نجاح عند القبول.
- الاحتفاظ بآخر 10 نتائج فقط وتنظيف الأقدم.
- أمر دائم واحد: `Tools/Invoke-ERPTests.ps1`.

التشغيل المرئي الكامل من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

القبول يتطلب اختبارات SQL `10/10` وBrowser Full `9/9`. بعد ذلك تبدأ Phase 9.0C لتغطية تعديل وحفظ وإضافة وحذف وUndo/Redo في الشيت الحالي.

## ما بعد Phase 8

الترتيب المقترح للميزات:

1. إكمال شيت أوامر العمل: الأعمدة المالية والإجماليات.
2. الفلاتر والترتيب وحفظ أحجام الأعمدة.
3. استكمال الأعمدة المخصصة والنصوص الطويلة وتسريع Auto-scroll.
4. صلاحيات وتجربة BranchManager وProjectManager.
5. إدارة حسابات الفرع.
6. Excel Import/Export، ثم المستودع والفواتير.

## قاعدة تسليم الملفات

- تعديل بسيط في ملف واحد: تعليمات مباشرة.
- تعديل كبير أو حساس: ZIP Patch.
- نقطة مراجعة كبيرة: يجوز تسليم نسخة مصدر كاملة نظيفة.
- لا تُرسل ملفات `bin` أو `obj` أو `.vs` أو `*.user` أو ملفات تنفيذ ومكتبات مبنية.
- استخدم `Tools/New-CleanProjectArchive.ps1` عند تجهيز المشروع للرفع.

### Current candidate: Phase 9.2D2

- Observe mode and every artificial Playwright delay were removed.
- Functional Stress remains a 55-check correctness journey and no longer claims
  to be the quantitative performance baseline.
- Year switching now waits for the requested dataset identity, count, and
  aggregate readiness before scrolling.
- The neutral Performance suite traverses the same sheet to its end region and
  compares cold versus long-session input-to-paint latency.
- A full headless performance matrix is available for Arrow, Enter, and Wheel
  with 1,000, 5,000, and 10,000 rows per year.

Acceptance order:

1. `Invoke-ERPTests.ps1 -Suite Stress` must return Integration 26/26 and Browser 56/56.
2. Run the 1,000-row Arrow baseline and inspect its JSON.
3. Run Enter and Wheel separately.
4. Expand to 5,000 and 10,000 rows, or run the full matrix.
