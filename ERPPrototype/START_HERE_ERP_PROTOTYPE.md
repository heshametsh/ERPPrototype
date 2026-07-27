# START HERE — ERP Prototype (E6F Stable Checkpoint)

**الحالة:** مرجع البدء الحالي  
**آخر تحديث:** 2026-07-27  
**النسخة الحالية المستقرة للكود:** Step 16E6F
**الأساس الذي بُنيت عليه:** Step 16E6C  
**جاهزية الإنتاج:** غير جاهز لعميل حقيقي حتى اجتياز اختبارات البناء والأمان والأداء والنشر

## اقرأ بالترتيب

1. `Documentation/00_DOCUMENTATION_INDEX.md`
2. `Documentation/01_PROJECT_CONTEXT.md`
3. `Documentation/03_CURRENT_IMPLEMENTATION.md`
4. `Documentation/05_WORK_ORDERS_GRID_BEHAVIOUR.md`
5. `Documentation/06_REGRESSION_TEST_CHECKLIST.md`
6. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
7. `Documentation/09_REFACTOR_ROADMAP.md`

## ما هو المشروع؟

نظام ويب لمتابعة عمليات شركات المقاولات التي تعمل مع الشركة السعودية للكهرباء أو جهات مشابهة.  
النظام لا يستبدل SAP أو UDS؛ الموظف ينفذ العمل الرسمي هناك، ثم يحدث بيانات المتابعة داخل نظامنا حتى تستطيع الشركة متابعة أوامر العمل والتأخير والإنتاجية والمراحل المالية من مكان واحد بدل ملفات Excel المتفرقة.

## التقنية الموجودة فعليًا

- Blazor Web App بنمط Interactive Server
- ASP.NET Core Identity
- Entity Framework Core
- SQL Server محليًا وAzure SQL عند النشر
- Azure App Service
- Tabulator 6.5.0 لشيت أوامر العمل
- مشروع واحد قابل للنشر، مع اتجاه مستقبلي إلى Modular Monolith منظم

لا توجد Syncfusion في الكود الحالي.  
وثيقة Power Apps/Dataverse القديمة أُرشفت لأنها لم تعد تمثل التنفيذ.

## القرار التشغيلي للعملاء

في الإصدارات التجارية الأولى:

- كل شركة عميلة لها نسخة تطبيق مستقلة.
- كل شركة لها قاعدة بيانات مستقلة.
- الإعدادات والمستخدمون والأسرار والنسخ الاحتياطية مستقلة.
- نفس مصدر الكود يُستخدم لكل العملاء.
- لا نبني Shared-Database Multi-Tenancy الآن.
- لا نستخدم Microservices أو ABP Framework في البروتوتايب الحالي.

## أهم أولوية

شاشة أوامر العمل يجب أن تكون قريبة جدًا من Excel:

- تعديل مباشر داخل الخلية.
- تنقل بالكيبورد.
- تحديد نطاقات.
- Copy/Paste مع Excel.
- إدراج وحذف صفوف.
- Undo/Redo داخل الجلسة.
- بحث وفلاتر.
- أداء مقبول مع آلاف الصفوف.

## ما الذي يعمل حاليًا؟

- تسجيل الدخول بدون تسجيل عام.
- Admin واحد.
- إنشاء فروع وأقسامها الأربعة الثابتة.
- إنشاء حساب Branch Manager ثابت وحساب Employee ثابت لكل قسم.
- شيت أوامر العمل لمستخدم Employee في قسمه فقط.
- سنوات عمل منفصلة.
- تعديل، بحث، فلاتر، نسخ ولصق، إدراج وحذف، Undo/Redo وحفظ Delta.
- RowVersion لاكتشاف تعارض التعديل بين جلستين.
- E6C يحافظ على موضع الصف عند تغيير حجم النافذة ويستخدم Virtual DOM buffer مركزيًا بقيمة 260px.
- E6D يضع `Enter` مع الأسهم الرأسية داخل بوابة تكرار مركزية لمنع تراكم ضغطات الكيبورد.
- E6E يمنع خطأ أول كليك يمين عندما يبدأ الشيت بلا نطاق تحديد.
- E6F يمنع خطأ التركيز بعد Insert/Delete وUndo/Redo عندما تكون خلية الـVirtual DOM لم تُرسم بعد.

## ما الذي لا يعمل كمنتج كامل بعد؟

- شاشة تشغيل Branch Manager غير مكتملة.
- ProjectManager موجود كدور تقني فقط تقريبًا.
- تعديل أسماء المستخدمين وإعادة تعيين كلمات المرور من الإدارة غير مكتمل.
- Excel Import/Export غير منفذين.
- Dashboard غير منفذ.
- Warehouse والفواتير غير منفذين.
- لا توجد Automated Tests.
- مشكلة إرهاق التنقل الرأسي بعد استخدام طويل لم تُحل.
- اختبار 10,000 صف، شبكة الشركة، Azure، وإعادة الاتصال ما زال مطلوبًا.

## قاعدة العمل من الآن

لا نضيف Performance Patch جديد فوق E6F قبل:

1. تثبيت Checkpoint في Git.
2. تنفيذ Regression Checklist.
3. فصل الكود تدريجيًا بدون Rewrite كامل.
4. اختبار كل خطوة والرجوع فورًا إذا كسرت ميزة أخرى.

## طريقة الشرح المطلوبة من AI

بعد كل خطوة يجب أن يشرح باختصار:

- ماذا فعل؟
- لماذا فعل ذلك؟
- مثال بسيط يفهمه غير المبرمج.
- ماذا تختبر الآن؟
- ماذا تبقى؟

**مثال بسيط:**  
عندما نقول `RowVersion`، فكر فيها كختم نسخة على الورقة. إذا عدّل شخص آخر الورقة بعد فتحك لها، يكتشف النظام أن ختم نسختك قديم ويمنعك من الكتابة فوق تعديله.

## تشغيل المشروع محليًا

1. افتح `ERPPrototype.csproj` في Visual Studio 2022.
2. تأكد من وجود .NET 10 SDK وSQL Server LocalDB.
3. نفذ `Build > Clean Solution`.
4. نفذ `Build > Rebuild Solution`.
5. شغل بـ `Ctrl + F5`.
6. لا تنفذ Migration جديدة لمجرد فتح النسخة.

إعداد LocalDB موجود في `appsettings.Development.json`.  
إعداد الإنتاج يجب أن يأتي من Environment/Azure باسم:

```text
ConnectionStrings__DefaultConnection
```

## Admin لأول قاعدة بيانات جديدة فقط

تُحفظ القيم في User Secrets ولا تُكتب في المصدر:

```powershell
dotnet user-secrets set "InitialAdmin:Email" "admin@example.com"
dotnet user-secrets set "InitialAdmin:FullName" "System Administrator"
dotnet user-secrets set "InitialAdmin:Password" "Use-A-Strong-Temporary-Password"
```

## الخطوة الهندسية التالية

Phase 0 اكتملت على E6F مع Baseline مؤقت مسجل. الخطوة التالية هي Phase 1 — استخراج Diagnostics فقط، مع الاحتفاظ بـE6C كمرجع تأسيسي وE6F كنقطة الرجوع الحالية:

1. تثبيت الاختبارات اليدوية.
2. استخراج Diagnostics.
3. توحيد Lifecycle والتنظيف.
4. فصل Resize وNavigation.
5. بعد استقرار الحدود نعود لمشكلة الإرهاق.
