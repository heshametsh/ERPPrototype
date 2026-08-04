# مراجعة شاملة لمشروع ERP Prototype قبل اختبار الأداء

**تاريخ المراجعة:** 2026-08-04  
**النسخ التي تمت مراجعتها:** `ERPPrototype.zip` و`ERPPrototype.E2ETests.zip` و`ERPPrototype.IntegrationTests(1).zip`  
**الغرض:** تقييم صحة الكود، تنظيمه، قابليته للصيانة، الدين الفني، وجود تداخلات أو تراكمات، ومدى صلاحية منصة اختبار الأداء الحالية قبل تشغيل أي Benchmark.

---

## 1. الحكم التنفيذي

المشروع **ليس مشروعًا فوضويًا أو مكسورًا**. قلب أوامر العمل، قواعد الحفظ، سلامة قاعدة البيانات، منع التكرار، نطاق القسم، `RowVersion`، المعاملات، والحسابات المالية مكتوبة بصورة جيدة ومغطاة باختبارات قوية. نجاح `17/17` Integration و`55/55` Browser Stress الذي ظهر عندك دليل مهم على أن المسارات الأساسية تعمل بالفعل.

لكن المشروع لديه **دين فني حقيقي ومركّز** في أربع مناطق:

1. كود شيت Tabulator في المتصفح تضخم؛ الملفات مقسمة إلى Modules، لكن داخلها ما زالت توجد دوال بطول 300–800 سطر ومسؤوليات كثيرة متداخلة.
2. `WorkOrderService.SaveChangesAsync` صحيح ومختبر، لكنه أصبح Orchestrator ضخمًا بطول يقارب 658 سطرًا داخل ملف 971 سطرًا.
3. اختبارات المتصفح ممتازة في التغطية، لكنها مبنية كرحلة واحدة ضخمة وPage Object ضخم، ومنصة اختبار الأداء الحالية **غير صالحة كـBenchmark موثوق بالشكل الحالي**.
4. التشغيل والإدارة والحسابات الإدارية ما زالت Prototype-grade: Seeder عند كل Startup، بعض قواعد الحسابات الثابتة محمية في التطبيق فقط لا في قاعدة البيانات، وصفحات الإدارة تتعامل مباشرة مع EF Core.

**الخلاصة:**  
سلامة الوظائف الحالية قوية. قابلية الصيانة متوسطة. المشروع صالح للاستمرار كبروتوتايب متقدم، لكنه يحتاج مرحلة ضبط هندسي محدودة قبل استخدام نتائج الأداء لاتخاذ قرارات أو قبل اعتباره منتجًا تجاريًا.

---

## 2. نطاق المراجعة وما تم فعليًا

تمت مراجعة:

- **125 ملفًا مملوكًا للمشروع** من C# وRazor وJavaScript وCSS وPowerShell وSQL وملفات الإعداد، بإجمالي يقارب **38,233 سطرًا**.
- **16 ملف EF Core مولّدًا** من Migration Designers وModel Snapshot، بإجمالي يقارب **8,732 سطرًا**، وتمت مراجعته هيكليًا للتأكد من اتساق النموذج والفهارس والقيود، وليس تقييم Boilerplate المولد كسطر مكتوب يدويًا.
- ملفات اختبارات Integration وE2E كاملة.
- جميع ملفات JavaScript المملوكة للمشروع اجتازت `node --check`.
- ملفات JSON الأساسية قابلة للقراءة، ولم يظهر Secret إنتاجي واضح داخل المصدر. Connection String الموجود Development LocalDB فقط، والـInitial Admin يعتمد على Configuration/User Secrets.
- لم يظهر استخدام `async void`، أو `.Result/.Wait()` في كود التطبيق، أو Raw SQL إنتاجي غير مضبوط، أو TODO/FIXME مهملة في الكود الحالي.
- تمت مقارنة الموديل الحالي مع عمليات الـMigrations ونتيجة Pending Model/runtime evidence التي نجحت عندك.

**حد المراجعة:** لا يوجد .NET SDK داخل بيئة المراجعة هنا، لذلك لم أشغّل Build جديدًا من جانبي. اعتمدت في Runtime على نتيجتك الأخيرة: Build PASS وIntegration `17/17` وBrowser `55/55`.

---

## 3. التقييم العام

| المحور | التقييم | الحكم |
|---|---:|---|
| صحة قواعد أوامر العمل | 8.5/10 | قوية ومحمية في أكثر من طبقة |
| سلامة البيانات والمعاملات | 8.5/10 | Transaction وRowVersion وConstraints ممتازة |
| الصلاحيات الأساسية | 8/10 | نطاق الموظف يعاد فحصه على السيرفر |
| قابلية صيانة C# | 6.5/10 | جيدة خارج WorkOrderService وصفحات الإدارة |
| قابلية صيانة JavaScript | 5/10 | Modules موجودة، لكن الدوال الداخلية ضخمة |
| CSS | 7/10 | تحسن بعد 9.2C، وما زال يحتاج سياسة Specificity |
| تغطية الاختبارات | 8.5/10 | واسعة ومفيدة |
| قابلية صيانة الاختبارات | 5/10 | Mega-journey وPage Object ضخم |
| جاهزية Benchmark الأداء | 4/10 | المنصة الحالية تلوث القياس |
| جاهزية التشغيل التجاري | 6/10 | تحتاج Operations، Admin services، Logs، Concurrency، Backup/Security review |

