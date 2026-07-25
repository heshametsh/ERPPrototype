# مراجعة إصدار ERPPrototype

**التاريخ:** 2026-07-25  
**المصدر المراجع:** `ERPPrototype-1.zip`  
**الناتج:** نسخة مصدر منظفة ومراجعة استاتيكيًا  
**الحكم النهائي:** غير جاهز للإطلاق على عميل إنتاجي بعد، لكنه أصبح مرشحًا صحيح البنية لإعادة الـBuild والاختبار بدل النسخة التي كانت تحتوي أخطاء متسلسلة.

---

## 1. الخلاصة التنفيذية

الأخطاء الكثيرة التي ظهرت لم تكن عشرات أعطال مستقلة. السبب الجذري كان أن مجلدي `Patch` و`Rollback` نُسخا داخل مشروع SDK-style. هذا النوع من مشاريع .NET يضم ملفات `*.cs` و`*.razor` الموجودة تحته تلقائيًا في التجميع. النتيجة كانت:

- ثلاث نسخ من `Program.cs`، لذلك ظهر خطأ top-level statements.
- ثلاث نسخ من `WorkOrderService.cs` والـrecords التابعة له، لذلك ظهرت duplicate definitions/members.
- صفحات Syncfusion القديمة داخل `Rollback` ظلت تدخل في Razor compilation بعد حذف Packages، لذلك ظهرت أخطاء `SfGrid` و`GridColumn` وnamespace `Syncfusion`.

تم حذف هذه الأشجار والمخلفات بدل ترقيع كل رسالة خطأ على حدة.

---

## 2. حدود المراجعة ودرجة الثقة

تمت مراجعة:

- جميع ملفات المصدر المملوكة للمشروع: C# وRazor وJavaScript وCSS والإعدادات.
- ربط المسارات، الأدوار، الخدمات، DbContext، JavaScript interop، والـscoped CSS.
- سلسلة Migrations وModel Snapshot على مستوى الاتساق الاستاتيكي.
- تكرار الأنواع والـroutes والملفات.
- وجود مراجع Syncfusion أو Public Registration أو Self-delete أو Email sender.
- توازن الأقواس والسلاسل والتعليقات في 45 ملف C#.
- Syntax لملفات JavaScript المملوكة للمشروع بواسطة Node.
- Manifest يحتوي SHA-256 وحجم كل ملف.

لم يتم تنفيذ:

- Roslyn/.NET compilation؛ بيئة الفحص لا تحتوي .NET SDK.
- تشغيل EF Core ضد قاعدة البيانات.
- اختبار Browser runtime أو Azure.
- فحص NuGet vulnerability فعلي بعد restore.
- مراجعة بشرية سطرًا بسطر للملفات الخارجية minified الخاصة بـBootstrap وTabulator؛ تمت مراجعة النسخة والربط والاستخدام، لا إعادة تدقيق مصدر المكتبتين.

لذلك لا توجد أي مطالبة بأن النسخة “تعمل” قبل نجاح `Rebuild Solution` والاختبارات المحددة.

---

## 3. الملفات التي حُذفت ولماذا

### 3.1 سبب أخطاء التجميع

- `Patch/` بالكامل.
- `Rollback/` بالكامل.
- `APPLY_STEP16B.cmd` و`ROLLBACK_STEP16B.cmd`.

هذه ملفات توزيع/نسخ احتياطي وليست مصدرًا يجب أن يعيش داخل مجلد مشروع SDK-style.

### 3.2 Syncfusion والصفحات القديمة

- صفحة WorkOrders القديمة المبنية بـSyncfusion.
- `GridTest.razor`.
- كل Packages وregistration وCSS/JS الخاصة بـSyncfusion.

صفحة Tabulator أصبحت صفحة `/work-orders` الوحيدة. الاحتفاظ بصفحتين لنفس الوظيفة كان يضاعف عقود البيانات والأعطال.

### 3.3 صفحات القالب غير الداخلة في المنتج

