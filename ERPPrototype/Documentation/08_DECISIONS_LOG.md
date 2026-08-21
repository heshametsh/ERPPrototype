# GRID ENGINE DECISION OVERRIDE — 2026-08-20

> هذا القرار أحدث من قرار “keep Tabulator” في 2026-08-17 ومن `DEC-004` كاتجاه مستقبلي. Tabulator يظل **current runtime only** إلى أن ينجح cutover.

1. **No ERP rewrite:** نحتفظ بـASP.NET Core + Blazor Server + EF Core + SQL Server + Identity + Modular Monolith.
2. **Approved grid-engine exception:** RevoGrid Community **4.25.2** هو Work Orders replacement target.
3. **Current runtime remains safe:** `/work-orders` ما زال Tabulator 6.5.0 حتى Gate 5A/5B/5C.
4. **Version rule:** exact `4.25.2`, never `latest` in the application.
5. **Deployment/license rule:** self-host the package and retain its MIT license before cutover; Community features used by the project must remain within the MIT package.
6. **Migration rule:** port product behavior, not Tabulator internals/hacks.
7. **Univer decision:** no longer a finalist; native end-of-sheet Paste expanded the sheet instead of truncating to available rows.
8. **Paste rule:** clipboard overflow at the end of the sheet is clipped to available rows; the grid must not add rows automatically.
9. **Current task:** isolated Blazor/RevoGrid real-data integration, then real Save/Delta, then visual/regression cutover.
10. **Rollback:** Tabulator remains the current implementation and rollback point until the RevoGrid cutover checkpoint is accepted.

---


## Technology-history navigation

لرؤية التسلسل الكامل من **Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid** مع سبب كل انتقال والـEvidence المتاح، راجع `13_TECHNOLOGY_EVOLUTION.md`.

هذه الوثيقة (`08_DECISIONS_LOG.md`) تظل المرجع للقرار التفصيلي نفسه؛ ملف Technology Evolution يجمع التسلسل ولا يستبدل الـDecision Log.



# POST-AUDIT DECISIONS — reconciled 2026-08-17

> هذه القرارات أحدث من القرارات التاريخية أدناه وت supersede أي قرار يتعارض معها. التفاصيل والأسباب في `12_ENGINEERING_AUDIT_REPORT.md`.

1. **No ERP rewrite:** الحفاظ على ASP.NET Core/Blazor Server/EF/SQL/Identity؛ قرار Tabulator كـfuture engine تم نسخه بقرار RevoGrid في 2026-08-20.
2. **Execution status/current priority:** previous remediation remains preserved; Grid Shootout is complete and RevoGrid 4.25.2 is selected. Current task is isolated real Blazor/RevoGrid integration before production cutover.
3. **Performance is a hard gate:** 10k target; 50k capacity; أي Lag ملحوظ يرفض التصميم.
4. **Save semantics:** Save = اعتماد وحفظ محلي durable؛ Sync أوتوماتيك وليس زرًا منفصلًا.
5. **Draft:** قبل Save يمكن حماية العمل محليًا كDraft غير معتمد؛ Restore/Discard بعد reopen.
6. **No fixed server polling.** الاتصال عند حدث مهم مثل Save/Resume مع Pending work.
7. **Preflight:** metadata صغيرة؛ لا توقف Sync إلا لتغيير يمس Offline work فعليًا.
8. **Offline scope:** كل السنوات المصرح بها للقسم؛ initial background prep ثم delta.
9. **Offline editing lease:** 5 ساعات من آخر server contact؛ بعدها read/copy + حفظ ما بدأ فقط.
10. **Trusted Login:** 7 أيام بعد Login كامل.
11. **Auth:** Username + Password + Email OTP؛ البريد قناة تحقق وليس هوية؛ Admin ببريد خاص.
12. **Temporary password:** 8 خانات بسيطة؛ إجبار التغيير؛ lockout تقريبًا 5 محاولات/15 دقيقة.
13. **OperationId/receipts:** idempotent Sync/lost-ACK recovery.
14. **Partial Sync:** sync السليم فقط، preserve conflicts.
15. **Conflict policy:** different fields auto-merge; same field user resolves; server-delete does not auto-resurrect.
16. **Custom schema:** server-approved structure wins؛ Offline values تُحمى ويُطلب تصرف المستخدم قبل destructive Sync.
17. **AssignmentDate cross-year:** confirmation؛ Asia/Riyadh business time.
18. **Multi-tab:** BroadcastChannel + Web Locks؛ one Sync owner.
19. **Multi-device:** allowed؛ DeviceId + independent Outbox.
20. **No dedicated Excel Import currently:** Copy/Paste from Excel is enough؛ Export/clipboard out must be Formula-Injection safe.
21. **Work Order Value:** production-mandatory؛ Work Orders employee enters estimate؛ Extracts specialist reviews/corrects final system value.
22. **Roles:** Admin creates/disables accounts؛ managers delegate operational capabilities within scope; no shared Admin credentials.
23. **Main Basket + specialist sub-workflows:** Municipality/GIS/Execution/Extracts/Warehouse details must not explode the main Basket.
24. **Warehouse detailed design deferred.**
25. **Inspection/KPI attribution detail deferred** until KPI/workflow phase.
26. **Offline on InPrivate:** not supported.
27. **No separate Admin trusted-device revocation feature for now.**
28. **Production:** Staging, CI, backup+restore test, safe migrations, limited Pilot before Production.