---

# 4. قرار مهم قبل اختبار الأداء

## لا تعتمد اختبار Phase 9.2D الحالي كقياس أداء نهائي

الاختبار الحالي مفيد كفكرة لاكتشاف تدهور Arrow Navigation، لكنه بالشكل الحالي سيعطي أرقامًا يصعب الوثوق بها للأسباب التالية.

### 4.1 الاختبار يجبر وضع Observe

في:

`Tools/Invoke-ERPPerformanceSoak.ps1:24-29`

يتم تشغيل Stress مع `-Observe`.

وفي:

`ERPPrototype.E2ETests/E2EBrowserSession.cs:7-9`  
`ERPPrototype.E2ETests/E2EBrowserSession.cs:274-281`

وضع Observe يضيف `SlowMo = 650 ms` لكل Playwright Action. اختبار Arrow ينفذ 880 ضغطة متتابعة في:

`ERPPrototype.E2ETests/WorkOrdersPage.cs:2474-2484`

وهذا يعني أن زمن Wall Clock يصبح متأثرًا عمدًا بدقائق من SlowMo، وليس بسرعة الشيت فقط.

### 4.2 الـTracing يعمل دائمًا

في:

`E2EBrowserSession.cs:71-77`

يتم تشغيل Playwright Trace مع Screenshots وSnapshots وSources في كل تشغيل. هذا ممتاز عند تشخيص الفشل، لكنه يضيف حملًا غير مناسب لتشغيل Benchmark كمي.

### 4.3 ما يسمى Cold ليس Cold فعليًا

اختبار الأداء يدخل داخل رحلة Stress الطويلة عند:

`Phase9FoundationBrowserTest.cs:1156-1184`

بعد تسجيل الدخول، التحميل، البحث، الفلاتر، الفرز، التعديلات، الحفظ، Undo/Redo، اختيار السنة وغيرها. هو Cold بالنسبة لSegment القياس فقط، لكنه ليس Browser/Page/Grid cold baseline.

### 4.4 أداة القياس نفسها تغيّر التطبيق

الاختبار يشغّل `tabulatorPerformance.start()` ثم يركب Wrappers وObservers وLifecycle tracking. الأداة تحاول قياس Overhead الخاص بها، وهذا جيد تشخيصيًا، لكن أي رقم حاسم يجب أن يتأكد أيضًا في تشغيل بدون Profiler.

### 4.5 Threshold مطلق غير مرتبط بالجهاز

الاختبار يفرض P95 أقل من 100ms ونسبة تدهور معينة في:

`Phase9FoundationBrowserTest.cs:1217-1260`

لكن لا يوجد Baseline مثبت حسب الجهاز، نوع Browser، Build، CPU power mode، Viewport، ووجود Antivirus/Visual Studio. المقارنة الصحيحة تكون أساسًا مع Baseline من نفس الجهاز والنسخة، ثم Budget مطلق كحد أمان ثانوي.

### 4.6 حجم البيانات واحد فقط

الاختبار يقيس 1,000 صف. هذا جيد كحد أدنى، لكنه لا يكفي للحكم على منتج لديه بيانات فعلية أكبر. يجب قياس:

- 1,000 صف للمقارنة الحالية.
- أسوأ Sheet حقيقي لديك حسب Department + Year.
- 5,000 صف.
- 10,000 صف لتحديد نقطة الانهيار، وليس كشرط أن يكون الاستخدام اليومي 10,000.

## الشكل الصحيح لاختبار الأداء

يجب إنشاء Suite مستقلة اسمها مثلًا `Performance`:

1. Web process وقاعدة مؤقتة جديدان.
2. Browser/Page جديدان.
3. تسجيل دخول ثم فتح الشيت فقط.
4. تشغيل Headless أو Headed بدون `SlowMo`.
5. تعطيل Trace/Screenshot أثناء القياس، وتشغيلها فقط عند الفشل أو في Observe منفصل.
6. Warm-up قصير لا يدخل في النتيجة.
7. خمس Runs مستقلة؛ نسجل Median وP95 ونستبعد أول Run أو نعلّمه Warm-up.
8. تشغيل بدون Profiler، ثم تشغيل Diagnostic منفصل إذا ظهر تدهور.
9. حفظ Machine metadata وCommit hash وDataset size وViewport.
10. عدم خلط Arrow وEnter وWheel والبحث في نفس الجلسة.

**إذن لا أنصح بتشغيل Patch 9.2D الحالي واتخاذ قرار بناءً على PASS/FAIL قبل تصحيح الـHarness.**

---

# 5. نقاط القوة المؤكدة