- Counter وWeather وAuth وAdminTest.
- صفحات التسجيل العام.
- Email confirmation/reset flows غير المدعومة بمزود بريد.
- External login.
- Two-factor/recovery/passkey flows غير المنفذة كمنتج.
- Personal data download/delete/self-service.

إزالة الصفحات تمنع ظهور وظائف غير مدعومة أو متعارضة مع قرار أن Admin هو من ينشئ الحسابات الثابتة.

### 3.4 مخلفات التطوير والنشر

- ZIP متداخل داخل المشروع.
- ملفات `*.user`.
- README لكل خطوة قديمة وتقارير recovery المؤقتة.
- Azure Web Deploy profile وServiceDependencies المرتبطة ببيئة اختبار محددة.
- ملفات Bootstrap غير المستخدمة؛ احتُفظ فقط بـ`bootstrap.min.css` المستخدم فعليًا.

تمت إضافة `.gitignore` لمنع عودة هذه الملفات.

---

## 4. الملفات التي عُدلت

### `Program.cs`

- إزالة Syncfusion وEmail sender.
- تسجيل Tabulator لا يحتاج DI package.
- تفعيل lockout بعد 5 محاولات لمدة 15 دقيقة.
- الاحتفاظ بـIdentity وEF Core وHTTPS/HSTS/Antiforgery.
- Seeder مع retry لبدء قاعدة البيانات.

**ملاحظة:** التطبيق لا ينفذ Migrations تلقائيًا. هذا أفضل للإنتاج، لكنه يتطلب خطة نشر قاعدة بيانات واضحة.

### `ApplicationSeeder.cs`

- إزالة البريد وكلمة المرور hard-coded.
- إعادة استخدام Admin الوحيد الموجود.
- رفض وجود أكثر من Admin.
- رفض ترقية مستخدم عادي تلقائيًا إلى Admin بسبب إعداد خاطئ.
- رفض عدم تطابق `InitialAdmin:Email` مع Admin الموجود.
- إنشاء Admin جديد فقط عندما لا يوجد Admin وتتوفر User Secrets.

### `WorkOrderService.cs`

- تحميل DTO خفيف (`WorkOrderSheetRow`) بدل كيان كامل.
- Scope على السيرفر: مستخدم نشط، ليس مطالبًا بتغيير كلمة المرور، Employee، وقسم محدد.
- SQL filter حسب القسم والسنة قبل الإرسال.
- Delta save للإضافة والتعديل والحذف.
- التحقق من 9/3 أرقام وBasket والحدود النصية.
- التحقق من التكرار على مستوى الشركة مع Unique Index كحماية أخيرة.
- RowVersion للتعارض.
- النقل التلقائي لسنة Assignment Date.

**مخاطر متبقية:** التحميل الأولي ما زال يجلب كل صفوف السنة إلى المتصفح. كما أن عمليات insert/delete/structural undo تعيد بناء كل بيانات الشيت داخل JavaScript.

### `WorkOrders.razor` و`tabulatorTest.js`

- نقل صفحة Tabulator إلى route الرسمي `/work-orders`.
- إزالة alias `/tabulator-test`.
- الحفاظ على Delta Save وRowVersion وUndo/Redo والنسخ واللصق والفلاتر.
- إصلاح حالة Blazor بعد حفظ الصف الجديد؛ يُحذف Temporary Id من `Rows` حتى لا يحتفظ C# بنسخة سالبة ونسخة Database Id معًا.
- إزالة أربع دوال JavaScript غير مستخدمة، بينها مسار full-sheet replacement قديم.
- لا يزال الاسم الداخلي `tabulatorTest` مستخدمًا لتقليل خطر إعادة تسمية آلاف الأسطر؛ الاسم الداخلي ليس مشكلة تشغيلية.

### الحسابات والصلاحيات

