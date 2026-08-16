# CURRENT AUDIT FINDINGS OVERRIDE — 2026-08-16

> قائمة Active Items القديمة أدناه تظل تاريخًا/تفصيلًا، لكن أولوية ما قبل Pilot الحالية تأتي من `12_ENGINEERING_AUDIT_REPORT.md`.

## أهم العمل الحالي قبل Pilot

### Completed / verified on current checkpoint

- `LDR-002`: **Closed and verified** at `33e73c6`; the loader contract now waits for the complete Work Orders core runtime.
- Test Foundation: SQL Integration **25/25 PASS** and Full Browser **46/46 PASS**.
- Clean Performance/Torture baseline: checkpoint `3dc88ff`; 10k functional/capacity torture **PASS** with no detected data loss or browser/server error.
- Old `GRID-004` “10,000 rows untested” is superseded: 10k is now tested. **Comfort/performance acceptance remains open** because visible freezes were measured.
- Old `TEST-001` incomplete edit/save/insert/delete/Undo/Redo browser coverage is superseded by the current Full + Torture suites.

### Current open work

- **Next package:** `CSB-001`, `JS-003/EXF-001`, `JS-002`, `CSB-003` — Online reliability / init / retry / event boundaries / recoverability.
- `FRC-007`: conflict واحد لا يضيع باقي dirty batch.
- `CON-002/003`: Custom Column schema concurrency + Schema/Config Version.
- `SEC-001`: forced temporary-password invariant.
- Custom Column title XSS.
- Save transport/full-sheet performance debt (`PERF-002/003/008/009/010/011/012`). Runtime evidence now confirms the UX impact of `PERF-008/012` and large dirty/Save work; see Master Report §6.1.
- Production gates: deployment/ops, dependency/security/license review, CI, backup/restore, SEC network/domain.

### Current performance evidence status

- `PERF-012` financial Sort: **strong runtime confirmation** — worst observed Long Task 2.596 s at 10k.
- `PERF-008` 500+ changed-cell replacement: **runtime confirmed** — 1,000-cell Paste produced >1 s Long Task.
- `PERF-009`: bulk Undo/Redo latency confirmed; retained-history memory risk still unmeasured.
- `PERF-011`: broad Save contract remains static-confirmed; 1,000-edit Save showed a 9.32 s user journey, but causal cost split is still pending.
- `PERF-002/003/006/010`: remain open and require targeted measurement; current Torture must not be used to claim them closed.

## قرارات تقلل أو تغير Findings قديمة

- نموذج “موظف قسم واحد ثابت” لم يعد نموذج المستقبل؛ سيتم بناء capabilities/delegation.
- Offline durable Draft/Outbox هو الحل المستقبلي لفقد العمل غير المحفوظ؛ لا تبنِ Recovery مكررًا مؤقتًا معقدًا.
- لا Polling دوري للسيرفر؛ account disable/other-user updates تظهر عند أول server interaction فعلي لاحق.

# 07 — Known Issues and Technical Debt

**Status:** Active register
**Rule:** المشكلة لا تختفي لأنها مؤجلة. يجب أن يكون لها أولوية وحل مؤقت وشرط إغلاق.

## Priority Meaning

- **P0:** خطر بيانات/أمان أو يمنع التشغيل.
- **P1:** يمنع Pilot أو البيع أو يؤثر بقوة على الاستخدام الأساسي.
- **P2:** مهم للصيانة أو التشغيل لكن يمكن تأجيله داخل Prototype.
- **P3:** تحسين أو تنظيف غير عاجل.

## Active Items