## 5.1 نموذج قاعدة البيانات قوي

في `Data/ApplicationDbContext.cs`:

- فهرس Unique عالمي على `(WorkOrderNumber, WorkTypeCode)` عند السطور `161-168`.
- فهرس قراءة على `(DepartmentId, WorkYear, DisplayOrder)` عند `154-159`.
- Check Constraints للأرقام ذات 9 و3 خانات عند `81-87`.
- قيود مالية تمنع القيم غير المنطقية عند `89-99`.
- `RowVersion` عند `139-140`.
- علاقات Restrict تمنع حذف بيانات مرجعية بطريقة عشوائية.

هذا من أفضل أجزاء المشروع؛ القواعد الحرجة ليست معتمدة على الواجهة فقط.

## 5.2 Scope الموظف يعاد التحقق منه على السيرفر

`WorkOrderQueryService` و`WorkOrderService` لا يثقان في DepartmentId القادم من المتصفح. يتم استنتاج Scope من المستخدم الفعلي، مع فحص:

- الحساب Active.
- `MustChangePassword` انتهى.
- Role هو Employee.
- Department موجود.

هذا يمنع مستخدمًا من تعديل قسم آخر بمجرد تعديل Payload في المتصفح.

## 5.3 الحفظ ذري

`WorkOrderService.SaveChangesAsync` يبدأ Transaction واحدة عند `153-156`، ويطبق Add/Update/Delete داخلها ويعمل Rollback عند الفشل. توجد اختبارات تثبت Rollback والتعارض والتكرار والحفظ الجماعي.

## 5.4 فصل قواعد مالية وتجهيز خطة الحفظ جيد

`WorkOrderFinancialRules` Pure ومركزي، وRemaining Amount مشتق وغير مخزن.  
`WorkOrderSavePlanBuilder` لا يفتح DB ولا Transaction، ويجمع التطبيع والتحقق وتجهيز الخطة. هذا يسهل الاختبار ويقلل تكرار القواعد.

## 5.5 Lifecycle في JavaScript أفضل من الشكل الذي يوحي به حجم الملفات

`tabulatorLifecycle.js:222-358` يفصل إزالة Document/Window handlers، وإلغاء Timers وAnimation Frames، وإغلاق Popup وRange Auto Scroll، وتدمير Table. هذه نقطة قوية وتقلل احتمالية أن يكون “الشيت بيموت” بسبب Listener leak مباشر.

## 5.6 الاختبارات تغطي القواعد الحساسة

الـIntegration يغطي التكرار العالمي، Scope، RowVersion، نقل السنة، القيم المالية، Constraints، Transaction rollback، و1,000-row batch.

الـE2E يغطي 55 Check تشمل Load، Virtual DOM، Search، Filters، Sort، Save، Refresh persistence، الحسابات، Undo/Redo، Selection totals، Year switching، Structure stress، Duplicate correction، Delete، ونقل السنة.

---

# 6. الملاحظات عالية الأولوية

## F01 — WorkOrderService أصبح God Method

**المكان:** `Data/WorkOrderService.cs:71-727`  
**الدرجة:** عالية للصيانة، وليست Bug حاليًا.

الـMethod الواحد مسؤول عن:

- بناء الخطة.
- Authorization.
- Duplicate scope/query/evaluation.
- DisplayOrder allocation.
- تحميل Deletes وUpdates.
- Concurrency tokens.
- Add/Update/Delete mapping.
- Audit fields.
- Transaction/Commit/Rollback.
- Error translation.
- Performance stages.

الكود مرتب نسبيًا ومشروح، لكن أي تغيير في قاعدة واحدة يحتاج فهم مئات الأسطر، ويزيد فرصة Side Effect.

**التوصية:** لا تعمل Rewrite. حافظ على Public facade، واستخرج داخليًا بالترتيب:

1. `WorkOrderAuthorizationService`
2. `WorkOrderDuplicateDetector`
3. `DisplayOrderAllocator`
4. `WorkOrderPersistenceExecutor`

كل Extraction في Commit منفصل، والاختبارات الحالية يجب أن تظل خضراء بدون تغيير سلوك.

---

## F02 — Race في DisplayOrder

**المكان:**  
`WorkOrderService.cs:359-404`  
`ApplicationDbContext.cs:154-159`

الخدمة تقرأ أعلى DisplayOrder ثم تضيف `1_000_000_000`. الفهرس الحالي غير Unique. لو جلستان لنفس القسم والسنة حفظتا في نفس الوقت، يمكن أن تحصلا على نفس القيمة.

وجود `ThenBy(Id)` يجعل العرض Deterministic، لكنه لا يحفظ ترتيب الإدراج المقصود.

**التوصية:** أحد الحلول:

- Unique index على `(DepartmentId, WorkYear, DisplayOrder)` مع Retry allocator.
- أو Table/Sequence خاصة بالتخصيص.
- أو Lock/Serializable transaction حول قراءة وتخصيص الرقم.

قبل التنفيذ، أضف Integration test بجلستين متوازيتين لنفس القسم والسنة.

