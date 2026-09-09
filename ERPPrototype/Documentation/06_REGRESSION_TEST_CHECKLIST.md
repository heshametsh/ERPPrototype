# ACCEPTANCE / REGRESSION OVERRIDE - 2026-09-04 - B12 + GATE 5C-1

**Accepted product checkpoint:** `bdc37fe`

The Employee Real Workday Master passed scenarios 00-17 on the official branch, including Selection, Sort/Filter identity, Clipboard/History, Structure, visible aggregates, Custom Money, validation, SQL Save, snapshot isolation, new-row Save, persisted Delete, cross-year Save, 1,200 real range edits, concurrency rejection and Arabic UI corruption guard.

## Permanent regression guards preserved from retired Gate manifests

When the related modules are changed, keep these historical failure modes explicitly protected:

- Arabic keyboard layout must not break Ctrl+Z/Ctrl+Y; physical `KeyZ`/`KeyY` recognition remains layout-independent.
- one physical Ctrl+Z/Ctrl+Y must replay at most one History transaction even when Revo renders multiple selection overlays.
- Undo/Redo must not scroll when the target is already visible; off-screen reveal uses minimum movement only.
- filter-popup typing must stay inside the popup and must not navigate/edit the grid underneath it.
- header-body selection, Filter and Sort remain separate interactions; hidden rows are excluded from whole-column selection.
- Sort must not auto-scroll after a selected Work Order that moves outside the viewport.
- re-applying unchanged Filter criteria must re-evaluate a changed working snapshot and create History only when visible membership changes.
- Filter Search changes pending checkbox selection only; no-match Search disables Apply and typing alone does not filter the grid.
- Insert/Delete must resolve stable `ClientKey` identities and preserve explicit multi-row command semantics.
- Remaining Amount remains derived/readonly and never creates a separate Dirty/History/Save field.

Root-cause and fix details are preserved in `51_REVO_GATE_BUG_HISTORY_2026-09-04.md`.

---

# ACCEPTANCE OVERRIDE — 2026-08-30

## Gate 5B-10 accepted Revo checkpoint

**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**Route:** `/work-orders-revogrid-gate5b10`

Acceptance evidence completed before checkpointing:

- `dotnet build` PASS.
- Gate 5B-9 Structure Workspace real-browser regression PASS.
- Gate 5B-10 Header Selection real-browser journey PASS.
- user manual browser verification PASS on 2026-08-30.

Gate 5B-10 real-browser scenarios:

1. ordinary Revo native cell focus/range remains functional.
2. visible Plain/Ctrl/Shift whole-row selection.
3. right-click inside row selection preserves it.
4. Sort moves a selected Work Order while the same `ClientKey` remains selected.
5. Filter removes hidden row selection and clearing the Filter does not restore it.
6. selected Work Order repaints correctly after virtualization/scroll.
7. visible Plain/Ctrl/Shift whole-column selection.
8. right-click inside column selection preserves it.
9. year/dataset switch clears semantic selection.

**Regression rule:** Gate 5B-9 remains mandatory with B10 because B10 must not break Structure Workspace, Selection-scoped delete, Custom Column History or range-fill Paste.

**Visual rule:** B10 PASS requires rendered cells/headers to show the selection after virtualization. Internal Sets, `getSelectedRange()` or private/provider state cannot independently claim PASS.

---

# ACCEPTANCE OVERRIDE — 2026-08-29

## Current stable Revo checkpoint

**Git:** `202cf3f831609b6bfb7a74c79d3f200842cd7eb4`
**Route:** `/work-orders-revogrid-gate5b9`

The repository contains dedicated browser gates for:

- Gate 5B-7 persistence identity, including exact persisted delete `Id`/`RowVersion` through Undo/Redo.
- Gate 5B-8 selection context, including whole-column context/right-click semantics.
- Gate 5B-9 Structure Workspace.
- Gate 5B-9 runner scenarios: menu scope, selection preservation, explicit row insert count + one Undo/Redo, filtered whole-column row-delete scope, batch Custom Column insert/delete + History, and range-fill Paste + one Undo.

The stable B9 checkpoint remains the base for the next selection work. Rejected B10 experiments are not acceptance evidence.

## Gate 5B-10 acceptance requirements

A clean B10 candidate is not accepted merely because internal Sets or Revo stores contain the expected values.

It must prove in a real browser:

- ordinary Revo cell click/drag/keyboard/edit remains unchanged.
- whole-row and whole-column selection is visibly correct across multiple rendered cells.
- Ctrl adds/removes non-adjacent rows/columns without collapsing the other selections.
- Shift creates the contiguous row/column range from the intended anchor; Ctrl+Shift behavior must match the approved contract if implemented.
- Sort preserves the same selected `ClientKey` Work Orders even when their positions move.
- Filter removes filtered-out Work Orders from row selection; clearing the Filter does not silently reselect them.
- Delete/Clear/Paste/structural row actions cannot affect a row outside the current filtered result even if stale semantic selection state somehow exists.
- Scroll/virtualization preserves selection; after scrolling a selected Work Order/column back into the rendered viewport, its visible selected state is correct.
- right-click inside selection preserves it; right-click outside uses the clicked target.
- year/dataset switch clears selection.
- Undo restores data/history meaning, not an old selection snapshot unless a feature explicitly defines otherwise.
- no intrusive inner active-cell marker is shown for larger whole-row/whole-column/multi selections if it can be hidden without breaking Revo focus/edit behavior.
- browser console/page errors, failed required requests and HTTP 5xx remain zero.

## Test-design rule added after B9 review

`Gate5B9StructureRunner.IsWholeColumnSelectedAsync` uses `getSelectedRange()` and Revo selection-provider state as part of its assertion. That is useful diagnostic evidence, but it is **not sufficient for B10 visual selection acceptance**.

B10 tests must scroll the target into view and assert employee-visible rendered state across multiple cells/headers. Internal/provider diagnostics may remain supplemental.
---

# ACCEPTANCE OVERRIDE — 2026-08-26

## Real-browser rule for important Grid behavior

For important Work Orders Grid behavior, isolated JS/self-tests are support evidence, not final acceptance.

The following require a real-browser journey before being called ready:

- Paste.
- Range Clear / Delete / Backspace.
- Undo/Redo.
- Insert/Delete Rows.
- Validation.
- Save.
- Filter/Sort interactions.
- selection/focus behavior when employee-visible.
- concurrency/recovery journeys where browser state matters.

## Required failure evidence

A real-browser gate should capture, when relevant:

- screenshot.
- Playwright trace.
- browser event timeline.
- console/page errors.
- failed requests / HTTP 5xx.
- Revo state diagnostics.
- server/database evidence for Save flows.

## PASS rule

A gate must not claim PASS while critical browser diagnostics contain an uncaught page error, critical console error, failed required request, or related HTTP 5xx.

Where structural operations are tested, assert exact row identity/`ClientKey` changes where possible; count-only assertions are insufficient when the wrong rows could be affected.

## Overall verification

The command/process allowed to claim an overall active-candidate PASS must include the currently required Revo candidate journey; old production Tabulator suite alone does not stand in for Revo acceptance.

## Gate 5B-6 accepted evidence — 2026-08-26

At `6a6f3ce`, Unified Validation passed:

- self-tests including 10k/incremental validation coverage;
- hardened real-browser validation assertions;
- full Gate 5B-6 regression for Range Clear, Undo/Redo, row structure, filter and sort;
- user manual browser acceptance.

Next acceptance focus is persistence identity/`RowVersion` and Save behavior.


---

# 06 — Regression Test Checklist

> **Current reconciliation 2026-08-20:** `/work-orders` still uses Tabulator 6.5.0, while RevoGrid Community 4.25.2 is the selected replacement target. Preserve the current accepted runtime until RevoGrid passes isolated Blazor real-data, Save/Delta, visual, and full regression gates. Do not treat Lab PASS as production cutover.

> **Scope rule:** before a mission includes or excludes Tabulator, inspect the current `/work-orders` runtime and dependency path. Tabulator remains in scope when that path proves it is active; it is not the design authority for new RevoGrid work.

> تحديث 2026-08-12: استخدم `Tools/Invoke-ERPTests.ps1` للتحقق الحالي. أوامر Phase 8/Phase 9 القديمة الواردة في أقسام تاريخية لم تعد موجودة. آخر تحقق مقبول: Integration `25/25` وSmoke Browser `11/11`.

**Status:** Mandatory after any grid/runtime change
**Historical foundation checkpoint:** `M5D4R3-Stable-Range-UX` (E6C). **Current accepted checkpoint:** `0f6bd3b` per captured Git log.
**Rule:** لا ننتقل للخطوة التالية إذا فشل اختبار أساسي.

## Current engineering acceptance