| ID | Priority | Issue | Evidence / impact | Temporary position | Release gate |
|---|---:|---|---|---|---|
| GRID-001 | P2 | تدهور تدريجي في التنقل بعد ضغط مستمر طويل | Phase 6.0 أثبتت ارتفاع أزمنة الأسهم، وPhase 6.1 لم تثبت تراكمًا مستمرًا في Timers/Observers/known owners؛ المستخدم أكد أن السرعة العملية الحالية للأسهم وEnter والـWheel مقبولة | لا Performance Patch ولا Recovery الآن؛ نراقب فقط | يعاد فتحه عند اختبار 10,000 صف، ظهور شكوى فعلية، أو Regression واضح |
| GRID-002 | P2 | `tabulatorTest.js` ما زال منسقًا كبيرًا نسبيًا رغم انخفاضه إلى نحو 2,331 سطرًا | المسؤوليات الحساسة أصبحت في Modules مستقلة؛ تقسيم إضافي الآن قد يزيد المخاطر بلا فائدة | لا Refactor إضافي دون مشكلة أو ميزة تثبت الحاجة | ليس Gate حاليًا |
| GRID-003 | P1 | Insert/Delete/structural Undo تستخدم full `setData` | تعيد بناء بيانات الشيت والتحقق | لا نضيف عمليات هيكلية ثقيلة جديدة | تحسين مرحلي بعد فصل الموديولات |
| GRID-004 | P1 | 10,000 صف غير مختبرة | Client-side loading قد لا يظل مقبولًا | اختبار منفصل قبل قرار معماري | مطلوب قبل تحديد سعة المنتج |
| GRID-005 | P3 | Search Debounce غير منفذ | البحث الحالي يعمل مع كل تغيير في النص، لكن لا توجد شكوى أو قياس يثبت عبئًا مؤثرًا مع بيانات البروتوتايب الحالية | إبقاء السلوك المباشر لتجنب Timer وتعقيد غير مطلوب | يعاد تقييمه عند بيانات أكبر أو بطء بحث مثبت |
| TEST-001 | P1 | تغطية اختبارات المتصفح غير مكتملة للعمليات التحريرية | Login/Scope/Open/Year تعمل آليًا، لكن Edit/Save/Insert/Delete/Undo/Redo لم تدخل Full Regression بعد | Phase 9.0B يثبت المنصة وPhase 9.0C يضيف رحلات الشيت الحالية | الرحلات الرئيسية مطلوبة قبل Pilot |
| AUTH-001 | P1 | BranchManager workflow غير مكتمل | الحساب موجود لكن لا شاشة read-only أو إدارة فرع | لا نقدمه كميزة منتهية | مطلوب قبل Pilot للدور |
| AUTH-002 | P1 | Workflow وصلاحيات العرض الشامل لـ`ProjectManager` غير مكتملة | الاسم النهائي محسوم ومتطابق في المنتج والكود، لكن شاشة التشغيل ما زالت محدودة | لا نقدمه كميزة منتهية | مطلوب قبل Pilot للدور |
| AUTH-003 | P1 | Rename/reset password/activate/deactivate غير مكتملة | الحسابات ثابتة لكن تغيير الأشخاص غير مدعوم | Admin ينشئ الحساب فقط حاليًا | مطلوب قبل Pilot |
| DATA-002 | P1 | نقل سنة Assignment Date يحتاج تأكيد | الكود ينقل تلقائيًا؛ قد يكون المطلوب اقتراحًا | توثيق السلوك الحالي | مطلوب قبل اعتماد Workflow |
| OPS-001 | P1 | Seeder/DB initialization داخل startup | بعد 3 محاولات يفشل بدء التطبيق وقد يظهر 500.30 | اجمع Azure logs | يجب حسمه قبل استقرار Azure |
| ADMIN-001 | P2 | `AdminPanel.razor` يستخدم DbContext مباشرة | صعوبة الاختبار وغياب audit/use-case boundary | لا نوسع الصفحة قبل Service | Refactor قبل ميزات إدارة إضافية |
| AUDIT-001 | P1 | لا Audit trail إداري | تغييرات الحسابات والفروع لا تسجل كسجل أعمال | logging العادي غير كافٍ | مطلوب قبل عميل حقيقي |
| OBS-001 | P1 | لا Client error reporting/Correlation Id | المستخدم لن يفتح Console في الإنتاج | Console يدوي في Prototype | مطلوب قبل Pilot خارجي |
| SEC-001 | P1 | إعدادات Production غير مكتملة | `AllowedHosts=*`، لا CSP/rate limiting review | بيئة تجريبية فقط | مراجعة قبل العميل |
| FEATURE-001 | P2 | Excel import/export غير منفذين | جزء أساسي من قبول Excel-like | خارج خطوة الأداء الحالية | مطلوب قبل اكتمال V1 |
| FEATURE-002 | P2 | Dashboard غير منفذ | KPIs غير متاحة | مؤجل حتى نجاح الشيت | مطلوب بعد grid validation |
| FEATURE-003 | P3 | Warehouse/invoice غير منفذين | مقصود خارج Prototype | لا نبدأ الآن | ليس Gate للشيت |
| CODE-001 | P3 | اسم `Busket` خطأ إملائي في الكود/DB | تغييره يحتاج Migration واسع | UI يعرض Basket | يؤجل حتى Migration مخطط |
| DOC-001 | P2 | تقارير تاريخية كانت في الجذر وتسبب لبسًا | مصدر حقيقة غير واضح | نُقلت إلى Archive | مغلق في هذه الحزمة |