---

## F03 — Duplicate evaluation فيها O(n × m)

**المكان:** `WorkOrderService.cs:278-288`

لكل Incoming row يتم عمل `FirstOrDefault` على `possibleConflicts`. مع Batch كبير تصبح المقارنة تربيعية نسبيًا.

**التوصية:** حوّل `possibleConflicts` مرة واحدة إلى Dictionary keyed by normalized identity، ثم Lookup O(1). التغيير صغير وقابل للاختبار، لكن يفضل عمله بعد تثبيت Baseline الأداء حتى نقيس أثره.

---

## F04 — Seeder عند كل Startup مخاطرة تشغيلية

**المكان:**  
`Program.cs:80-144`  
`ApplicationSeeder.cs`

الإيجابي: Seeder يحاول أن يكون صارمًا ولا يصلح بيانات خطرة بصمت.  
المخاطر:

- يعمل في كل Startup.
- أكثر من App instance يمكن أن ينفذا Role/Admin/Department creation في نفس الوقت.
- وجود أكثر من Admin يوقف التطبيق عند `ApplicationSeeder.cs:49-54`.
- وجود Department Type غير متوقع يوقف التطبيق عند `194-205`.
- إنشاء Department Types ثم Departments يتم عبر `SaveChanges` مرتين عند `224` و`250` بدون Transaction واحدة.
- تعطل SQL وقت التشغيل قد يؤدي إلى Startup failure و`500.30`.

**التوصية:** افصل Migration/Bootstrap عن Startup الطبيعي، أو استخدم SQL application lock + Transaction + idempotent operations. في Production اجعل Deployment step واضحًا، ولا تجعل كل Restart مسؤولًا عن Repair قواعد البيانات.

---

## F05 — تضارب قاعدة Status

**المكان:**  
`ApplicationDbContext.cs:132-134`  
`WorkOrderFieldRegistry.cs:57-64`  
`WorkOrderSavePlanBuilder.cs:303-307`

قاعدة البيانات تقول `Status` Required، لكن Required fields للصف الجديد لا تشمل Status، والتحقق لا يرفض Empty Status؛ يفحص الطول فقط. لأن Entity default هو empty string، يمكن حفظ `""` رغم أن معنى Required يوحي بقيمة حقيقية.

**القرار المطلوب قبل ميزات جديدة:**

- لو Status مطلوب: أضفه إلى Required validation أو أعطه Default business value واضح.
- لو Status اختياري: اجعله Nullable في النموذج والـMigration.

لا تترك الطبقات تختلف في معنى الحقل.

---

## F06 — Fixed user-account uniqueness محمية في التطبيق فقط

**المكان:** `Data/UserManagementService.cs:124-147`

قاعدة “مدير فرع واحد” و“موظف واحد لكل قسم” تفحص Query ثم تنشئ المستخدم. طلبان متزامنان يمكن أن ينجحا في الفحص ثم ينشئا حسابين.

كما أن فشل AddToRole يحاول حذف المستخدم عند `196-204`، لكن نتيجة `DeleteAsync` لا تُفحص ولا تُسجل.

**التوصية:** الأفضل تمثيل Account type/assignment في Entity يمكن وضع Unique Index عليه. لو هذا كبير الآن، استخدم Serializable transaction أو DB application lock حول الإنشاء، وسجل فشل عملية Rollback.

---

## F07 — صفحات الإدارة تتعامل مباشرة مع EF

**المكان:**  
`Components/Pages/AdminPanel.razor:12,174-347`  
`Components/Admin/BranchUsersList.razor:120-141`  
`Components/Admin/BranchUserForm.razor`

هذا يجعل UI مسؤولة عن Queries وPersistence وقواعد التكرار ورسائل الأخطاء. كما توجد Catches بدون Logging:

- `BranchUserForm.razor:253-256`
- `BranchUsersList.razor:143-147`
- `AdminPanel.razor:253-257` و`338-342` تلتقط DbUpdateException دون Log.

**التوصية:** أنشئ `BranchManagementService` وQueries مخصصة، وأبق Razor مسؤولة عن العرض فقط. أضف `ILogger` وCancellationToken.

---

## F08 — تغيير كلمة المرور عمليتان غير ذريتين

**المكان:** `ChangePassword.razor:117-139`

Password يتغير أولًا، ثم يتم تحديث `MustChangePassword=false`. لو العملية الثانية فشلت، كلمة المرور تغيرت لكن الحساب ما زال يطلب التغيير، والواجهة تعرض فشلًا جزئيًا.

**التوصية:** صمم نتيجة Partial success واضحة ومسار Recovery، أو نفذ عملية Store/Transaction مناسبة. أضف Integration test لهذا السيناريو.

---

# 7. ملاحظات واجهة Work Orders وBlazor

## F09 — لا يوجد Component Cancellation

