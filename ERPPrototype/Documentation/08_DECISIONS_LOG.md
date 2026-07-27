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

## DEC-008 — E6C is the official baseline

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** E6C هي نقطة الرجوع الرسمية.
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