## Closed Issues — 2026-07-27

| ID | Issue | Resolution | Evidence |
|---|---|---|---|
| GRID-CLOSED-001 | الضغط المستمر على Enter أصبح ثقيلًا قرب الصف 1,040 | E6D أضاف Enter إلى بوابة التنقل الرأسي المركزية المستخدمة مع الأسهم | المستخدم اختبر الاستمرار بعد نقطة البطء وأكد أن السلوك أصبح سريعًا |
| GRID-CLOSED-002 | أول كليك يمين بدون تحديد سبب `activeRange.occupies is not a function` | E6E ينشئ نطاق خلية حقيقيًا قبل معالجة Tabulator لأول right-click | المستخدم اختبر سنة بصف واحد وسنة كبيرة وأكد اختفاء الخطأ وعمل القائمة |
| GRID-CLOSED-003 | عمليات هيكلية/Undo/Redo سببت `element?.focus is not a function` | E6F أضاف bounded focus retry guard مع فحص حقيقي للعنصر | المستخدم اختبر Insert/Delete/Undo/Redo/Copy-Paste/Save ولم يظهر الخطأ أو أي Console error |
| DATA-CLOSED-001 | Scope قاعدة التكرار كان موثقًا كأنه غير محسوم | تم اعتماد التفرد العالمي عبر الشركة وكل السنوات للزوج `WorkOrderNumber + WorkTypeCode`، وهو مطابق للـUnique Index الحالي | قرار المنتج المؤكد والكود الحالي وM5D4R3 متطابقة |
| BUILD-CLOSED-001 | عدم وجود Build/Automated evidence للنسخة الحالية | تم بناء المشروع وتشغيل شبكة الحفظ على جهاز التطوير؛ R2A نجحت 6/6 ثم R2 نجحت 10/10 | مخرجات المستخدم من أوامر Release والاختبارات |

## Closed / Rejected Experiments

| Item | Result |
|---|---|
| Fixed rowHeight Step16P1A | فشل وتم الرجوع |
| Same-instance `replaceData` recovery | تسبب في توقف الأسهم/السنة؛ مرفوض |
| Range recycle diagnostic | لم يعالج الإرهاق؛ ليس السبب |
| Hidden instance recovery R3 variants | تجارب تشخيصية غير معتمدة؛ ليست في E6E |
| Pixel-only resize restoration | تسبب في انحراف الصفوف؛ استُبدل بالـlogical anchor في E6C |

## How to Close an Item

لا يُكتب “تم الحل” إلا بعد:

1. Code change.
2. Build.
3. Regression checklist.
4. Specific reproduction test.
5. Performance/security evidence when relevant.
6. Documentation update.
7. Git checkpoint.

## Simple Example