- [ ] Start from a known Git checkpoint and record the exact HEAD.
- [ ] Run the deterministic/self-tests relevant to the changed responsibility.
- [ ] Important employee-visible Grid behavior passes its real-browser journey with failure evidence enabled.
- [ ] After automated PASS, the user performs the short manual browser test for the changed behavior.
- [ ] Commit/push occurs only after the candidate is stable and accepted.

The former Native V1 workflow checks are historical and are not active acceptance gates.

## A. Before Testing

- [ ] المشروع عاد إلى Git checkpoint معروف.
- [ ] `Clean Solution` ثم `Rebuild Solution` نجحا.
- [ ] لا توجد Compiler errors.
- [ ] افتح Developer Tools > Console.
- [ ] استخدم بيانات تجريبية فقط.
- [ ] سجل اسم النسخة/الـcommit والتاريخ.

## B. Login and Access

- [ ] Admin يستطيع تسجيل الدخول.
- [ ] Employee يستطيع تسجيل الدخول.
- [ ] الحساب غير النشط يُرفض.
- [ ] المستخدم الجديد يُجبر على تغيير كلمة المرور.
- [ ] Employee لا يفتح `/admin`.
- [ ] Admin لا يدخل شيت Employee بالخطأ.
- [ ] لا توجد صفحة تسجيل عام.

## C. Grid Smoke Test — بعد كل تعديل JavaScript

- [ ] افتح `/work-orders`.
- [ ] الصفوف تُحمّل وعددها صحيح.
- [ ] ArrowUp يعمل.
- [ ] ArrowDown يعمل.
- [ ] ArrowLeft يعمل.
- [ ] ArrowRight يعمل.
- [ ] الكتابة المباشرة تعدل الخلية.
- [ ] Double-click يفتح المحرر.
- [ ] Enter داخل المحرر يحفظ القيمة بدون سلوك غير متوقع.
- [ ] الضغط المستمر على Enter خارج المحرر يظل سريعًا بعد الصف 1,040 وحتى الصفوف العميقة.
- [ ] Basket list تعمل.
- [ ] أول كليك يمين قبل أي كليك شمال يفتح القائمة بدون `activeRange.occupies` error.
- [ ] لا يوجد Red Console error.

## D. Selection and Clipboard

- [ ] تحديد خلية واحدة.
- [ ] تحديد نطاق متعدد الصفوف والأعمدة.
- [ ] Copy إلى Excel يعطي القيم الصحيحة.
- [ ] Paste من Excel يبدأ من الخلية المحددة.
- [ ] Paste متعدد الخلايا يمكن التراجع عنه مرة واحدة.
- [ ] Delete/Backspace يمسح النطاق.
- [ ] Undo يعيد النطاق.
- [ ] Redo يعيد المسح.

## E. Rows and History

- [ ] Insert one above.
- [ ] Insert one below.
- [ ] Insert multiple rows.
- [ ] التحديد داخل خلية يكفي؛ لا يشترط الضغط على رقم الصف.
- [ ] Delete one row.
- [ ] Delete multiple selected rows.
- [ ] Cancel deletion leaves rows unchanged.
- [ ] Undo/Redo insert.
- [ ] Undo/Redo delete.
- [ ] بعد Insert/Delete وUndo/Redo لا يظهر `element?.focus is not a function`.
- [ ] الصف الجديد لا يكرر Temporary Id بطريقة تكسر الحفظ.

## F. Validation

- [ ] WO Number أقل/أكثر من 9 أرقام يبقى ظاهرًا كخطأ ويمنع Save حتى التصحيح.
- [ ] Work Type أقل/أكثر من 3 أرقام يبقى ظاهرًا كخطأ ويمنع Save حتى التصحيح.
- [ ] Arabic digits تتحول بصورة صحيحة.
- [ ] Invalid date يبقى ظاهرًا ويظهر خطأ ويمنع Save.
- [ ] Basket خارج القائمة يبقى ظاهرًا كخطأ ويمنع Save.
- [ ] Custom Text أكبر من 250 حرفًا يبقى ظاهرًا كخطأ ويمنع Save.
- [ ] Duplicate pair يعلّم كل الصفوف المتعارضة، وإصلاح/حذف أحدها يزيل الخطأ من الباقي.
- [ ] Previous/Next validation ينتقلان للخلية الصحيحة.

## G. Save

- [ ] حفظ صف جديد.
- [ ] حفظ تعديل.
- [ ] حفظ حذف.
- [ ] حفظ الثلاثة معًا.
- [ ] لا تغييرات يعرض رسالة مناسبة.
- [ ] بعد الحفظ لا يبقى الصف Dirty.
- [ ] Temporary Id يستبدل Database Id بدون صف مكرر.
- [ ] RowVersion يتحدث.
- [ ] Conflict بين جلستين يُمنع ولا يكتب فوق بيانات أحدث.
- [ ] Duplicate race تمنعه قاعدة البيانات.

## H. Year

- [ ] تغيير السنة بدون تعديلات يعمل.
- [ ] تغيير السنة مع تعديلات غير محفوظة يُمنع.
- [ ] بعد الحفظ يمكن تغيير السنة.
- [ ] الرجوع للسنة الأصلية يعرض البيانات الصحيحة.
- [ ] Assignment Date بسنة أخرى يطبق السلوك الحالي ويظهر الرسالة.
- [ ] لا تتكرر listeners بعد عدة تغييرات سنة.

## I. Resize and Viewport

- [ ] اذهب إلى صف عميق مثل 1,500 أو 2,500.
- [ ] سجل أول صف ظاهر.
- [ ] صغر النافذة.
- [ ] كبر النافذة.
- [ ] أول صف ظاهر يبقى نفسه أو أقرب فرق بصري مقبول لا يتراكم.
- [ ] التحديد يظل مرئيًا.
- [ ] الأسهم الأربعة تظل تعمل.
- [ ] لا يقفز الشيت لأول صف.

## J. Performance

### 3,000 rows

- [ ] سجل Initial load time.
- [ ] سجل Tabulator ready time من Console.
- [ ] اختبر البحث.
- [ ] اختبر الفلاتر.
- [ ] اختبر تعديل وحفظ.
- [ ] اختبر ArrowDown من أول الشيت لآخره.
- [ ] اختبر ArrowUp للعودة.
- [ ] اترك الصفحة مفتوحة ثم أعد الاختبار.
- [ ] راقب Memory وLong Tasks.
- [ ] Lifecycle audit mode opens عبر `/work-orders?perf=lifecycle` بدون تغيير سلوك الشيت.
- [ ] تقرير Lifecycle يحتوي `timeSeries30s` و`lifecycleAudit` ولا يحتوي JavaScript errors.

### 10,000 rows

- [x] كرر الاختبارات على بيانات تجريبية.
- [x] لا تعتمد النتيجة لمجرد أن الصفحة فتحت.
- [x] سجل الأرقام وقارنها بالـdatasets الأصغر.
- [x] نفّذ Torture فعليًا: 1,000 تعديل + 1,000 إضافة + 1,000 حذف + mixed Save + year switching + post-torture interaction.
- [x] تحقق من persistence بعد Reload ومن عدم فقد البيانات.
- [ ] **UX comfort acceptance remains open:** financial Sort and dirty bulk operations still show multi-second Long Tasks.
- [ ] كرر أهم سيناريوهات القبول لاحقًا على SEC Edge/network الحقيقي قبل Gate 3.

Latest 2026-08-16 evidence:

- SQL Integration: 25/25 PASS.
- Full Browser: 46/46 PASS.
- 10k Torture: PASS; final active rows 10,000, dirty 0, max rendered DOM rows 60.
- Worst observed Long Task: financial Sort 2.596 s; dirty-interaction 2.247 s; 1,000-row Paste 1.399 s; 1,000-edit Save 1.288 s.
- Functional/capacity survival is therefore proven for this scope, but performance acceptance is intentionally **not closed**.

## K. Reconnection and Azure

- [ ] افصل الشبكة لثوانٍ.
- [ ] Reconnect modal يظهر.
- [ ] الاتصال يعود.
- [ ] لا تضيع تغييرات غير محفوظة بدون تحذير.
- [ ] Azure App Service يبدأ بدون 500.30.
- [ ] سجلات startup وSQL واضحة.
- [ ] Connection String يأتي من Azure settings.
- [ ] اختبار من شبكة الشركة وأجهزتها.

## L. Latest Manual Evidence — 2026-07-27

- Clean/Rebuild: PASS حسب اختبار المستخدم.
- المشروع يعمل محليًا: PASS.
- Enter sustained navigation: PASS.
- First right-click range guard: PASS.
- Connected smoke/regression checks reported by the user: PASS.
- E6F structural focus guard: PASS; no Console errors after Insert/Delete/Undo/Redo/Copy-Paste/Save.
- Provisional navigation baseline recorded from two clean runs; strict three-run median deferred by user decision.
- Automated browser tests: Phase 9.0 foundation passed 4/4; Phase 9.0B hardens selectors, readiness, diagnostics, and Smoke/Full execution before broader grid journeys.