# 08 — Decisions Log

**Status:** Approved  
**Purpose:** حفظ سبب القرارات حتى لا نعيد المناقشة من الصفر أو نغيّر الاتجاه بصمت.

## DEC-001 — Blazor instead of Power Apps

- **Status:** Accepted
- **Decision:** استخدام Blazor Web App + ASP.NET Core + EF Core + SQL Server.
- **Reason:** التحكم في تجربة Excel-like والأداء والصلاحيات والمنتج التجاري.
- **Impact:** وثائق Power Apps/Dataverse القديمة أصبحت Archived.
- **Simple example:** بدل بناء المنتج داخل منصة جاهزة بحدودها، نملك التطبيق والكود وقاعدة البيانات مباشرة.

## DEC-002 — Dedicated environment per customer

- **Status:** Accepted
- **Decision:** App وDatabase منفصلان لكل شركة في الإصدارات الأولى.
- **Reason:** عزل أبسط وأوضح وأقل مخاطرة من Shared DB multi-tenancy الآن.
- **Trade-off:** تكرار النشر والنسخ الاحتياطي لكل عميل.

## DEC-003 — Modular Monolith

- **Status:** Accepted
- **Decision:** تطبيق واحد مع موديولات داخلية واضحة.
- **Reason:** يناسب حجم المنتج الحالي ويمنع تعقيد Microservices.
- **Trade-off:** نحتاج انضباطًا في الحدود داخل نفس المشروع.

## DEC-004 — Tabulator is the current runtime grid

- **Status:** **Superseded as the future engine on 2026-08-20; retained as current runtime until cutover**
- **Decision:** Tabulator 6.5.0 ما زال Grid الفعلي في `/work-orders`، لكن لم يعد المحرك المستهدف للمستقبل.
- **Reason:** كان مناسبًا للتحقق الأولي، لكن real-use performance debt وكثرة grid-specific stabilization أدت إلى Grid Shootout مستقل.
- **Replacement decision:** `DEC-030` — RevoGrid Community 4.25.2.

## DEC-005 — No public registration

- **Status:** Accepted
- **Decision:** Admin ينشئ الحسابات؛ لا يوجد Register عام.
- **Reason:** الحسابات مرتبطة بأدوار وفروع وأقسام ثابتة.
- **Simple example:** المستخدم لا يختار بنفسه أنه موظف قسم معين؛ المدير يربط الحساب بالمكان الصحيح.

