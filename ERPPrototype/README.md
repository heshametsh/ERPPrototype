# ERPPrototype — Reviewed Candidate

هذه نسخة مصدر منظفة ومراجعة من نموذج متابعة أوامر العمل.

## الحالة

هذه النسخة **مرشح اختبار بعد التنظيف** وليست إصدارًا معتمدًا لعميل إنتاجي بعد. تمت إزالة أسباب أخطاء التجميع المتسلسلة ومخلفات الحزم القديمة، لكن يلزم تنفيذ `Rebuild` واختبارات التشغيل والأداء على جهاز التطوير قبل اعتمادها.

## التقنية الحالية

- Blazor Web App — Interactive Server
- ASP.NET Core Identity
- Entity Framework Core + SQL Server
- Tabulator كجدول أوامر العمل الوحيد
- لا توجد أي مراجع إلى Syncfusion

## التشغيل محليًا

1. افتح `ERPPrototype.csproj` في Visual Studio 2022.
2. تأكد أن .NET 10 SDK وSQL Server LocalDB موجودان.
3. نفّذ `Build > Clean Solution` ثم `Build > Rebuild Solution`.
4. شغّل المشروع بـ `Ctrl + F5`.

قاعدة البيانات المحلية موجودة في `appsettings.Development.json`. إعداد الإنتاج لا يحتوي Connection String؛ يجب ضبطه من إعدادات البيئة أو Azure App Service باسم:

```text
ConnectionStrings__DefaultConnection
```

## إنشاء Admin لأول قاعدة بيانات جديدة فقط

تُحفظ القيم في User Secrets، ولا تُكتب داخل ملفات المصدر:

```powershell
dotnet user-secrets set "InitialAdmin:Email" "admin@example.com"
dotnet user-secrets set "InitialAdmin:FullName" "System Administrator"
dotnet user-secrets set "InitialAdmin:Password" "Use-A-Strong-Temporary-Password"
```

في قاعدة البيانات الحالية، يعيد Seeder استخدام حساب Admin الوحيد الموجود. لن يحول حساب مستخدم عادي إلى Admin تلقائيًا.

## المسارات الأساسية

- `/` الصفحة الرئيسية
- `/Account/Login` تسجيل الدخول
- `/Account/Manage/ChangePassword` تغيير كلمة المرور
- `/work-orders` شيت أوامر العمل لموظف القسم
- `/admin` لوحة الإدارة

## الأدوار الموجودة في الكود

- `Admin`
- `ProjectManager` — موجود كبنية أولية، ولا توجد له شاشة تشغيل مكتملة
- `BranchManager` — إنشاء الحساب موجود، لكن شاشة العمل والصلاحيات التشغيلية غير مكتملة
- `Employee` — شيت القسم والسنة

## قاعدة البيانات

لم تُنشأ Migration جديدة في هذه المراجعة. لا تنفذ `Add-Migration`. استخدم قاعدة البيانات الحالية كما هي عند اختبار النسخة.

تاريخ الـMigrations القديم، بما فيه إضافة Soft Delete ثم إزالته، محفوظ عمدًا لأنه جزء من سلسلة إنشاء قاعدة البيانات ولا يجوز حذف Migration تاريخية بعد تطبيقها.

## قبل أي إطلاق فعلي

راجع:

- `PROJECT_RELEASE_REVIEW_2026-07-25.md`
- `Documentation/RELEASE_TEST_CHECKLIST.md`
- `STATIC_REVIEW_RESULTS.txt`

لا تستخدم بيانات حقيقية أو سرية قبل اجتياز اختبارات الأمان والصلاحيات والأداء والنشر.