`GRID-001` أصبح قيد مراقبة P2 وليس مشكلة نصلحها الآن. القياس سجّل التدهور، لكن قرار المنتج يعتمد أيضًا على الاستخدام الفعلي: طالما السرعة الحالية مقبولة ولا توجد شكوى تشغيلية، لا نضيف Patch مخاطره أكبر من فائدته. يعاد فتحه عند بيانات أكبر أو مشكلة فعلية.


## Phase 6.0 Long-session Reference — 2026-07-29

- COLD: ArrowDown average ≈ 33.7ms / p95 ≈ 53.3ms، وArrowUp average ≈ 34.8ms / p95 ≈ 56.7ms.
- بعد جلسة أسهم طويلة: ArrowDown average ≈ 60.4ms / p95 ≈ 101.4ms، وArrowUp average ≈ 57.4ms / p95 ≈ 101.7ms.
- الذاكرة لم تُظهر نموًا مستمرًا؛ ظهرت دورات ارتفاع وانخفاض مع Garbage Collection.
- Phase 6.1 لم تُظهر تراكمًا مستمرًا في الـTimers أو Observers أو المالكين المعروفين. تسجيلات Listeners ارتفعت أثناء إنشاء خلايا Tabulator الجديدة ثم استقرت، والعداد يمثل حدًا أعلى للتسجيلات وليس إثباتًا أن جميعها نشطة.
- بقرار المستخدم، الأداء العملي الحالي مقبول ولا نضيف إصلاحًا الآن؛ يحتفظ بهذه الأرقام كمرجع لاختبار 10,000 صف أو أي Regression مستقبلي.


## Phase 8.5 Verification Note — 2026-07-31

The confirmed 18-second duplicate-query regression was fixed by scoping identity checks. Phase 8.5 further replaces row-only dirty tracking with changed-field tracking and introduces generic batch application for large cell operations. Runtime verification passed through the later Phase 8.5-R1/R2 and Phase 8.7 regressions. User-created columns remain planned, not implemented.


## Phase 8.5-R1 Performance Correction — 2026-07-31

- Field-level tracking is retained because it correctly prevented unrelated identity validation and eliminated the `cellEdited` event storm.
- The first large-batch `updateData` strategy is rejected because full-column Paste increased to about 1.01 seconds and Undo to about 1.17 seconds.
- R1 uses the documented Tabulator `replaceData` path only for 500+ changed cells; small edits keep the targeted update path.
- The user repeated large Paste/Save/Undo tests in later phases; the R1 candidate was superseded by R2 save-result merge.

## Phase 8.5-R2 Post-Save Navigation Finding — 2026-07-31

- The R1 full-column Paste path improved from about 1.01 seconds to about 0.74 seconds, but navigation still became heavy after the large Save.
- Switching year away and back recreated the grid and restored ArrowDown p95 to about 72.9 ms with zero Long Tasks in the final measurement window.
- The report showed `save.delta.update-rows` repainting 4,952 rows and taking about 1.12 seconds even though the user-visible pasted values were already present.
- R2 keeps field-level tracking and changes Save reconciliation so hidden server values are merged without repainting rows; only genuinely different sheet values are sent through the grid update path.
- Post-Save navigation was tested in the later R2/R3 regressions and accepted; reopen only on a repeatable regression.

## Phase 9 Browser Automation Limits

- Phase 9.0 requires SQL Server LocalDB by default; `ERP_TEST_SQLSERVER_CONNECTION` may point to a dedicated disposable SQL Server instance, never to development or production data.
- The first run may download Playwright Chromium into the current Windows user's browser cache. This increases machine cache usage but does not increase the clean project ZIP.
- Phase 9.0 passed Login, Employee scope, initial sheet rendering, and year switching. Phase 9.0B hardens the platform but does not yet cover Edit/Save, duplicate UI messages, Copy/Paste, Undo/Redo, filters, custom columns, or financial fields.
- The test-only `E2ETest` environment disables HTTPS redirection for the random loopback process. Normal Development and Production behavior is unchanged.