## DEC-006 — One Admin

- **Status:** Accepted
- **Decision:** حساب Admin واحد فقط.
- **Implementation:** Seeder يرفض وجود أكثر من Admin.
- **Risk:** يلزم Recovery/credential process موثق قبل الإنتاج.

## DEC-007 — Session-only Undo/Redo

- **Status:** Accepted for V1
- **Decision:** التاريخ داخل الجلسة فقط.
- **Reason:** تقليل التعقيد؛ بعد Refresh لا نضمن Undo.
- **Impact:** المستخدم يجب أن يحفظ أو يتراجع قبل تغيير السنة.

## DEC-008 — E6C is the foundation baseline

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** E6C هي نقطة الأساس التي بدأ منها التنظيم، وتظل Tag تاريخية للرجوع.
- **Contains:** central buffer 260px، vertical gate، ArrowUp correction، logical row anchor on resize.
- **Excludes:** R2/R3 automatic/hidden recovery experiments.
- **Reason:** آخر نسخة اختبرها المستخدم وعادت فيها الوظائف الأساسية سليمة.

## DEC-009 — Stop performance patches before engineering foundation

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** لا Patch جديد للإرهاق قبل التوثيق والاختبارات وفصل المسؤوليات.
- **Reason:** تعديلات صغيرة بدأت تكسر ميزات بعيدة مثل الأسهم وتغيير السنة.
- **Simple example:** عندما يصبح إصلاح مفتاح واحد يقطع الكهرباء عن أكثر من غرفة، ننظم اللوحة قبل إضافة مفاتيح أخرى.

## DEC-010 — Gradual extraction, no full rewrite

- **Status:** Accepted
- **Decision:** استخراج Module واحد كل مرة من `tabulatorTest.js`.
- **Reason:** Rewrite كامل يجمع أخطاء كثيرة ويصعب مقارنة السلوك.
- **Rollback:** كل مرحلة لها Git checkpoint واختبار مستقل.

## DEC-011 — Shared behavior is centralized

- **Status:** Accepted
- **Decision:** السلوك المشترك مثل vertical navigation يُدار من مسار مركزي.
- **Exception:** اتجاه خاص فقط عند وجود دليل تقني، مثل ArrowUp viewport correction.
- **Reason:** منع الحلول المتكررة والمتعارضة.

## DEC-012 — Documentation is a product asset

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** التوثيق والـKnown Issues والاختبارات والقرارات تُحدث مع التنفيذ.
- **Reason:** المحادثات ليست مصدر معرفة دائم، والمستخدم غير مبرمج ويحتاج شرحًا بسيطًا وأمثلة.


## DEC-013 — E6E historical stable checkpoint

- **Date:** 2026-07-27
- **Status:** Superseded by DEC-015, then DEC-017
- **Decision:** اعتماد E6E كنقطة التشغيل المستقرة الحالية، مبنية تراكميًا على E6C.
- **Contains:** E6C resize/buffer/navigation safeguards، E6D Enter repeat gate، وE6E first-right-click range guard.
- **Reason:** حلت مشكلتين قابلتين لإعادة الإنتاج بدون إدخال Recovery أو Restart أو تغيير قواعد البيانات.
- **Rollback:** الرجوع إلى Git tag `E6C-Baseline` عند ظهور Regression غير مقبول.
- **Simple example:** E6C هي أساس المبنى، وE6E هي آخر طابق تم فحصه واعتماده للاستخدام الحالي.

## DEC-014 — Fix confirmed functional defects before module extraction

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** العيب الوظيفي المحدد والقابل لإعادة الإنتاج يُصلح ويُختبر قبل نقل نفس الجزء إلى Module جديد.
- **Reason:** فصل كود مكسور ينقل المشكلة ويزيد تكلفة التشخيص.
- **Constraint:** لا يتحول ذلك إلى سلسلة Performance patches غير محدودة؛ الإصلاح يجب أن يكون صغيرًا ومثبت السبب.