## M. Phase 6 Closure Regression — Required Before New Tag

- [ ] `Clean Solution` و`Rebuild Solution` ينجحان.
- [ ] تحميل شيت حوالي 3,000 صف ينجح وعدد الصفوف صحيح.
- [ ] الأسهم الأربعة وEnter والـWheel يعملون بسرعة مقبولة عمليًا.
- [ ] تحديد نطاق وCopy/Paste وDelete/Backspace وUndo/Redo تعمل.
- [ ] Insert Above/Below وDelete Selected Rows تعمل.
- [ ] حفظ صف جديد وتعديل وحذف، ثم Refresh، يعطي بيانات صحيحة بدون صف مكرر.
- [ ] التكرار العالمي يظهر عبر سنة أخرى.
- [ ] تغيير السنة وResize لا يكسران التحديد أو الأسهم.
- [ ] البحث والفلاتر يعملان بالسلوك الحالي بدون Debounce.
- [ ] Auto-scroll أثناء سحب التحديد يعمل من الصف الأول ومن منتصف الشيت.
- [ ] Console بدون أخطاء حمراء.
- [ ] `/work-orders?perf=lifecycle` يفتح فقط عند الحاجة التشخيصية ولا يغير الوضع الطبيعي `/work-orders`.

إذا نجحت كل البنود، يمكن إنشاء Tag إغلاق Phase 6. إذا فشل بند، لا ننشئ Tag ونصلح العيب المحدد فقط.

## N. Result Record

بعد الاختبار اكتب:

```text
Version/Commit:
Date:
Tester:
Rows:
Passed:
Failed:
Console errors:
Performance numbers:
Decision: Accept / Roll back / Investigate
```

## Simple Example

بعد تعديل Resize لا يكفي أن نجرب التصغير فقط.
لأن Resize يشترك مع Lifecycle والتحديد، نختبر أيضًا الأسهم وتغيير السنة. مثل تغيير باب السيارة: يجب التأكد أن الزجاج والقفل ما زالا يعملان، وليس أن الباب يغلق فقط.


## O. Phase 8.5 — Field-Level and Batch Regression

- [ ] Paste one full non-identity column across about 4,952 rows; the sheet remains responsive after completion.
- [ ] Save that paste; `identityCheckRows` is `0` and `save.server.duplicate-query` does not run.
- [ ] Refresh and confirm only the pasted column changed.
- [ ] Undo and Redo the full-column paste once each; values and dirty count are correct.
- [ ] Clear a full selected column, then Undo and Redo.
- [ ] Edit Work Order Number or Work Type in one row; identity validation runs and a real duplicate is blocked.
- [ ] Edit Assignment Date into another year; only then does the row move to that year after save.
- [ ] Edit Basket only; Work Order Number, Work Type, date, amounts, order, and row identity remain unchanged after refresh.
- [ ] Insert a new row; all required new-row rules still run.
- [ ] Confirm no `tabulatorFieldChanges` load error or unexpected Console error.

## P. Phase 8.5-R2 — Save Result and Navigation

- [ ] Paste one full non-identity column across about 4,952 rows.
- [ ] Save once.
- [ ] Test ArrowDown and ArrowUp immediately after Save without changing year.
- [ ] `identityCheckRows` remains `0` when identity fields were not changed.
- [ ] `save.delta.update-rows.rows` is near zero when the visible server values equal the values already shown in the sheet.
- [ ] `technicalFieldWrites` is greater than zero when server version stamps are refreshed.
- [ ] Refresh the page and confirm the pasted values persisted.
- [ ] Change year and return only to compare performance; it must no longer be required to recover navigation.
- [ ] Edit one sheet value that the server normalizes, if such a scenario exists, and confirm only that sheet value refreshes.


## Q. Phase 8.6-R1 — Grid Lifecycle Ownership

- [ ] Open the current year and confirm the row count and first interaction are normal.
- [ ] Change to another year and return to the original year at least five times.
- [ ] After every switch, one Arrow key press moves one cell only; Copy/Paste and right-click execute once only.
- [ ] Unsaved changes still block year switching.
- [ ] Open a filter popup, change year after closing/saving as required, and confirm no old popup remains.
- [ ] Go to a deep row, resize the browser, and confirm the viewport does not jump to row 1.
- [ ] Leave `/work-orders` for another page and return; the sheet opens once and no old keyboard action remains.
- [ ] The desktop page has one scrollbar for the table and normal page scrolling returns after leaving the sheet.
- [ ] Range drag auto-scroll still works after several year switches.
- [ ] Console contains no `tabulatorLifecycle` registration/load error and no red JavaScript error.
- [ ] Optional lifecycle audit: listener/timer/RAF/observer owners return to one active grid after each switch instead of increasing continuously.

**Work example:** after switching years five times, pressing Delete must clear the selected range once—not send the command to five hidden sheets.

## R. Phase 8.6-R2 — Grid Interaction Ownership

- [ ] Open a year with thousands of rows; ArrowDown and ArrowUp each move one cell per press.
- [ ] Enter quick typing in a text/input column, then use all four arrows; movement and edit commit remain unchanged.
- [ ] Double-click a custom Text cell; Left/Right move inside the text instead of leaving the editor.
- [ ] Select one cell and press Delete/Backspace; the cell clears once and Undo restores it once.
- [ ] Select a multi-row range; Copy and Paste run once and create one Undo transaction.
- [ ] Right-click an unselected cell; the real range is created and one context menu opens.
- [ ] Click outside the sheet; sheet shortcuts stop, and the context menu closes.
- [ ] Insert above/below and delete rows from the context menu; no duplicate operation occurs.
- [ ] Go to a deep row, resize the browser, and confirm the same logical row remains near the top.
- [ ] Change year at least three times, then repeat arrows, Copy/Paste, right-click, Resize, Undo, and Redo.
- [ ] Leave `/work-orders` and return; old document handlers do not respond.
- [ ] Save one safe edit and refresh; interaction extraction has not changed persistence.
- [ ] Console contains no `tabulatorInteractions` registration/load error and no red JavaScript error.

**Work example:** after switching years three times, pressing Ctrl+V must paste one range and create one Undo step—not three hidden pastes.



## S. Phase 8.7-R1 — Blazor Save Workflow Extraction

Run from the accepted `Phase8.6-R2-Stable` behaviour after applying R1.

1. Open a year and press Save without editing. Confirm the sheet reports that there are no changes.
2. Edit Basket in one existing work order, Save, refresh, and confirm only the intended value persisted.
3. Change `(WorkOrderNumber + WorkTypeCode)` to an existing global pair. Confirm Save is rejected and the conflicting cells are selected.
4. Change the same pair to a unique value. Confirm Save succeeds and persists after refresh.
5. Change Assignment Date to another year. Confirm the row leaves the current sheet and appears in the destination year after Save.
6. Insert a new row, complete its required values, Save, then edit it again without refresh. Confirm it now behaves as a saved database row.
7. Delete an eligible existing row, Save, refresh, and confirm it remains deleted.
8. Paste a large non-identity column, Save, and confirm `identityCheckRows: 0` and no global duplicate query.
9. Confirm Save success/failure Arabic messages are unchanged and only one message is produced.
10. Confirm performance operations still include `save.stream-reference`, `save.stream-open`, `save.stream-deserialize`, `save.server-service`, `save.client-apply-delta`, and `save.active-total`.
11. Change year after a successful Save and verify Copy/Paste, arrows, and right-click still work once.
12. Confirm Console contains no red error and no reference to `WorkOrders.Save` failure.

Acceptance: all business outcomes, messages, browser calls, and measured stage names match the pre-extraction behaviour.

## T. Phase 8.7-R2 — Save Request and Result Separation

Run from the accepted `Phase8.7-R1-Stable` behaviour after applying R2.

1. Press Save without changes. Confirm the same “no changes” message and no service save call.
2. Edit Basket in one saved order, Save, refresh, and confirm the intended value and row version persist.
3. Enter a globally duplicated `(WorkOrderNumber + WorkTypeCode)`. Confirm the same two cells are marked and the same Arabic duplicate message appears once.
4. Enter a unique pair after the duplicate failure and confirm Save succeeds.
5. Change Assignment Date to another year. Confirm request preparation counts one moved row and result preparation removes it from the current sheet and adds the destination year.
6. Insert and complete a new row. Save, then edit it again without refresh. Confirm the temporary Id is mapped once and no duplicate visual row remains.
7. Delete one eligible saved row, Save, refresh, and confirm it remains deleted.
8. Paste a non-identity column across thousands of rows and Save. Confirm `identityCheckRows: 0`, no unnecessary duplicate query, and no visible full-sheet rewrite.
9. Undo/Redo the large paste and Save each resulting state once; values and dirty state must remain correct.
10. Confirm Arabic success, duplicate, concurrency, invalid-date, blank-new-row, and generic failure text are unchanged when those scenarios are available.
11. Confirm performance operations still include `save.collect-client-delta`, `save.prepare-request`, `save.server-service`, `save.prepare-client-delta`, `save.client-apply-delta`, and `save.active-total`.
12. Confirm Console contains no red error and the build contains all three files: `WorkOrders.Save.cs`, `WorkOrders.SaveRequest.cs`, and `WorkOrders.SaveResult.cs`.