- Login يرفض المستخدم غير النشط ويستخدم lockout.
- الحساب الجديد يُجبر على تغيير كلمة المرور.
- Routes توجه المستخدم المسجل ذي الدور الخطأ إلى AccessDenied بدل Login loop.
- Revalidation يطرد المستخدم المعطل.
- Logout هو endpoint مصرح به ويستخدم LocalRedirect.
- User creation يعيد التحقق في Service أن المنفذ Admin نشط؛ لا يعتمد على إخفاء الزر فقط.

---

## 5. تقييم الملفات والمكونات

### يعمل منطقيًا ومتماسك استاتيكيًا

- نموذج البيانات والعلاقات وRestrict deletes.
- Unique Index للزوج `(WorkOrderNumber, WorkTypeCode)`.
- Check constraints للأرقام ASCII.
- فهرس `(DepartmentId, WorkYear, DisplayOrder)`.
- RowVersion.
- صفحة Login وتغيير كلمة المرور.
- صفحة Employee work orders ومسار الخدمة المقيد.
- Admin: إضافة/تعديل اسم الفرع، إنشاء الأقسام الأربعة، إنشاء وعرض الحسابات الثابتة.
- JavaScript interop: جميع الأسماء التي تستدعيها Razor موجودة.
- CSS scoped: لا توجد ملفات CSS يتيمة.

### موجود لكنه غير مكتمل كمنتج

- `BranchManager`: الحساب قابل للإنشاء، لكن لا توجد صفحة تشغيل read-only ولا إدارة حسابات الفرع كما تقرر تجاريًا.
- `ProjectManager`: role موجود في seed فقط تقريبًا، ولا توجد شاشة أو workflow مكتمل. كما أن الاسم الموثق الأحدث هو Project Director، وهذه فجوة تسمية/قرار تحتاج تسوية قبل قاعدة بيانات عميل.
- إدارة المستخدم: لا يوجد تعديل الاسم، تفعيل/تعطيل، أو إعادة تعيين كلمة مرور مؤقتة من لوحة الإدارة.
- لا يوجد Audit trail لتغييرات الإدارة.
- Excel import/export غير منفذين.
- Dashboard غير منفذ.
- Warehouse/invoicing غير منفذين، وبالتالي قفل هوية أمر العمل عند الارتباط لم يُنفذ بعد.

### غير مقبول للإطلاق حاليًا

- الأداء لم يجتز الاختبار على جهاز المستخدم مع 3,000 صف.
- لا يوجد اختبار 10,000 صف في شيت واحد.
- لا توجد automated tests.
- لم يتم Rebuild للنسخة المنظفة بعد.
- لم يتم اختبار Azure/SEC network/reconnection/security under load.

---

## 6. مراجعة الأداء

### ما تم تحسينه

- SQL لا يحمل أعمدة audit غير المطلوبة للشيت.
- الصفوف القادمة من قاعدة البيانات لا يعاد فحصها جميعًا كصفوف متغيرة عند الفتح.
- Identity index للتكرار يُبنى مرة ويُحدّث تدريجيًا.
- فتح popup الفلتر هو الذي يجمع قيم القائمة بدل كل تعديل خلية.
- Save يعيد delta ولا يعيد تحميل الشيت كاملًا.

### ما زال يستهلك موارد

- 3,000 صف تُستعلم وتتحول وتُرسل كاملة عبر Blazor Server إلى JavaScript.
- Tabulator يبني state وidentity/original maps لكل الصفوف.
- structural insert/delete/undo تستخدم `table.getData()` ثم `table.setData()` وتعيد validation/dirty-state للشيت كاملًا.
- ملف `tabulatorTest.js` ما زال كبيرًا جدًا، ما يرفع تكلفة الصيانة والمخاطر، حتى لو لم يكن حجمه وحده سبب التقطيع.

### القرار الهندسي بعد الاختبار

لا يوصى بإضافة ميزات Grid جديدة قبل قياس Step16A على النسخة النظيفة. إن بقي التمرير أو الفتح غير مقبول، فالحل التالي ليس مزيدًا من micro-optimizations فقط؛ يلزم تصميم server-side/progressive loading مع قرار واضح بشأن تأثيره على:

- range selection
- copy/paste
- filter/search
- row order
- undo/redo
- delta save

هذا تغيير معماري في grid data flow ويجب اختباره كنموذج منفصل قبل اعتماده.

---

## 7. الأمان والبيانات

### نقاط جيدة

- لا توجد كلمات مرور أو Syncfusion license في المصدر.
- اتصال الإنتاج لم يعد موجودًا في `appsettings.json`.
- LocalDB موجود فقط في `appsettings.Development.json`.
- Public registration وself-delete أزيلا.
- Authorization موجود على الصفحات وعلى services الحساسة الأساسية.
- Antiforgery وHTTPS وHSTS موجودة.
- Lockout مفعل.

### نقاط تحتاج قبل العميل

- ضبط `AllowedHosts` بدل `*` في الإنتاج.
- إضافة security headers/CSP مناسبة بعد اختبار Tabulator وBlazor.
- مراجعة rate limiting والـreverse proxy configuration.
- فحص الحزم للثغرات بعد Restore.
- إضافة audit log للإدارة وتغييرات الهوية الحساسة.
- اختبار race condition لإنشاء الحساب الثابت؛ القاعدة حاليًا app-level وليست constraint واحدة في DB بسبب ارتباط الدور بجداول Identity.
- مراجعة مستقلة للصلاحيات والأمان قبل بيانات حقيقية.

---

## 8. ملاحظات قاعدة البيانات

- لم تُنشأ Migration في هذه المراجعة.
- لا تحذف Migrations التاريخية، حتى لو أضافت Soft Delete ثم أزالته؛ حذفها يكسر القدرة على إنشاء قاعدة من الصفر أو تتبع schema history.
- اسم `Busket` خطأ إملائي تقني موجود في C# وقاعدة البيانات، بينما UI يعرض Basket. إصلاحه الآن يحتاج Migration وتغييرًا واسعًا؛ سُجل كدين تقني ولم يُغيّر في تنظيف التجميع.
- بيانات الـ36 ألف أمر التجريبي موجودة في قاعدة LocalDB، وليست داخل ZIP المصدر.

---

## 9. نتيجة الفحص الاستاتيكي

مرّت الاختبارات التالية:

- JSON/XML parsing.
- Project واحد و`Program.cs` واحد.
- لا `Patch`/`Rollback`/Syncfusion.
- لا duplicate declared types.
- لا duplicate routes.
- JavaScript syntax لملفات المشروع.
- 18 JavaScript interop method مطلوبة من WorkOrders موجودة.
- 4 روابط من Tabulator إلى filter module موجودة.
- CSS braces وscoped CSS linkage.
- Model/Snapshot tokens الأساسية.
- C# delimiters/strings/comments متوازنة في 45 ملفًا.

هذه الاختبارات تقلل أخطاء البنية لكنها لا تستبدل compiler.

---

## 10. ترتيب العمل الإجباري قبل أي تطوير جديد

1. فك النسخة المنظفة في مجلد جديد.
2. `Clean Solution` ثم `Rebuild Solution`.
3. معالجة أي compiler error حقيقي من النسخة النظيفة فقط.
4. Smoke test للدخول وAdmin وEmployee.
5. إعادة اختبار 3,000 صف وتسجيل أرقام لا انطباعات فقط.
6. اختبار 10,000 صف في شيت واحد.
7. اتخاذ قرار server-side/progressive loading.
8. بعد نجاح grid: استكمال إدارة الحسابات الثابتة والصلاحيات الناقصة.
9. automated tests ثم Azure/SEC network testing.
10. مراجعة أمنية مستقلة قبل العميل.

---

## 11. الحكم

النسخة المرفوعة كانت **مكسورة بنيويًا** بسبب إدخال ملفات patch/rollback داخل compilation. النسخة المنظفة أزالت السبب الجذري، وقللت السطح غير المستخدم، وحسنت وضوح الأمن والإعدادات. لكنها **ليست إصدار عميل** حتى ينجح الـBuild والتشغيل والأداء وقائمة الاختبارات.
