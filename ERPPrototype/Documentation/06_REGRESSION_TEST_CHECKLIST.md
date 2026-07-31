# 06 — Regression Test Checklist

**Status:** Mandatory after any grid/runtime change  
**Stable checkpoint:** `M5D4R3-Stable-Range-UX` (E6C foundation)  
**Rule:** لا ننتقل للخطوة التالية إذا فشل اختبار أساسي.

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

- [ ] WO Number أقل/أكثر من 9 أرقام يُرفض.
- [ ] Work Type أقل/أكثر من 3 أرقام يُرفض.
- [ ] Arabic digits تتحول بصورة صحيحة.
- [ ] Invalid date يظهر خطأ.
- [ ] Basket خارج القائمة يُرفض.
- [ ] Notes أكبر من الحد تُرفض.
- [ ] Duplicate pair يظهر خطأ واضح.
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

- [ ] كرر الاختبارات على بيانات تجريبية.
- [ ] لا تعتمد النتيجة لمجرد أن الصفحة فتحت.
- [ ] سجل الأرقام وقارنها بـ3,000 صف.
- [ ] إذا فشل، افتح قرار server-side/progressive loading قبل إضافة ميزات أخرى.

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
- Automated browser tests: غير موجودة حتى الآن.

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
- [ ] Edit Notes only; Work Order Number, Work Type, date, basket, status, order, and row identity remain unchanged after refresh.
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
- [ ] Double-click a Notes/Status cell; Left/Right move inside the text instead of leaving the editor.
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
2. Edit Notes in one existing work order, Save, refresh, and confirm only the intended value persisted.
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
2. Edit Notes in one saved order, Save, refresh, and confirm the intended value and row version persist.
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
2. Edit Notes in one saved order. Confirm the unsaved count becomes one; Save and refresh confirm persistence and the count returns to zero.
3. Edit Notes, then Undo back to the exact saved value before Save. Confirm the unsaved count returns to zero and Save reports no changes.
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

**Work example:** change Notes and Status in one order, then Undo Status only. The sheet must report one unsaved row and Save only Notes; it must not send Status or lose the Notes change.