Acceptance: the employee sees the same outcomes as R1; only internal ownership is clearer.

**Work example:** the new-row test proves both halves: Request creates an Added record; Result replaces the temporary row identity with the saved database identity.



## U. Phase 8.7-R3 — Browser Dirty-State Module Extraction

Run from accepted `Phase8.7-R2-Stable` after applying R3.

1. Open the current year and confirm the status starts with zero unsaved rows.
2. Edit Basket in one saved order. Confirm the unsaved count becomes one; Save and refresh confirm persistence and the count returns to zero.
3. Edit Basket, then Undo back to the exact saved value before Save. Confirm the unsaved count returns to zero and Save reports no changes.
4. Edit two different fields in one row. Confirm Save sends that row once with both changed field keys. Undo only one field and confirm the other field remains unsaved.
5. Paste a small range, Undo, and Redo. Confirm the unsaved row count and saved result match the visible values after each step.
6. Paste a full non-identity column, Save, and confirm `identityCheckRows: 0`, no duplicate query, and the unsaved count becomes zero without changing year.
7. Insert a new row. Confirm it is dirty even before an original database snapshot exists. Save it, edit it again without refresh, then Save again.
8. Delete one eligible saved row, Undo the deletion, then delete and Save it. Confirm the deleted-row state does not survive the Undo and clears after successful Save.
9. Change Assignment Date to another year and Save. Confirm the removed current-year row is not left in the unsaved count.
10. Trigger a real duplicate pair when available. Confirm failed Save keeps the row dirty and preserves both validation marks; correcting and saving clears Dirty State.
11. Confirm performance operations retain `dirty.refresh`, `save.collect-dirty`, `save.collect-deleted`, `save.delta.snapshot-originals`, and `save.delta.reset-state`.
12. Change year and return. Confirm the new sheet starts with a fresh baseline and no dirty rows from the previous year.
13. Confirm Console has no red error or `tabulatorDirtyState` registration/load error.

Acceptance: visible values, changed-field scope, Undo/Redo, delete tracking, Save requests, and post-Save zero state match R2. The refactor changes ownership only.

**Work example:** change Basket and a custom Text value in one order, then Undo Basket only. The sheet must report one unsaved row and Save only the custom Text value; it must not resend Basket or lose the remaining change.


## V. Phase 8.8-R1 — Work Order Read Query Extraction

Run from accepted `Phase8.7-Stable` after applying R1.

1. Build and open the current large year. Confirm branch name, department name, selected year, available-year list, row count, and first/last visible work orders match the stable checkpoint.
2. Confirm rows remain ordered by `DisplayOrder`, then `Id`; no row jumps or duplicates after opening.
3. Change to at least two other years, including a very small year when available, then return to the large year. Each selection must produce one sheet initialization and the correct row count.
4. Confirm the performance report still contains `open.server.create-db-context`, `open.server.scope-query`, `open.server.available-years-query`, `open.server.rows-query`, and `open.server.total`.
5. Compare three repeated large-year opens with the accepted 4,949-row range (about 208–244 ms in the latest focused test). Investigate only if repeatable opens exceed the 1,750 ms regression limit.
6. Use search/filter, arrows, Copy/Paste, right-click, and resize after changing year. Read extraction must not disturb browser behavior.
7. Edit Basket in one existing row and Save. Refresh and confirm persistence; this proves the unchanged `WorkOrderService` facade still reaches the save implementation.
8. Change Assignment Date to another year and Save when a safe test row is available. Confirm year routing remains transactional and unchanged.
9. Add and save one row when safe. Confirm duplicate scope and temporary Id mapping remain unchanged.
10. Confirm Console and server logs contain no DI resolution error for `WorkOrderQueryService`, no red JavaScript error, and no duplicate grid initialization.

Acceptance: read results and `open.server.*` measurements match Phase 8.7, while every save rule remains unchanged.

**Work example:** opening 2025 reads 2025 rows through Query Service; editing a 2025 Basket cell and saving still uses the existing save transaction.


## W. Phase 8.8-R2A — SQL Server Save Integration Safety Net

Run from the ERPPrototype root after applying R2A:

```powershell
dotnet run --project .\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

The runner must create a temporary database whose name begins with `ERPPrototype_IntegrationTests_`; it must not use the application database.

Required PASS scenarios:

1. Employee cannot modify another department.
2. Global duplicate identity is rejected across departments and years.
3. Stale RowVersion is rejected.
4. AssignmentDate routes the work order to the destination year.
5. Add, update, and delete return a consistent result.
6. Database failure rolls back the whole save.

Required final output:

```text
Result: 6/6 passed.
Phase 8.8-R2A integration safety net: PASS
```

If any test fails, do not begin Phase 8.8-R2. Re-run the failed test suite with `--keep-database` only when database inspection is needed.

Acceptance: the main application builds, six service/database scenarios pass against real SQL Server semantics, and the temporary database is deleted after the run.


## X. Phase 8.8-R2 — Save Plan Extraction Automated Acceptance

Run from the solution folder while the application may remain open in Debug:

```powershell
dotnet run --project .\ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

Required direct save-plan PASS scenarios:

1. Editable fields normalize Arabic/Persian digits and surrounding whitespace.
2. Completely blank rows are ignored, every distinct `Id == 0` row is preserved, and the latest repeated negative temporary Id wins.
3. The same persisted Id cannot be changed and deleted in one request.
4. Existing changed/deleted records without an eight-byte RowVersion are rejected before database execution.

Required SQL Server PASS scenarios remain unchanged:

5. Employee cannot modify another department.
6. Global duplicate identity is rejected across departments and years.
7. Stale database RowVersion is rejected.
8. AssignmentDate routes the work order to the destination year.
9. Add, update, and delete return one consistent result.
10. A database failure rolls back the whole save.

Required final output:

```text
Result: 10/10 passed.
Phase 8.8-R2 automated save safety net: PASS
```

Acceptance: the web project builds through the project reference, all ten tests pass against the temporary isolated database, and the database is deleted after the run. No manual browser regression is required for R2 unless an automated test fails or the build reports a runtime-contract change.


## Y. Phase 8.9 — Automated Final Closure — ACCEPTED

Phase 8.9 changed documentation and engineering tools only. The accepted developer-machine run produced Release Build PASS, 10/10 save tests, Git source hygiene PASS, and a clean 3.06 MB source archive. Use the commands below whenever the closure evidence needs to be reproduced.

From the project folder run:

```powershell
.\Tools\Invoke-ERPTests.ps1 -Suite Full
```

From the solution folder, where the project is inside `ERPPrototype`, run:

```powershell
.\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full
```

The workflow must:

1. Remove local build output and obsolete duplicate root files.
2. Build the test project in Release, which also builds the web project.
3. Check all project-owned JavaScript files with `node --check` when Node.js is installed.
4. Run the 10 direct/SQL save tests against a temporary isolated database.
5. Confirm Git does not track generated or machine-local files when a `.git` folder is available.
6. Create a clean source ZIP excluding `bin`, `obj`, `.vs`, binaries, publish output, local settings, and nested ZIP files.

Required final output:

```text
Phase 8.9 automated verification: PASS
Phase 8.9 closure workflow: PASS
```

No new manual grid regression was required because Phase 8.9 changed no production C#, Razor, JavaScript, migration, database rule, or UI behavior. If a future closure rerun requires modifying a production file, rerun the focused checklist for that owner before accepting the new checkpoint.

## Z. Phase 9.0 — Browser Automation Foundation

Run from the Solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

The visible `-Headed` run is preferred for first acceptance. Later regression can omit `-Headed`. The command must:

1. Build the integration project and browser project in Release.
2. Pass the existing 10 SQL Server save tests.
3. Create a uniquely named temporary E2E database.
4. Start the web app on a random loopback port with that connection only.
5. Open Chromium and log in as the seeded Employee through the real login page.
6. Reach `/work-orders` and show the seeded branch and department.
7. Show the current-year work order.
8. switch to the previous year and show the previous-year work order while the current-year row is absent.
9. Save `phase9-foundation-pass.png` under ignored `TestArtifacts`.
10. Stop the web process and delete the temporary database.

Required output:

```text
Result: 10/10 passed.
Phase 8.8-R2 automated save safety net: PASS
Result: 4/4 browser checks passed.
Phase 9.0 browser automation foundation: PASS
Phase 9.0 automated foundation verification: PASS
```

On failure, send the console output and the generated failure screenshot/trace path. Do not point the runner at the development or production database.



## AA. Phase 9.0B — Browser Automation Hardening

From the Solution directory, run the visible Full suite:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

Required automated evidence:

1. Release builds for integration and browser projects succeed.
2. Existing save safety tests report `10/10 passed`.
3. Login is located through `data-testid`, not visible text or a generic `h1`.
4. The authenticated Work Orders page waits for the registered Tabulator table and state.
5. Full suite reports `9/9 browser checks passed`.
6. No page error or same-origin HTTP 5xx is recorded.
7. A success screenshot is produced. On failure, screenshot, trace, diagnostics, and web log are produced.
8. Temporary process and database are removed unless `-KeepDatabase` is explicitly supplied.
9. `TestArtifacts` retains no more than the latest 10 run directories.
10. Normal Development/Production behavior and visible UI remain unchanged.

Fast browser-only smoke command:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Smoke -SkipIntegration
```

Acceptance markers:

```text
Result: 10/10 passed.
Result: 9/9 browser checks passed.
Phase 9.0B Full browser suite: PASS
ERPPrototype automated verification: PASS
```

## Current Phase 9.2D2 acceptance commands

Functional correctness:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

Required: Integration 26/26 PASS and Browser 56/56 PASS. The run has no artificial Playwright delay.

Neutral deep performance, one action and one dataset:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```