## DEC-015 — E6F historical stable checkpoint

- **Date:** 2026-07-27
- **Status:** Superseded by DEC-017
- **Decision:** اعتماد E6F كنقطة الرجوع الحالية قبل بدء Module extraction.
- **Contains:** E6C foundation، E6D Enter gate، E6E right-click guard، E6F structural focus safety.
- **Evidence:** Clean/Rebuild PASS، الوظائف الأساسية PASS، Console بلا أخطاء بعد العمليات الهيكلية.
- **Rollback:** Git tag `E6E-Stable` أو الأساس `E6C-Baseline`.

## DEC-016 — Accept a provisional two-run performance baseline

- **Date:** 2026-07-27
- **Status:** Accepted by user
- **Decision:** استخدام متوسط تقريرين نظيفين كمرجع مؤقت بدل مطالبة المستخدم بجولة ثالثة.
- **Limitation:** عرض نافذة الاختبار اختلف، لذلك المرجع ليس Median صارمًا ولا يستخدم لإثبات تحسين صغير.
- **Use:** اكتشاف Regression واضح بعد Refactor فقط.
- **Simple example:** القياس مثل ميزان تقريبي يمنع زيادة كبيرة في الوزن، لكنه ليس ميزان معمل لإثبات فرق جرامات قليلة.


## DEC-017 — M5D4R3 is the current stable checkpoint

- **Date:** 2026-07-29
- **Status:** Accepted after user testing
- **Decision:** اعتماد `M5D4R3-Stable-Range-UX` كنقطة العمل والرجوع الحالية، مع بقاء E6C كأساس تاريخي للسلوك.
- **Contains:** Phase 5 clipboard ownership، in-place save reconciliation، global duplicate reporting، logical range clear، ordered validation، وdrag Auto-scroll بسرعة 8/32.
- **Rollback:** `M5D3-Stable-Range-Clear-And-Validation` إذا ظهر Regression خاص بالـAuto-scroll.

## DEC-018 — Final role and uniqueness terminology

- **Date:** 2026-07-29
- **Status:** Accepted
- **Decision:** `ProjectManager` هو الاسم النهائي. `Employee` هو اسم الـIdentity role التقني وDepartment Employee / موظف القسم هو اسم العرض. التفرد عالمي عبر الشركة وكل السنوات للزوج `WorkOrderNumber + WorkTypeCode`.
- **Impact:** لا Role migration أثناء Phase 6، ولا إعادة فتح Scope التفرد بدون متطلب أعمال جديد موثق.

## DEC-019 — Diagnose gradual fatigue with time windows and lifecycle resources

- **Date:** 2026-07-29
- **Status:** Accepted
- **Decision:** Phase 6.1 تقيس الأداء تلقائيًا في نوافذ 30 ثانية مع Listeners/Timers/RAF/Observers، بدل الاعتماد على علامة يدوية للحظة البطء.
- **Reason:** القياسات أثبتت أن التدهور تدريجي، وليس حدثًا مفاجئًا.
- **Constraint:** وضع Lifecycle تشخيصي فقط؛ أي تحسن نهائي يُثبت مجددًا في Baseline.

## DEC-020 — Accept current navigation performance without a runtime fix

- **Date:** 2026-07-29
- **Status:** Accepted by user
- **Decision:** إغلاق مسار تحسين الأسهم وEnter والـWheel حاليًا بدون Recovery أو Rewrite أو Targeted Patch، لأن المستخدم أكد أن السرعة العملية الحالية مقبولة.
- **Evidence:** Phase 6.0 أثبتت تدهورًا تدريجيًا، وPhase 6.1 لم تثبت تراكمًا مستمرًا في Timers أو Observers أو known lifecycle owners.
- **Reason:** القياس وحده لا يبرر تعديلًا عالي المخاطر عندما لا توجد مشكلة استخدام مؤثرة.
- **Reopen when:** اختبار 10,000 صف، شكوى فعلية، أو Regression مقارنة بالـBaseline.

