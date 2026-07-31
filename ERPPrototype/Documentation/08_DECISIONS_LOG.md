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

## DEC-004 — Tabulator is the current grid

- **Status:** Accepted for prototype validation
- **Decision:** Tabulator 6.5.0 هو Grid الحالي، ولا توجد Syncfusion في الكود.
- **Reason:** الوصول لتجربة أقرب إلى Excel والتحكم في keyboard/range/clipboard.
- **Condition:** القرار النهائي يعتمد على اختبار 3,000 و10,000 صف والاستقرار الطويل.

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

**Business example:** changing Notes in one row produces a changed-row request. A duplicate failure produces cell marks and a failure message. These are different decisions and must not be hidden inside one long button method.

**Constraint:** R2 does not change the service contract, global identity rule, year movement, row-version protection, Arabic messages, JavaScript calls, or performance stage names. Browser dirty-state extraction remains a later step after R2 runtime regression.

