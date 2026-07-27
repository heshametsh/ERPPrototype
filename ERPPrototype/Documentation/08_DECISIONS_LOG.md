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


## DEC-013 — E6E is the current stable checkpoint

- **Date:** 2026-07-27
- **Status:** Accepted after user testing
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


## DEC-015 — E6F is the current stable checkpoint

- **Date:** 2026-07-27
- **Status:** Accepted after user testing
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