## DEC-021 — Defer search debounce until a measured need exists

- **Date:** 2026-07-29
- **Status:** Accepted by user
- **Decision:** عدم إضافة Debounce للبحث الآن.
- **Reason:** البحث الحالي سريع مع بيانات البروتوتايب، وإضافة Debounce ستضيف تأخيرًا مقصودًا وTimer ومسار اختبار جديد دون فائدة مثبتة.
- **Reopen when:** البحث يصبح بطيئًا مع بيانات أكبر أو القياس يثبت تشغيل فلترة مكلفًا مع كل حرف.


## DEC-022 — Track changed fields and run only dependent rules

- **Date:** 2026-07-31
- **Decision:** Existing-row changes are tracked by stable field keys. Batch operations apply values together, and validation/save logic acts only on affected fields and rule dependencies.
- **Reason:** Editing one column across thousands of rows must not make the system revalidate or rewrite unrelated columns.
- **Example:** Pasting estimated value does not execute the global Work Order Number + Work Type duplicate rule. Editing either identity field does.
- **Future impact:** User-created columns must register stable metadata and use the same generic change pipeline. Core business fields remain strongly typed and indexed.

## DEC-023 — Explain project logic before code details

- **Date:** 2026-07-31
- **Decision:** Explanations must begin with the Work Orders business situation, the before/after behaviour, the exact user test, and remaining work. Internal code details are secondary.
- **Reason:** The user is directing product logic and testing but is not a programmer.


## DEC-024 — One lifecycle owner for each Work Orders grid instance

- **Date:** 2026-07-31
- **Status:** Accepted for focused regression
- **Decision:** `tabulatorLifecycle.js` owns state creation, lifecycle listeners, async cancellation, viewport lock, instance disposal, and final destroy. `tabulatorTest.js` coordinates initialization but must call the lifecycle owner for both year reinitialization and component disposal.
- **Reason:** the old and new year sheets must never receive the same keyboard, copy, paste, resize, or pointer action.
- **Example:** when the employee moves from 2026 to 2025, we disconnect the 2026 sheet before opening 2025, just as a machine is isolated before another control panel is connected.
- **Constraint:** R1 is extraction only. Navigation and resize algorithms are not changed until the lifecycle regression passes.

## DEC-025 — One interaction binding owner for each live Work Orders sheet

- **Date:** 2026-07-31
- **Status:** Accepted for focused regression
- **Decision:** `tabulatorInteractions.js` owns binding grid/window/document user interactions. `tabulatorLifecycle.js` owns their cleanup. The feature algorithms remain in their existing modules during R2.
- **Reason:** event ownership must be auditable before future user-created columns and layouts are added. A new column may register metadata and reuse the shared route, but must not add another document-level keyboard or clipboard path.
- **Example:** a custom “Estimated Value” input column uses the existing direct-typing, selection, Copy/Paste, Undo, and dirty-field pipeline. It does not install a new keydown handler.
- **Constraint:** R2 is extraction only; no shortcut, navigation, resize, clipboard, context-menu, or edit behavior is intentionally changed.



## 2026-07-31 — Give the Blazor Save Workflow One File Owner

**Decision:** move `SaveChangesAsync`, the save stream limit, save-only mapping helpers, and save-only DTOs from `WorkOrders.razor.cs` to `WorkOrders.Save.cs` without altering their content.

**Reason:** the verified save workflow is large and business-sensitive. Keeping it mixed with page loading, year switching, and disposal makes future changes harder to review and increases the chance of accidentally changing unrelated behaviour.

**Business example:** changing the message shown after moving three work orders to 2027 should require reviewing the save workflow only; it should not require navigating through grid initialization and year-loading code.

**Constraint:** no JavaScript API, service contract, uniqueness rule, authorization rule, transaction, status message, or performance stage may change in this extraction.