`WorkOrders` يطبق `IAsyncDisposable` ويهدم Tabulator جيدًا، لكنه لا يملك `CancellationTokenSource` يلغي Load/Save/JS interop عند مغادرة الصفحة أو انقطاع Circuit. Service APIs أصلًا تدعم CancellationToken، لكن الصفحة لا تمرره.

**التوصية:** Component CTS يتم إنشاؤه عند البداية ويلغى في Dispose، ويمرر إلى Load/Save والعمليات الطويلة.

## F10 — `OnAfterRenderAsync` لا يستخدم firstRender صراحة

`WorkOrders.razor.cs:154-166` يعتمد على `GridInitialized/IsLoading` بدل `firstRender`. هذا يعمل حاليًا ويسمح بإعادة تهيئة السنة، لكنه يحتاج تعليق Contract أو Method منفصلة لأن الاسم يوحي Initialization أول مرة فقط.

## F11 — Inline JavaScript handlers

`WorkOrders.razor:75-112` يستخدم:

`onclick="window.tabulatorTest..."`

هذا يربط Razor بـGlobal API كسلسلة نصية، ويضعف CSP، وإعادة التسمية، والاختبار.

**التوصية:** Blazor `@onclick` wrappers تستدعي JS interop، أو JS module reference مع API typed/centralized.

## F12 — Mapping وتطبيع متكرر

Mapping من DB/Save result إلى `TabulatorWorkOrderRow` موجود في أكثر من مكان:

- `WorkOrders.razor.cs`
- `WorkOrders.SaveResult.cs`

وكذلك Blank checks/normalization توجد في C# browser DTO وEntity layers، مع نسخة أخرى من قواعد الهوية داخل JS.

بعض التكرار عبر Client/Server ضروري، لكن يجب أن توجد Contract tests تمنع اختلاف القواعد.

**التوصية:** استخرج `TabulatorWorkOrderRowMapper` وValue parsers، وأضف tests لأرقام عربية/إنجليزية، التواريخ، amounts، والblank semantics.

## F13 — Time hardcoded

`DateTime.Now.Year` موجود في:

- `WorkOrders.razor.cs:30,38`
- `WorkOrders.Save.cs:242`
- `WorkOrderService.cs:47`
- `WorkOrderQueryService.cs:24,127`

هذا يجعل اختبار نهاية السنة والمنطقة الزمنية صعبًا.

**التوصية:** حقن `TimeProvider` واستخدامه من مكان واحد.

---

# 8. مراجعة JavaScript بالتفصيل

## الحكم العام

تقسيم Modules خطوة صحيحة. `registerModule` يمنع استبدال أعضاء مكررة، والـLifecycle cleanup جيد. لكن التقسيم الحالي فصل الملفات أكثر مما فصل المسؤوليات الداخلية؛ توجد Functions ضخمة جدًا.

## أكبر الدوال

| الملف والدالة | الحجم التقريبي |
|---|---:|
| `tabulatorTest.applySavedDelta` | 812 سطر |
| `tabulatorInteractions.bindGridCommandInteractions` | 731 سطر |
| `tabulatorValidation.fixedDigitsEditor` | 516 سطر |
| `tabulatorTest.initialize` | 505 سطر |
| `tabulatorFilters.createDatePopup` | 479 سطر |
| `tabulatorStructure.applyStructureTransaction` | 418 سطر |
| `tabulatorFilters.createValuePopup` | 359 سطر |
| `tabulatorFilters.createAmountPopup` | 303 سطر |

هذه ليست مشكلة Style فقط؛ هي تجعل تشخيص الأداء والتأكد من Cleanup صعبًا.

## مراجعة كل Module رئيسي

### `tabulatorTest.js` — 2,474 سطر

**الجيد:** Coordinator واضح، Module registration، Virtual DOM policy مركزية، Save delta streaming، حماية إعادة التهيئة.  
**المشكلة:** `initialize` و`applySavedDelta` يمتلكان تنسيقًا واسعًا بين Modules، Mapping، History، Validation، Aggregates، IDs، viewport، وstatus.  
**التوصية:** استخرج `GridInitializer` و`SavedDeltaReconciler` كملفين داخليين، بدون تغيير Public API.

### `tabulatorLifecycle.js` — 494 سطر

من أفضل Modules. State construction وCleanup مركزيان. لا أوصي بإعادة كتابته الآن. أضف فقط Unit tests/diagnostic assertions لاستمرار توازن listeners/timers عبر تغيير السنة عدة مرات.

### `tabulatorInteractions.js` — 852 سطر

`bindGridCommandInteractions` بطول 731 سطر يجمع Editing، selection، keyboard navigation، printable keys، copy/paste، context ownership، وdocument handlers.

**التوصية:** تقسيمه إلى:

- `bindEditingInteractions`
- `bindKeyboardNavigation`
- `bindClipboardInteractions`
- `bindSelectionInteractions`

وتظل Lifecycle تحتفظ بالمراجع نفسها.

### `tabulatorValidation.js` — 2,488 سطر

فيه قواعد مفيدة وIdentity index incremental جيد، لكن يجمع:

- Validation registry
- Header icons
- navigator UI
- duplicate reconciliation
- fixed-digit editor
- date editor
- popup positioning
- inline appearance

**التوصية:** فصل Editors عن Validation engine، ونقل CSS الثابت من JS إلى stylesheet.

### `tabulatorFilters.js` — 2,165 سطر

يوفر Excel-like filters جيدة، لكنه يبني الخيارات بقراءة كل بيانات الجدول عند فتح/تحديث Popup:

`tabulatorFilters.js:320-401`

ثم يعمل Map/Set/Sort. عند 1,000 صف مقبول، لكن مع 5k/10k وتعدد الفلاتر يصبح Hotspot محتمل.

**التوصية:** Cache normalized values/indexes per field، وتحديثها بالـrow deltas، أو على الأقل Cache داخل دورة فتح Popup وإبطاله فقط عند تغير البيانات.

### `tabulatorStructure.js` — 2,336 سطر

يدعم عمليات صعبة ومختبرة، لكن `applyStructureTransaction` كبير، وبعض المسارات تعمل Full data arrays و`setData`. هذا قد يكون مبررًا للعمليات الهيكلية الضخمة، لكنه يجب أن يظل خارج مسار Arrow/cell edit.

**التوصية:** لا تحسنه بالتخمين. سجّل timings حسب حجم العملية، ثم افصل transaction planning عن execution.

### `tabulatorClipboardHistory.js` — 1,374 سطر

الملكية المركزية لـClipboard/History قرار جيد. توجد Full active-row traversals في بعض العمليات، لكنها مرتبطة أساسًا بنطاقات Paste/Undo، لا بالتنقل العادي.

### `tabulatorAggregates.js` و`tabulatorBasketDashboard.js`

الـAggregates يستخدم Snapshot أولي ثم Deltas للتعديلات، وهذا جيد. Basket rendering يطلب Layout sync بعد `requestAnimationFrame` مزدوج، وقد يسبب Layout work عند تحديث القيم المالية/السلة، وليس Arrow العادي غالبًا. يجب قياسه منفصلًا بدل افتراضه سبب التعب.

### `tabulatorPerformance.js` — 3,641 سطر

الأداة نفسها متقدمة، لكنها:

- أكبر ملف JS في المشروع.
- محملة دائمًا من `Components/App.razor:39`.
- حتى وهي Off، المتصفح ينزلها ويحللها.
- عند Start تعمل Wrappers وObservers وGlobal handlers.
- Version label داخلي ما زال قديمًا `Step16P0-Phase6.1...`.

**التوصية:** لا تحملها في الاستخدام العادي. استخدم Dynamic import عند `?perf=` أو في E2ETest environment فقط.

## F14 — كل Scripts الشيت محملة في كل صفحات الموقع

`Components/App.razor:24-39` يحمل Tabulator ومجموعة 15 Script على Login/Home/Admin أيضًا، رغم أنها لا تحتاجها.

هذا يزيد download/parse/global namespace، ويعقد ترتيب Dependencies.

**التوصية:** JS isolation أو dynamic module loader داخل WorkOrders فقط. هذه ليست أولوية Arrow performance، لكنها تحسين واضح لأول تحميل وتنظيم الكود.

## F15 — Global scripts بدل ES Modules

`window.tabulatorTest`, `window.tabulatorFilters`, `window.tabulatorPerformance` تعتمد على ترتيب `<script>` يدوي. الاختبارات السريعة للوحدات أصعب، وأي Missing script يظهر Runtime.

**التوصية:** انتقال تدريجي إلى ES modules، وليس Rewrite واحدًا. ابدأ بالـPure modules مثل financial/field changes/aggregates.

---

# 9. بنية البيانات والأداء المتوقع

## F16 — كل Sheet يحمل كامل البيانات إلى المتصفح

الـQuery يحمل كل صفوف Department + Year إلى List، ثم Blazor يحتفظ بـRows، ثم JS يعمل Clone، ثم Tabulator يحتفظ بالبيانات، وDirty state يحتفظ Snapshot لكل صف.

Virtual DOM يقلل عدد عناصر DOM، لكنه لا يقلل حجم Dataset في الذاكرة أو تكلفة Serialization الأولى.

هذا يعني أن التصميم الحالي مناسب لآلاف محدودة، لكن له سقف عملي يجب قياسه. لا تعتبر نجاح 1,000 صف ضمانًا لـ10,000 أو 30,000.

## F17 — أكثر من نسخة من بيانات الصف في الذاكرة

في `tabulatorTest.initialize` يتم Clone لكل row، ثم `createDirtyState` يبني Snapshot، ثم Tabulator يحتفظ بالـdata. هذا مقبول مقابل Undo/Dirty correctness، لكنه يجعل قياس Heap حسب 1k/5k/10k مهمًا.

## F18 — Full scans في الفلاتر وبعض المصالحات

الفلاتر وعمليات Structure/Save reconciliation تستخدم Full array scans في نقاط محددة. هذا لا يثبت أنها سبب التدهور، لكنه يحدد أين نضع instrumentation.