Full pressure matrix:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceMatrix.ps1
```

Quantitative acceptance must use the Performance JSON reports, not the diagnostic timing fields emitted by the functional Stress journey.

## Phase 9.3E — Custom Filters, Money Sort, and Hide/Unhide

Server gate:

- [ ] Release Build succeeds.
- [ ] Apply migration `20260805183000_AddDepartmentColumnVisibility`.
- [ ] Core Integration suite reports `25/25 passed`.
- [ ] The column-layout test proves Width and IsHidden persist across years, stay department-scoped, and can be unhidden.
- [ ] The custom-column immutability test proves an attempted type change is rejected even when the column is empty.

Focused browser check:

- [ ] Add a Text, Date, Number, and Money custom column.
- [ ] Text, Date, and Number show a filter icon; Money shows a sort arrow and no filter icon.
- [ ] The first Money sort is largest-to-smallest, then smallest-to-largest.
- [ ] Filter options are created from the loaded rows and Apply/Clear work without a network reload.
- [ ] Hide one core column and one custom column. `Unhide Column` appears only while something is hidden.
- [ ] Undo and Redo restore Hide/Unhide before Save.
- [ ] Save, Refresh, and switch year; hidden states remain for the same department.
- [ ] Unhide and Save; both columns return after Refresh.
- [ ] Another department does not inherit the widths or hidden states.
- [ ] Hiding a Money column removes it from the selection-summary display but does not change fixed yearly totals.



# 2026-08-16 — Audit Remediation Acceptance Layer

This section is authoritative for the next remediation sequence. Existing detailed Phase checks above remain useful historical/focused coverage.

## A. Normal product operation must pass before Stress

Cover at minimum:

- Login / forced password / OTP when implemented.
- Work Orders open/ready and year switching.
- real keyboard + mouse.
- Copy/Paste.
- insert/delete.
- Save small and bulk.
- Draft restore once implemented.
- Undo/Redo including after Save per approved behavior.
- search/filter/sort.
- Basket behavior and financial calculations.
- Custom Column create/rename/delete/type/width/hide/unhide lifecycle.
- authorization/permissions.
- navigation away/back.
- Split/Wide at 100/90/80/75/70/67.

Unexpected browser `console.error`, page error, or failed request fails the test unless explicitly expected.

## B. Performance acceptance

Only establish the official baseline after `LDR-002` is fixed.

Measure operation-specific latency/cost for:

- open/ready;
- Arrow/Enter/navigation;
- search/filter/sort;
- paste;
- Undo/Redo;
- small Save;
- bulk Save;
- year switch;
- Basket;
- Custom Columns;
- memory + payload + server/SQL cost where practical.

10k is the normal target; 50k is capacity/stress.

Performance is accepted only when **both** conditions pass:

1. engineering measurements are within the approved budget/baseline for the same environment;
2. the visible employee workflow is smooth in the primary **Split Screen 100%** scenario.

A benchmark that looks good while search, scrolling, editing, Paste, Undo/Redo, Save, or year switching feels noticeably laggy to the user is **not accepted**. Home/loopback headed evidence is required before closing the baseline, and representative SEC Edge/network validation remains a later environment gate.

## C. Offline/Sync Stress — when implemented

Include:

- thousands of Pending Outbox operations;
- network loss/return/flapping;
- server slow/down;
- Save during Sync;
- Tab/Edge close and Power Off;
- multiple tabs/devices;
- field/row/schema conflicts;
- server delete vs Offline edit;
- lost ACK after commit + duplicate OperationId retry;
- IndexedDB migration/failure/storage pressure;
- 5h Offline expiry / 7d Login expiry;
- app update with Pending data;
- permission change while Offline;
- SEC-like network switching.

**Fail criterion:** functionally correct but materially slower Work Orders is not accepted.

## RevoGrid Migration Qualification — added 2026-08-20

### Already passed in isolated Lab

- [x] RevoGrid Community 4.25.2 pinned in the test.
- [x] 100,000 rows.
- [x] Whole-column selection remains stable through heavy scroll.
- [x] Sort and basic filter.
- [x] Native Paste 5,000.
- [x] End-of-sheet Paste truncates to available 200 rows without growing the sheet.
- [x] Edit + Dirty + Undo/Redo + Save checkpoint + Undo/Redo after Save.
- [x] Paste 5,000 as one ERP history transaction.
- [x] Remaining Amount readonly behavior.
- [x] Delete/Undo/Redo for 1,000 rows.
- [x] Custom-column add/Undo/Redo.
- [x] Split/Full selection stability.
- [x] RTL + scroll stability.
- [x] Zoom 90/80/67/100 with ERP selection preservation.

### Gate 5A — real Blazor/data bridge

- [ ] Use exact RevoGrid 4.25.2 assets; no `latest`.
- [ ] Isolated route only; `/work-orders` remains Tabulator.
- [ ] Load the real employee-scoped year through the existing server read path.
- [ ] Core + custom columns map correctly.
- [ ] 10k real-shape rows remain visually comfortable at Split 100%.
- [ ] No page/console/request/HTTP 5xx errors.
- [ ] Year change and disposal do not duplicate listeners/state.
- [ ] No production database mutation from destructive test data.

### Gate 5B — real Save/ERP behavior

#### Gate 5B foundation — Change Engine + Sheet History split

- [x] Change Engine owns only Baseline/Dirty/Save state; it has no Undo/Redo stacks.
- [x] Sheet History owns Undo/Redo order and a configurable memory budget.
- [x] Dirty is updated by touched-cell delta; no full-sheet scan is required for a normal cell/range change.
- [x] Returning a touched cell to Baseline removes it from Dirty tracking memory when it is no longer needed.
- [x] Multi-cell data changes can be represented as one History entry, so a later Paste remains one Undo action.
- [x] Save acceptance moves Baseline without requiring History to be cleared; failed Save does not change Baseline/Dirty.
- [x] Dirty blocks year/dataset replacement; Clean year switch clears the old dataset History.
- [x] Temporary `ClientKey` remains the session row identity after the server later assigns a database `Id`.
- [x] One History Coordinator replay path delegates to feature-owned adapters and does not record replay as a new action.
- [x] Successful Cell Edit Undo/Redo can return RevoGrid focus to the affected visible cell through public APIs.

#### Gate 5B-1 — Cell Edit binding

- [ ] Real employee-scoped data loads at `/work-orders-revogrid-gate5b1`.
- [ ] Editing one text cell changes Change Engine state from Clean to Dirty 1 and adds one Undo transaction.
- [ ] Undo restores only the latest separate edit, Redo reapplies it, and Ctrl+Z/Ctrl+Y match the buttons after the editor closes.
- [ ] Returning the cell to the Baseline clears Dirty and releases the clean Dirty tracker while Sheet History remains available.
- [ ] Undo/Redo returns selection to the affected visible cell.
- [ ] Paste/range mutation is blocked in this gate and cannot bypass Dirty tracking.
- [ ] Dirty blocks year change. After Undo returns to Clean, year change succeeds and clears the old History.
- [ ] No browser page error, unexpected console error, failed request, or server 5xx appears during the test.

- [ ] Dirty field deltas match the current Save contract.
- [ ] Add/change/delete save through existing server authority.
- [ ] Temporary row identity / saved Id / RowVersion reconciliation.
- [ ] Validation and duplicate errors return to the correct cell.
- [ ] Undo/Redo remains valid after Save in the same session.
- [ ] Custom column/layout changes preserve existing persistence rules.
- [ ] Conflict and moved-year behavior remains correct.

### Gate 5C — cutover qualification

- [ ] Frozen UI dimensions unchanged.
- [ ] Full regression checklist passes.
- [ ] Full automated safety suites pass after adapting test hooks.
- [ ] RevoGrid assets + MIT license are self-hosted/pinned.
- [ ] Manual Split 100% is at least as comfortable as the accepted Lab.
- [ ] Only after PASS: switch `/work-orders`, then remove obsolete Tabulator runtime in a separate cleanup checkpoint.


#### Gate 5B-1 — Undo/Redo minimal reveal regression

- [ ] عدّل 3 خلايا ظاهرة داخل نفس الشاشة، ثم انتقل بيدك إلى خلية أخرى. كل Ctrl+Z يرجع تعديلًا واحدًا ويغيّر التحديد للخلية المتأثرة **بدون أي Scroll** طالما الخلية ظاهرة.
- [ ] كرر نفس الاختبار بـCtrl+Y؛ لا يحدث تحريك رأسي أو أفقي غير مطلوب.
- [ ] عدّل خلية، ابتعد عنها حتى تصبح خارج الشاشة بالكامل، ثم Undo. يتحرك الشيت بأقل مسافة لازمة فقط حتى تظهر الخلية عند أقرب حافة ثم يظهر التحديد عليها.
- [ ] اختبر خلية ظاهرة جزئيًا عند أعلى/أسفل الـviewport؛ Undo يغيّر التحديد ولا يحرك الشاشة.
- [ ] اختبر عمودًا خارج الشاشة أفقيًا؛ يتحرك أفقيًا بأقل مسافة لازمة فقط. العمود الظاهر أو المثبت لا يسبب Horizontal Scroll.
- [ ] بعد Undo/Redo لا يتغير Undo/Redo count إلا بمقدار عملية واحدة، ولا يتأثر Dirty إلا بنتيجة البيانات الفعلية.

#### Gate 5B-2 — Paste binding

- [ ] `/work-orders-revogrid-gate5b2` loads the same real employee/year dataset as Gate 5B-1.
- [ ] Paste 2×2 into four editable cells changes four cells, makes the correct Dirty count, and adds **one** Undo entry.
- [ ] Ctrl+Z once restores the whole 2×2 Paste; Ctrl+Y once reapplies the whole 2×2 Paste.
- [ ] Two separate Paste actions create two separate Undo entries; one Undo restores only the latest Paste.
- [ ] Paste across a readonly column changes only writable cells and History/Dirty contain only those applied cells.
- [ ] Paste at the end of the sheet truncates to available rows and never creates rows automatically.
- [ ] Undo/Redo after Paste uses the same minimal-reveal focus rule: no viewport movement when the target is already visible; minimum movement only when needed.
- [ ] Gate 5B-1 still blocks Paste, proving the previous accepted gate remains isolated.
- [ ] Non-Paste range mutation/Autofill remains blocked in Gate 5B-2 until it receives a separate qualification gate.
- [ ] No browser page error, unexpected console error, failed request, or server 5xx appears during Paste/Undo/Redo tests.

#### Gate 5B-3 — Excel-like Filter over native Revo FilterPlugin

- [ ] `/grid-shootout/revogrid-excel-filter-state-lab.html` reports **PASS 14 / FAIL 0**.
- [ ] `/work-orders-revogrid-gate5b3` loads the same real employee/year dataset as Gate 5B-2.
- [ ] Filter buttons exist only on Work Order Number, Work Type, Assignment Date, Basket, and custom Text/Date/Number columns.
- [ ] Work Order Value, Partial Amount, Remaining Amount, and custom Money expose native Sort only and no Filter button.
- [ ] Work Order Number / Work Type / Basket open an Excel-like checkbox list with Search, Select All, Clear Filter, and Apply.
- [ ] Typing a non-empty Search term automatically makes the matching visible options the pending selection; the grid itself does not change until Apply is pressed. Example: typing `401` then Apply filters directly to `401` without manually clearing Select All first.
- [ ] While Search is active, Select All changes only the currently searched/visible option rows. Clearing the Search text keeps the current pending checkbox selection instead of silently resetting it.
- [ ] If Search finds no option, Apply is disabled so a no-match search cannot accidentally clear the filter and show the whole sheet.
- [ ] Work Order Number remains responsive with a large unique-value set; the popup virtualizes option rows rather than rendering all values at once.
- [ ] Assignment Date opens `Year → Month → Day`; selecting a year/month/day filters the sheet correctly through Revo's native filter engine.
- [ ] Custom Date uses the same date hierarchy; custom Text/Number use the checkbox-value picker.
- [ ] Applying or clearing one filter increments Sheet History by exactly one and leaves Change Engine `Clean` when no data cells were edited.
- [ ] Ctrl+Z restores the previous filter state; Ctrl+Y reapplies it. Filter replay does not create another History entry.
- [ ] With multiple filters active, opening a field lists values that satisfy the other active filters while excluding that field's own condition from its candidate list.
- [ ] Editing/Pasting a filtered field does **not** remove or add visible rows underneath the employee. Reopening the Filter picker reads the current edited values; explicit Apply/Clear recalculates the visible result.
- [ ] Filter year 2026, switch clean to a first-visit 2025: 2025 starts unfiltered. Return to 2026: its filter view is restored, but the old 2026 Undo stack is not restored across the year boundary.
- [ ] Gate 5B-2 remains unchanged and still passes its accepted Edit/Paste/Undo behavior.
- [ ] No Revo source file is patched and no ERP code directly calculates `trimmedRows`.
- [ ] No browser page error, unexpected console error, failed request, or server 5xx appears during Filter/Undo/Redo/year-switch tests.


#### Gate 5B-4 — Header selection + active Filter state + dedicated native Sort

- [ ] `/grid-shootout/revogrid-header-actions-state-lab.html` reports **PASS 14 / FAIL 0**.
- [ ] `/work-orders-revogrid-gate5b4` loads the same real employee/year dataset as Gate 5B-3.
- [ ] With no filter, each approved Filter column shows a normal visible funnel. After Apply, the same funnel remains visible and becomes clearly active; Clear/Undo returns it to normal.
- [ ] A plain click on a data-column header body selects that column and does **not** Sort.
- [ ] With 4,000 total rows filtered to 200 visible rows, a header-body click selects exactly the 200 visible cells in that column and never includes the 3,800 hidden rows.
- [ ] Clicking the Filter control opens Filter only and does not trigger whole-column selection or Sort.
- [ ] Clicking the Sort control triggers Sort only and does not trigger whole-column selection or Filter.
- [ ] Sort controls exist only on Work Order Value, Partial Amount, Remaining Amount, and custom Money columns. Filter-only columns have no Sort control.
- [ ] First Sort click is descending (largest to smallest), second is ascending, third clears Sort and returns to natural source order. Only one Sort column is active at a time.
- [ ] Each Sort transition adds exactly one Sheet History action and leaves Change Engine Clean. Ctrl+Z/Ctrl+Y restores Sort through the same native Revo path without recording replay.
- [ ] With Filter + Sort active together, editing/pasting does **not** reshuffle or hide rows underneath the employee. Explicit Filter/Sort interaction recalculates the view and creates only the corresponding view History action.
- [ ] With a Filter active, change/insert a visible row so it no longer matches. It must stay visible until Apply is pressed again. Re-applying the same filter values must refresh the result, add exactly one History action only when the visible snapshot changes, Undo must restore the pre-Apply working snapshot, and Redo must refresh it again.
- [ ] History order remains coherent across mixed actions such as Edit → Paste → Filter → Sort; each Ctrl+Z reverses only the latest sheet action.
- [ ] Sort/Filter 2026, switch clean to a first-visit 2025: 2025 starts with no inherited Sort/Filter. Return to 2026: its view state returns but its old History does not.
- [ ] No Revo source file is patched; Sort uses public `updateColumnSorting/clearSorting`, selection uses `getVisibleSource/setCellsFocus`, and Filter active state is rendered from native `hasFilter`. No browser page error, unexpected console error, failed request, or server 5xx appears.


#### Gate 5B-5 — Insert/Delete Rows + structural Dirty/History

- [ ] `/grid-shootout/revogrid-row-structure-state-lab.html` reports **PASS 15 / FAIL 0**.
- [ ] `/work-orders-revogrid-gate5b5` loads the same real employee/year dataset as Gate 5B-4.
- [ ] Right-click a selected row and Insert Above/Below: exactly one blank row appears in the requested visible position and row count increases by one.
- [ ] `Insert Rows...` accepts an explicit positive whole-number count (for example 20), then inserts that many rows Above or Below the target. The count is independent of the current selection size.
- [ ] A multi-row Insert is exactly one Sheet History action: one Undo removes the whole batch and one Redo restores the same ClientKeys/DisplayOrders together.
- [ ] The new row gets a unique temporary `ClientKey`; loaded rows keep their existing session ClientKeys. Database `Id` is still not required before Save.
- [ ] Normal Insert allocates `DisplayOrder` between the target row's real source neighbors. Repeated insertion into a depleted local gap redistributes only the necessary neighborhood.
- [ ] With Filter active, Insert remains visible under/above the target until the employee explicitly applies/changes Filter again. Editing the new row does not make it disappear automatically.
- [ ] With Sort active, Insert remains in the requested visible position while the employee edits it. Edit/Paste/Undo do not auto-resort the sheet; explicit Sort interaction recalculates ordering.
- [ ] Opening Filter after edits/insert reads the current values. Values no longer present in the current data are not kept as stale picker candidates.
- [ ] Delete Selected Rows removes exactly the selected visible row identities, including under Filter/Sort; hidden rows are never deleted implicitly.
- [ ] Select several visible rows, then right-click inside that selection: `Delete Selected Rows` deletes the whole selected range as one action. Right-clicking a row outside the selection deletes only that right-clicked row.
- [ ] One Insert adds exactly one Sheet History entry and structural Dirty. Ctrl+Z removes that unsaved row and returns the structural delta to Baseline; Ctrl+Y restores the same ClientKey/DisplayOrder row.
- [ ] One multi-row Delete adds exactly one Sheet History entry. Undo restores the same rows to their prior source/proxy/visible positions; Redo removes the same identities again.
- [ ] Dirty blocks year switching after Insert/Delete. Undo back to Clean allows the year switch and old History is cleared as already approved.
- [ ] No Revo Community source file is patched and `/work-orders` remains on Tabulator. No browser page error, unexpected console error, failed request, or server 5xx appears during the qualification.

#### Gate 5B-5 — Derived Remaining Amount synchronization

- [ ] Edit `Work Order Value`: `Remaining Amount` updates immediately from `Work Order Value - Partial Amount` without reload.
- [ ] Edit `Partial Amount`: `Remaining Amount` updates immediately without reload.
- [ ] Paste Work Order Value/Partial Amount into one or many rows: every affected row recalculates once after the Paste and the Paste remains one Undo action.
- [ ] Ctrl+Z after a financial Edit/Paste restores the financial input and the matching `Remaining Amount`; Ctrl+Y reapplies both visible results.
- [ ] `Remaining Amount` remains readonly and does not create its own Dirty cell, History entry, or Save field.
- [ ] With a Sort active, recalculation updates the value but does not auto-resort the row until the employee explicitly changes/reapplies Sort.


#### Gate 5B-5 — RevoGrid Range Clear qualification (2026-08-26)

- [x] Real Chromium journey selects `Partial Amount` by verified Revo `prop`, not an assumed visual column index.
- [x] Multi-cell `Delete` clears the selected editable cells and creates exactly one Sheet History action.
- [x] One Undo restores the whole clear; one Redo reapplies it.
- [x] `Backspace` follows the same multi-cell Range Clear path.
- [x] Clearing `Partial Amount` recalculates `Remaining Amount` from the current financial inputs.
- [x] A mixed selection that visually includes readonly `Remaining Amount` never clears that readonly field; it changes only through derivation.
- [x] Browser evidence reports no page error, console error, failed request, or HTTP 5xx during the accepted journey.
- [x] Change Engine self-test remains PASS 39 / FAIL 0.

**Acceptance evidence:** `ERP_REVO_GATE5B5_TRACE_20260826-170911.zip` completed the real browser journey successfully. The browser harness preserves timeline, screenshot, Playwright trace, console/network diagnostics, loaded module URLs, and range-event evidence for any future failure.

**Regression rule:** for employee-visible Grid behavior such as selection, edit, Paste, Range Clear, Undo/Redo, Filter, Sort, structural rows, validation, and Save, an isolated JavaScript/self-test is supporting evidence only. Acceptance requires the relevant real-browser journey to pass.

## CC-YEAR-001 — Year-scoped Custom Columns current acceptance

Server / SQL:

- [x] Definitions are isolated by Department + Work Year.
- [x] Add/Rename/Delete server behavior is current-year scoped.
- [x] Moving into an empty destination year creates the required definition and preserves a non-empty value.
- [x] Same-name/same-type destination reuse is asserted.
- [x] Same-name/different-type batch conflict creates one safe destination definition.
- [x] Blank moved values do not create destination definitions.
- [x] Populated legacy migration preserves definitions and `CustomValuesJson`.
- [x] SQL Core **34/34 PASS** after test-hardening V2.
- [x] Two-valued Custom Column Delete returns the implicitly affected Work Order with authoritative new RowVersion.
- [x] Moved Custom Columns preserve relative order when the destination position is occupied.

Revo regression already executed:

- [x] `EmployeeRealWorkdayRunner` scenarios **00-17 PASS**.
- [x] `EMPLOYEE REAL WORKDAY MASTER: PASS`.
- [x] Cross-year, Custom Values, aggregates, large Save, and concurrency stayed green.
- [x] Revo fixture writers include `CustomColumnDefinitions.WorkYear`.

Real local database safety/migration:

- [x] Real DB inspected before migration: `CustomColumnDefinitions = 0`, `WorkOrders = 39043`.
- [x] Real DB backup created.
- [x] Backup verified with `RESTORE VERIFYONLY ... WITH CHECKSUM`.
- [x] `20260905110000_ScopeCustomColumnsByWorkYear` applied successfully.
- [x] Post-check: `WorkYear` exists; migration is recorded; null `WorkYear` definitions = 0.

User manual evidence on current Revo slice:

- [x] Edit + Save + Refresh.
- [x] Switch year and return.
- [x] Cross-year Cancel and Continue.
- [x] Sort/Filter + Save.
- [x] Undo/Redo.
- [x] Add Custom Column structural action appears.
- [x] Current known boundary confirmed: Save is unavailable while Custom Column structural changes are pending before persistence/history reconnect.

Next acceptance order:

- [ ] Reconnect preserved Revo Custom Column persistence/history with the Phase 1 `WorkYear` fixture change preserved.
- [ ] User manually accepts Custom Column Add + Save + reload.
- [ ] User manually accepts Rename + Save + reload.
- [ ] User manually accepts Delete + Save without affecting another year.
- [ ] User manually accepts year isolation between at least two Work Years.
- [ ] User manually accepts cross-year valued move reuse/create/conflict behavior.
- [ ] After user manual acceptance, run assistant/automated Revo + SQL closure regressions.
- [ ] Run memory consistency + final diff review.
- [ ] Append factual CC-YEAR-001 metrics.
- [ ] Create final accepted checkpoint.

Deployment safety:

- [x] Real local DB migration was protected by a verified backup.
- [ ] Any later production deployment keeps a backup/restore path because this migration is intentionally forward-only.
### Revo reconnect manual acceptance — current state

- [x] Manual-first testing reached the reconnect slice before automated closure tests.
- [x] Initial year-isolation failure reproduced and root cause identified: year switch did not rebase the Revo Custom Column workspace.
- [x] Corrected year-switch module was proven loaded in the browser.
- [x] User manual PASS — Add Custom Column + value + Save.
- [x] User manual PASS — column is absent in another Work Year and returns when switching back, without requiring Refresh, on the corrected year-switch module.
- [ ] Rename + Save + reload remains pending.
- [ ] Delete + Save acceptance remains pending. The first delete path exposed a separate post-commit reconcile problem.
- [ ] V2 delete-reconcile candidate has **not yet received a valid manual test** because the later trace showed the browser was still running the older `cc-year-reconnect-1` module.
- [ ] Before any further manual product result is accepted, prove runtime freshness: stop server, remove app bin/obj, Build the real project, abort on Build failure, Run without `--no-build`, open a new tab, and verify the intended module version.
- [ ] Manual V2 acceptance — deleting one or multiple persisted valued Custom Columns must make Save Clean immediately and allow year switching without Refresh or false layout/session conflict.
- [ ] Cross-year valued move reuse/create/conflict behavior remains pending manual acceptance.
- [ ] Automated Revo/B12/SQL closure runs only after the user's manual acceptance.

### CC-YEAR-001 — pre-closure test-design and parity gate (2026-09-07)

Manual evidence already accepted before automated closure:

- [x] Add Custom Column + value + Save + reload.
- [x] Work-Year isolation and A→B→A switching.
- [x] Persisted valued-column Delete + Save becomes usable without forced Refresh or false layout/session conflict.
- [x] Cross-year moved custom values survive.
- [x] Auto-created destination Custom Columns keep a sensible position/order instead of appearing before core columns.

Test-design rules before running closure:

- [ ] Review the existing Gate5B12 / Employee Real Workday / Integration scenarios against every manual defect that escaped the older green suite.
- [ ] Extend the existing approved harnesses rather than creating parallel runners unless a documented incompatibility requires isolation.
- [ ] Distinguish a **coverage gap** from a **missing product/parity feature**.
- [ ] If test review exposes a missing employee-visible Custom Column command, do not implement it inside the test-hardening pass.
- [ ] For existing migrated capabilities such as Rename and other legacy column-menu features, inspect the exact Tabulator behavior/code/tests first, then Revo Community mechanics/integration, then ERP ownership.
- [ ] Present the recovered parity behavior to the user and obtain approval before runtime implementation.
- [ ] The previously prepared Rename + closure-hardening candidate is not accepted product truth until that reference/approval gate passes.
- [ ] Only after the behavior/test design is reviewed: run browser + SQL/integration + migration + master/stress/concurrency closure.

### CC-YEAR-001 — test-only hardening candidate

Reviewed before execution:

- [x] Gate5B12 must run the accepted Gate 5C-1 route, not the historical Gate 5B-12 route.
- [x] Gate5B12 must bind diagnostics to the exact Revo module loaded by the page; no hard-coded stale module import is accepted.
- [x] Assert Gate 5C-1 visible aggregates are active before using the journey as closure evidence.
- [x] Browser: delete **two persisted valued Custom Columns** in one Save; SQL values disappear, affected Work Order RowVersion advances, browser reconciles it, Save is Clean, and year can switch immediately without Refresh.
- [x] Browser cross-year: missing destination auto-create + value remap + visual/core-region order.
- [x] Browser cross-year: same name + same type reuses one existing destination field without moving it.
- [x] Browser cross-year: same name + different type creates exactly one safe Text destination for a two-row batch; existing Money column is untouched.
- [x] Browser cross-year: blank value does not create a destination definition or custom-value payload.
- [x] Browser design: Custom **Text Filter** state and Custom **Money Sort** state do not leak into another Work Year and restore only when returning to the owning year; one column must not be expected to expose both controls.
- [x] Browser: stale Custom Column RowVersion rejects structural Delete without partial SQL persistence; local structural work remains Dirty until authoritative reload.
- [x] Integration: deleting two valued Custom Columns returns the implicitly affected Work Order and its authoritative new RowVersion.
- [x] Rename/current column-menu parity intentionally excluded from this test-only candidate pending the later reference/user-approval pass.
- [x] BUILD — E2E/Integration candidate compiles.
- [ ] RUN — hardened Gate5B12 browser closure passes on Gate 5C-1.
- [x] RUN — SQL Integration + populated migration pass after latest fixes — SQL Core **34/34 PASS**, Phase 9.3D PASS.
- [ ] RUN — Employee Real Workday 00-17 remains green.
- [ ] RUN — stress/concurrency closure remains green where applicable.

Browser closure execution note — 2026-09-07:

- [x] Gate5B12 resolved the accepted `cc-delete-reconcile-2` runtime module on Gate 5C-1.
- [x] Gate 5C-1 visible aggregates were active.
- [x] First real Update + Save persisted and returned Clean.
- [x] First hardened run stopped on stale invalid Basket literal `مراجعة`; classification was TEST HARNESS CONTRACT FAIL, not product failure.
- [x] Test-only Basket contract correction applied using product-owned `WorkOrderBuskets.All`; E2E rebuild PASS.
- [x] Rerun progressed beyond Basket validation and again passed runtime module, accepted surface, and first real Update + Save.
- [x] DB-reader correction applied (`GetInt32` -> product enum name); E2E rebuild PASS.
- [x] Rerun passed `[01b-custom-columns]` and `[01c-custom-multi-delete]`, proving the earlier Basket/DB-reader blockers are closed and the hardened multi-delete browser contract is green.
- [ ] Full hardened Gate5B12 journey remains open: the cross-year mapping scenario reached visible-source rows 30/31 but timed out waiting for row 30 in the virtualized DOM because the new scenario skipped the existing real-mouse `ScrollToRowAsync` helper.
- [x] Trace classification: TEST HARNESS VIRTUALIZATION/SCROLL FAIL; source rows exist, browser diagnostics are clean, and no product runtime failure is evidenced.
- [ ] Apply test-only explicit scrolling for the new mapping scenario's non-zero target rows (20, 25, 30, 31, 35), rebuild E2E, and rerun the same journey. No product runtime change is authorized by this failure.
- [x] First Virtual-Scroll Fix V1 package apply was TOOLING BLOCKED only: `AI_WORK_LOG.md` payload had a blank line at EOF, `git diff --check` failed, and rollback restored all reviewed files.
- [x] Corrected Virtual-Scroll Fix V2 applied cleanly; E2E rebuild PASS and product runtime unchanged.
- [x] Rerun progressed beyond the row-30 virtualization blocker and successfully switched the destination dataset to Work Year 2025.
- [x] New trace classification: TEST HARNESS YEAR-SWITCH/RENDER-BARRIER FAIL — `WaitForYearAsync` incorrectly required row 0 to be visible although Revo preserved the viewport near row 35 after the year switch.
- [x] Apply test-only year-switch barrier correction: keep selector/loading/`Dataset {year}` checks, then wait for any rendered data cell rather than row 0; E2E rebuild PASS.
- [x] Rerun after that correction advanced through `[01d-custom-cross-year]` PASS, proving the hardened cross-year missing/reuse/type-conflict/blank/order scenario is green.
- [x] New `[01e-custom-year-view]` failure classified from trace as TEST HARNESS 2D VIEWPORT-NAVIGATION FAIL: the saved Custom Column resolved to visual column 3, but its virtualized Sort header was horizontally off-screen; diagnostics remained clean.
- [x] Whole-test viewport-navigation V1 applied cleanly; product runtime unchanged and `git diff --check` PASS.
- [x] Immediate rerun failure classified as TEST HARNESS VIEWPORT-SELECTOR / NAVIGATION-DESIGN FAIL: the helper required conditional `.scroll-rgCol`, while the real initial viewport was `.rgCol.hydrated`; the journey stopped before `[00-runtime-module]`.
- [x] Whole-runner review completed: startup/reload readiness must not force row 0; navigation must use Revo public row/column positioning APIs instead of custom wheel/RTL heuristics; redundant scenario scrolls should be removed; editor targeting should use `revogr-edit input`.
- [ ] Apply consolidated Gate5B12 viewport-navigation V2 from the exact current snapshot. Test-only — no product runtime/Rename/parity change.
- [ ] Rebuild E2E and rerun the same Gate5B12 journey from the beginning.
- [ ] After Gate5B12 PASS, rerun Employee Real Workday and review its separate column-0 mouse-wheel render assumption before final closure.
- [x] Viewport-navigation V2 applied and rebuilt; rerun passed `[00]` through `[01d-custom-cross-year]`.
- [x] Uploaded `[01e]` trace corrected the prior diagnosis: visual column 3 was already rendered and its Text header showed Filter only; the missing Sort button is the accepted capability split, not an off-screen header.
- [x] Reclassify this stop as TEST HARNESS CAPABILITY-CONTRACT FAIL: the scenario created a Text custom column but waited for a Sort control that only Money columns own.
- [ ] Apply the test-only `[01e]` correction: use separate Text(Filter) and Money(Sort) custom columns, rebuild E2E, and rerun Gate5B12 from the beginning.


### RECOVERY-CLOSURE-20260909

- [x] Build PASS on recovered clean environment.
- [x] SQL Integration **34/34 PASS**.
- [x] Phase 9.3D legacy-column removal gate PASS.
- [x] Gate5B12 [00-runtime-module] through [07-concurrency] PASS.
- [x] [01e-custom-year-view] validates Text Filter + Money Sort ownership per Work Year.
- [x] 1,200-edit large Save PASS.
- [x] Browser trace/screenshot evidence captured.
- [ ] Employee Real Workday 00-17 rerun on the rebuilt machine remains pending.
- [ ] Rename/current column-menu parity remains outside this recovery closure.

### RECOVERY-CLOSURE-20260909

- [x] Build PASS on recovered clean environment.
- [x] SQL Integration 34/34 PASS.
- [x] Phase 9.3D legacy-column removal gate PASS.
- [x] Gate5B12 [00-runtime-module] through [07-concurrency] PASS.
- [x] [01e-custom-year-view] validates Text Filter + Money Sort ownership per Work Year.
- [x] 1,200-edit large Save PASS.
- [x] Browser trace/screenshot evidence captured.
- [x] Employee Real Workday 00-17 rerun on rebuilt machine PASS through [00]-[17].
- [ ] Rename/current column-menu parity remains outside this recovery closure.