## 2026-07-31 — Separate Save Request Preparation from Result Interpretation

**Decision:** keep one `SaveChangesAsync` coordinator, but move browser-delta-to-service-request preparation into `WorkOrders.SaveRequest.cs` and service-result-to-browser-presentation preparation into `WorkOrders.SaveResult.cs`.

**Reason:** after R1 proved the complete save journey still works, the next safest boundary is to separate “what will be saved?” from “what did the server decide and what must the employee see?” This makes duplicate, concurrency, moved-year, and temporary-row logic reviewable without mixing them with stream reading and loading-state cleanup.

**Business example:** changing Basket in one row produces a changed-row request. A duplicate failure produces cell marks and a failure message. These are different decisions and must not be hidden inside one long button method.

**Constraint:** R2 does not change the service contract, global identity rule, year movement, row-version protection, Arabic messages, JavaScript calls, or performance stage names. Browser dirty-state extraction remains a later step after R2 runtime regression.



## 2026-07-31 — Give Browser Dirty State One Module Owner

**Decision:** extract original row snapshots, dirty row ids, changed field keys, deleted saved-row ids, dirty/deleted Save collection, and post-Save baseline acceptance into `tabulatorDirtyState.js` while preserving the existing public `tabulatorTest` method names.

**Reason:** the same unsaved-state collections were being read or mutated from initialization, field edits, structural operations, Undo/Redo, Save streaming, and Save reconciliation. A single owner makes it reviewable whether the screen, Save request, and unsaved count describe the same data.

**Business example:** after changing Basket and then undoing to the stored value, the order must stop appearing as unsaved. After a successful Save, the server row version—not the pre-save browser version—must become the new comparison baseline.

**Constraint:** R3 does not change field definitions, validation, uniqueness, year routing, service calls, database writes, Arabic messages, Undo/Redo algorithms, or performance-stage names. It does not add autosave or persistence for Undo history across refresh.


## 2026-07-31 — Split Read Queries Before Save Mutations

**Decision:** Phase 8.8-R1 moves the implementation of `LoadSheetAsync` to a scoped `WorkOrderQueryService`, while retaining forwarding overloads on `WorkOrderService` for compatibility.

**Reason:** the read path has a clean, read-only boundary—employee scope, available years, and selected-year projection—and does not need the mutation transaction. Extracting it first reduces the 1,395-line service without mixing the change with global uniqueness, RowVersion, deletes, or database writes.

**Business example:** opening another year should only read the employee's department and return rows in sheet order. It must not instantiate save rules or alter any work order.

**Constraint:** R1 preserves query filters, projection, ordering, performance stage names, and the existing page call. No save method, validation rule, transaction boundary, uniqueness scope, or database schema is changed.

## DEC-026 — No test-green patch stacking; Phase 9.2D2 requires consolidation before closure

- **Date:** 2026-08-04
- **Status:** Accepted by user
- **Decision:** لا يتم إنشاء أو تكديس Patch جديد لمجرد جعل الاختبار ينجح. لا تُغلق Phase 9.2D2 قبل مراجعة حجم وتعقيد الكود الناتج، حذف التكرار والمسارات القديمة والمؤقتة، وتوحيد التعديلات في تنفيذ نهائي نظيف.
- **Reason:** نجاح الاختبار وحده قد يخفي تضخمًا في الكود أو Helpers وWaits وFallbacks متكررة، فيجعل الاختبارات نفسها أصعب في الصيانة وأقل موثوقية.
- **Required evidence before closure:**
  - مقارنة صافي الأسطر والدوال والتعقيد مع بداية Phase 9.2D2.
  - تصنيف كل فشل من الأدلة قبل أي تعديل جديد.
  - مسار واحد واضح لقراءة الخلية النشطة، انتظار جاهزية السنة، والتمرير الافتراضي.
  - حذف Dead Code والـtemporary diagnostics والـobsolete waits والـfallbacks غير اللازمة.
  - إعادة Stress والـPerformance baseline المطلوبين بعد التنظيف.
  - توثيق صافي التغيير والدين الفني المتبقي.