---

# 10. CSS والتصميم

Phase 9.2C حسّن الوضع كثيرًا:

- `WorkOrders.razor.css`: 924 سطر، 78 `!important`.
- `app.css`: 1,065 سطر، 47 `!important`.
- الإجمالي: 125 `!important`.

ما زال العدد مرتفعًا، وتوجد Selectors مكررة، بعضها بسبب Media Queries وبعضها قابل للدمج. لا يوجد الآن نفس مستوى التراكم القديم، لكن أي تعديل جديد يجب أن يستبدل القاعدة المالكة، لا يضيف Override في نهاية الملف.

يوجد CSS ثابت يُحقن من JavaScript في:

- `tabulatorStructure.js:13-175`
- Editors داخل `tabulatorValidation.js`

هذا يمكن أن يعيد الدين البصري لاحقًا.

**التوصية:** وثيقة Style ownership بسيطة:

- Razor static layout → scoped CSS.
- JS-generated stable components → `app.css`.
- JS inline styles → Dynamic geometry فقط.
- `!important` يحتاج تعليق يشرح سبب الحاجة.

---

# 11. الهوية والأدوار والتسمية

## F19 — خطأ `Busket` متغلغل

Entity وMigration وConstants ورسائل تستخدم `Busket`، بينما UI يستخدم `basket`. لا يكسر التشغيل، لكنه يزيد الحمل الذهني وسيظهر في APIs/تقارير مستقبلية.

**التوصية:** Rename مخصص لاحقًا، يشمل DB column migration وC#/JS contracts والاختبارات. لا تخلطه مع Performance work.

## F20 — أسماء الأدوار مربكة

`BranchManager` يعرض عربيًا “مدير مشروع”، و`ProjectManager` يعرض “مدير مشاريع” في `BranchUsersList.razor:154-163`. هذا قابل للخلط مع قرارك أن الاسم النهائي للدور الأعلى هو ProjectManager.

**التوصية:** قاموس مركزي Role metadata يحتوي English name وArabic display name وscope، وتستخدمه UI كلها. استبدل Raw role strings في `NavMenu.razor:31,40` و`Home.razor`.

## F21 — لا توجد Localization resources

العربي والإنجليزي ورسائل الأخطاء موزعة كسلاسل داخل C#/Razor/JS. ليس Blocker للبروتوتايب، لكنه سيصعب التوحيد والبيع.

---

# 12. الاختبارات

## نقاط القوة

- قاعدة مؤقتة معزولة.
- Web process معزول عن Developer DB.
- Artifacts/trace/screenshot عند الفشل.
- Page hooks مستقرة.
- قواعد حفظ حقيقية على SQL Server.
- Coverage وظيفية واسعة جدًا مقابل حجم المشروع.

## F22 — E2E Mega Journey

`Phase9FoundationBrowserTest.cs` بطول 1,599 سطر و`RunAsync` واحد طويل. أي فشل مبكر يمنع معرفة نتيجة المسارات التالية، ويجعل إعادة تشغيل اختبار واحد صعبة.

## F23 — Page Object ضخم

`WorkOrdersPage.cs` بطول 2,854 سطر يجمع Selectors وActions وAssertions helpers وPerformance instrumentation وDTOs.

**التوصية:** تقسيم Suites، وليس نسخ الكود:

- `WorkOrdersLoadTests`
- `WorkOrdersFilterTests`
- `WorkOrdersFinancialTests`
- `WorkOrdersSaveTests`
- `WorkOrdersStructureTests`
- `WorkOrdersPerformanceTests`

وتقسيم Page components إلى Grid, Filters, Finance, Structure helpers.

## F24 — Custom executable runners

E2E وIntegration هما Console executables، لا xUnit/NUnit. هذا يعمل، لكنه يحد من:

- Test discovery في IDE.
- تشغيل Test واحد.
- Standard CI result files.
- Coverage per test.
- Fixtures/traits/categories.
- Parallelization المنظمة.

لا يلزم Migration فوري، لكن التحول التدريجي إلى xUnit مفيد.

## F25 — فجوات التغطية

لم أجد اختبارات مركزة لـ:

- `UserManagementService`
- `ApplicationSeeder`
- AdminPanel/BranchUserForm/BranchUsersList
- Forced password change/inactive account journey
- Concurrent DisplayOrder allocation
- Concurrent fixed-user creation
- Status required/optional invariant
- Multi-instance startup
- Fast JS unit tests للparsers/filters/aggregates/financial/identity helpers

هذه أهم من زيادة عدد E2E checks داخل الرحلة الضخمة الحالية.

---

# 13. نظافة المصدر والتوثيق

- `README.md` ما زال يعرّف المشروع كـPhase 9.0C-R2 ويذكر أرقام اختبارات قديمة.
- `START_HERE_ERP_PROTOTYPE.md` يقول Phase 9.0B وأرقام 10/10 و4/4.
- `Documentation/03_CURRENT_IMPLEMENTATION.md` قديم مقارنة بـ9.2C/9.2D.
- يوجد عدد كبير من `PATCH_MANIFEST_*.md` في جذر المشروع رغم وجود نسخة مؤرشفة تحت Documentation/Archive.
- `ERPPrototype.csproj.user` موجود في الـZIP رغم أن `.gitignore` يستبعده.
- بعض Production comments ما زالت تحمل Phase/Step labels قديمة.

هذا لا يؤثر على Runtime، لكنه يجعل تسليم المشروع أو دخول مطور جديد أصعب.

**التوصية:** مصدر واحد للحالة الحالية، Archive واحد، وحذف نسخ Manifests من الجذر بعد التأكد من وجودها في Archive.

---

# 14. الترتيب المقترح للعمل

## المرحلة 0 — تثبيت نقطة الرجوع الحالية

قبل أي تعديل:

1. تأكد من `17/17` و`55/55`.
2. Commit/Tag واضح لنسخة ما بعد CSS consolidation.
3. احتفظ بصورة وArtifacts الحالية.
4. لا تخلط Refactor مع Performance optimization في نفس Commit.

## المرحلة 1 — تصحيح منصة الأداء فقط

بدون لمس كود التطبيق:

1. Suite مستقلة.
2. بدون Observe/SlowMo.
3. Trace off في measured run.
4. Fresh page/grid.
5. 5 Runs وMedian/P95.
6. 1k + worst real + 5k + 10k.
7. Arrow وEnter وWheel كل واحد في Session منفصلة.
8. تقارير baseline محفوظة تحت `Documentation/Review/Performance`.

## المرحلة 2 — إصلاح قرارات صحة البيانات الصغيرة

1. حسم Status.
2. Test لDisplayOrder concurrency ثم allocator آمن.
3. Test لإنشاء الحسابات الثابتة بالتوازي.
4. معالجة نتيجة rollback عند AddToRole failure.

## المرحلة 3 — تحسينات مبنية على القياس

لا نختار التحسين مسبقًا. الاحتمالات التي نقيسها:

- Filter value indexes.
- Lazy load scripts.
- تقليل نسخ rows.
- تجنب layout sync غير الضروري.
- تحسين full-data reconciliations.
- تحميل server-side/paging فقط إذا أثبتت الأحجام أن full dataset غير مناسب.

## المرحلة 4 — Refactor صيانة بدون تغيير سلوك

1. Split `WorkOrderService`.
2. Split giant JS functions.
3. Extract Admin services.
4. Add TimeProvider/cancellation.
5. Move stable JS CSS to stylesheet.
6. Split test suites.
7. Update docs/naming.

---

# 15. ما لا أنصح به

- لا Rewrite للشيت.
- لا استبدال Tabulator قبل قياس مثبت.
- لا إضافة Patch CSS فوق آخر الملف.
- لا تنفيذ Optimizations لأن “الإحساس بطيء” فقط.
- لا تشغيل الأداء في Observe ثم اعتبار Wall Clock نتيجة.
- لا Refactor شامل قبل الحصول على Baseline صالح.
- لا Rename لـBusket داخل نفس مرحلة الأداء.
- لا زيادة E2E mega-journey أكثر؛ ابدأ تقسيمها.

---

# 16. القرار النهائي

**هل يوجد عك؟**  
نعم، لكنه ليس في كل المشروع. العك الأساسي موجود في حجم ومسؤوليات JavaScript، حجم WorkOrderService، شكل اختبارات المتصفح، وبعض تشغيل/Admin architecture. قلب قواعد العمل وقاعدة البيانات أقوى بكثير من هذه المناطق.

**هل الكود مكتوب صح؟**  
المسارات الحرجة مكتوبة صح ومثبتة بالاختبارات، مع فجوات محددة: Status semantics، DisplayOrder concurrency، fixed account concurrency، startup seeding، partial password-state update.

**هل هو مرتب وسهل التعديل؟**  
C# خارج المناطق الكبيرة مقبول إلى جيد. WorkOrders JS والاختبارات ليست سهلة التعديل بما يكفي لمنتج طويل العمر. أي تعديل فيها يحتاج اختبارات قوية، وهو متوفر جزئيًا، لكنه ما زال بطيئًا ومكلفًا في الفهم.

**هل نبدأ اختبار الأداء الحالي؟**  
لا بالشكل الحالي. نصلح Harness أولًا، لأن تشغيله الآن قد يعطينا PASS مطمئنًا أو FAIL مخيفًا وكلاهما متأثر بـSlowMo/Trace وترتيب الرحلة.

**أول خطوة صحيحة:** تثبيت النسخة الحالية، ثم تجهيز Performance Suite نظيفة فقط، بدون تعديل Runtime. بعد ظهور الأرقام نحدد هل الشيت فعلًا يتدهور، وأين بالضبط، ثم نصلح السبب المثبت.

---

## المرفق

يوجد ملف Inventory منفصل يسجل كل ملف كود/إعداد تمت مراجعته، عدد أسطره، تصنيفه، وحكم المراجعة المختصر.