- **Constraint:** لا يُقبل Patch إضافي كطبقة فوق الحل السابق إذا كان استبدال المسار الخاطئ أو تبسيطه ممكنًا.
- **Simple example:** إذا ثبت أن الاختبار يقرأ موضع الخلية من State قديم، يُستبدل هذا القارئ بالقارئ الصحيح من Tabulator بدل إبقائه وإضافة قارئ احتياطي ثانٍ.



## DEC-027 — Persist column widths by department, not by year or user

- **Date:** 2026-08-04
- **Status:** Accepted by user
- **Decision:** Core and custom Work Orders column widths are saved by `DepartmentId + FieldKey`, shared across every year of that department. Width changes require the existing Save button and participate in Undo/Redo before Save.
- **Header rule:** title, filter icon, and sort icon form one adjacent group. Long titles ellipsize so controls do not move to the far edge or disappear.
- **Reason:** the same department sheet must keep one familiar layout while still allowing the employee to make narrow or wide columns without wasting horizontal space.
- **Constraint:** Phase 9.3B changed width only. Later decisions govern rename, delete, immutable type, filters, sorting, and visibility.


## DEC-028 — Remove legacy Status and Notes fields

- **Date:** 2026-08-05
- **Status:** Accepted by user
- **Decision:** `Status` and `Notes` are removed completely from Work Orders. They are not converted into custom columns. The migration drops both database columns and intentionally deletes their existing values.
- **Protected columns:** Work Order Number, Work Type, Assignment Date, Work Order Value, Partial Amount, Remaining Amount, and Basket only.
- **Reason:** every non-core business field should be created explicitly through the department custom-column system rather than retaining two special legacy fields.
- **Constraint:** no compatibility alias or hidden fallback remains in the entity, DTOs, save pipeline, grid columns, filters, validation, tests, or current documentation. A department may later create its own custom Text column with any suitable name.

## DEC-029 — Immutable custom-column types and lightweight client-side Header behavior

- **Date:** 2026-08-05
- **Status:** Accepted by user
- **Type rule:** A custom-column type is selected once at creation and cannot be changed later. `Custom Column Properties` permits rename only; deletion is a separate confirmed action.
- **Automatic Header rule:** Custom `Text`, `Date`, and whole `Number` columns receive value filters. Custom `Money` columns receive numeric sorting only, starting descending.
- **Visibility rule:** `Hide Column` is available from a visible data-column Header. `Unhide Column` appears in the same context menu only when hidden columns exist and lists them on demand. No permanent `Columns` toolbar button is added.
- **Persistence rule:** Width and hidden state are saved by `DepartmentId + FieldKey`, shared by every year of the department, and written only through the existing explicit Save transaction. Hide/Unhide participates in Undo/Redo before Save.
- **Performance rule:** Filtering, sorting, hiding, and showing operate on the existing Tabulator data in the browser. No server request is made for those interactions. The hidden-column list is built only when the context menu opens, and the obsolete database scan that supported empty-only type conversion is removed.
- **Safety constraint:** The row-number column cannot be hidden and at least one data column remains visible, because Unhide is intentionally reachable only through a visible Header.

## DEC-030 — RevoGrid Community 4.25.2 selected for Work Orders

- **Date:** 2026-08-20
- **Status:** Accepted by user
- **Decision:** اعتماد **RevoGrid Community 4.25.2** كمحرك Work Orders المستهدف بدل Tabulator بعد اكتمال isolated qualification.
- **Current-runtime constraint:** لا يتغير `/work-orders` إلى RevoGrid قبل Gate 5A/5B/5C.
- **Evidence:** 100,000-row core gate plus ERP history/readonly/delete/custom-column/Split/RTL/Zoom gates passed in the isolated shootout. The frozen reference is `wwwroot/grid-shootout/REVOGRID_FROZEN_BASELINE_2026-08-20.json`.
- **Paste rule evidence:** RevoGrid matched the approved end-of-sheet truncation rule in the accepted gate. Univer did not: a 4,000-value Paste with only 200 rows available expanded the sheet by 3,800 rows.
- **License/version rule:** pin exact `4.25.2`; Community package is MIT-licensed. Self-host package assets and retain license text before production cutover. Do not depend on `latest`.
- **Migration rule:** preserve existing Work Orders business/server contracts and frozen visual sizes. Reimplement required interaction behavior using public RevoGrid APIs; do not mechanically port Tabulator internals.
- **Rollback:** keep the current Tabulator route intact until the RevoGrid cutover checkpoint passes full regression.


## DEC-031 — One RevoGrid Change Engine owns session change history

- **Date:** 2026-08-21
- **Status:** Accepted by user for Gate 5B foundation
- **Decision:** Build one grid-independent Change Engine before wiring RevoGrid Edit/Paste/Delete/Insert/Custom Columns. User data changes must enter the same transaction/history model rather than each feature creating its own Undo/Dirty logic.
- **Identity:** `ClientKey` is the stable row identity inside the browser session. Database `Id` may appear after the first Save and must not require re-keying History. `DisplayOrder` remains the separate ordering value used to place rows between existing rows.
- **Dirty rule:** Dirty means current value differs from the last server-accepted Baseline. Returning to the Baseline removes Dirty without deleting History.
- **History rule:** Save does not clear Undo/Redo. A new user edit after Undo clears Redo. A multi-cell Paste is one transaction.
- **Year rule:** Dirty blocks dataset/year replacement. When the sheet is Clean and the employee changes year, the old year's Undo/Redo History is cleared and the new year starts as a new dataset session.
- **Save rule:** The server remains authoritative. A successful Save advances the Baseline only for the accepted Save snapshot; a failed Save leaves Baseline, Dirty, and History unchanged.
- **Memory rule:** History uses a configurable memory budget, not only a transaction count. The newest single transaction remains undoable even if that transaction alone exceeds the configured budget.
- **Architecture constraint:** Gate 5B foundation is implemented as a pure browser module with no RevoGrid binding. RevoGrid event integration is a later client of this engine after the standalone engine passes its own regression.
- **Reference rule:** RevoGrid Community public events/source are the implementation base. RevoGrid Pro Event/History architecture is used only as a behavioral/ownership reference; no proprietary code is copied. Tabulator remains a lessons-only reference.

## DEC-032 — Gate 5B-1 uses one RevoGrid-to-Change-Engine bridge for Cell Edit

- **Date:** 2026-08-21
- **Status:** Accepted for Gate 5B-1 qualification
- **Decision:** Cell Edit is the first real RevoGrid client of the standalone Change Engine. The bridge captures `beforeedit`, lets RevoGrid apply the value, then finalizes from `afteredit`. Undo/Redo replays the engine transaction against the same row objects and refreshes RevoGrid without replacing the full source.
- **Session identity:** Gate 5B-1 assigns each loaded row a session `ClientKey`; database `Id` and ordering `DisplayOrder` remain separate responsibilities.
- **Scope guard:** Range mutations, including Paste, are blocked in Gate 5B-1 so they cannot change data outside the engine before the Paste binding gate is implemented.
- **Keyboard rule:** Grid Ctrl+Z/Ctrl+Y uses the Change Engine only after a cell edit is committed. While the text editor is still open, keyboard undo/redo remains owned by the editor.
- **Year rule:** A year switch starts only when the engine is Clean. Editing is locked during the dataset-load handshake; successful replacement resets the engine to the new dataset and clears old History. Failure keeps the old dataset session active.
- **Production constraint:** `/work-orders` remains Tabulator and Gate 5A behavior remains unchanged when `EnableChangeEngine` is false. No database Save is added in Gate 5B-1.
