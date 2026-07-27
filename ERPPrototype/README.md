# ERPPrototype — E6C Engineering Foundation

هذه النسخة هي **E6C Baseline مع حزمة توثيق هندسية محدثة**.

## ما الذي تغير في هذه الحزمة؟

- لم يتغير أي ملف Runtime أو كود مصدر خاص بالتطبيق.
- تم تثبيت E6C كمرجع رسمي.
- تم تحديث `START_HERE_ERP_PROTOTYPE.md`.
- تم استبدال Project Context القديم المبني على Power Apps بوثيقة تطابق Blazor/Tabulator الحالي.
- تم تحديث AI Decision Principles إلى Version 1.3.
- تم إنشاء توثيق للحالة الحالية، المعمارية، سلوك الشيت، الاختبارات، الديون التقنية، القرارات، وخطة الـRefactor.
- تم نقل تقارير 2026-07-25 والوثائق القديمة المتعارضة إلى `Documentation/Archive`.
- تم حذف `ERPPrototype.csproj.user` من الحزمة لأنه ملف Visual Studio خاص بجهاز المستخدم وليس جزءًا من المصدر.

## ابدأ من هنا

افتح:

```text
START_HERE_ERP_PROTOTYPE.md
```

ثم:

```text
Documentation/00_DOCUMENTATION_INDEX.md
```

## التقنية الحالية

- .NET 10 / Blazor Web App — Interactive Server
- ASP.NET Core Identity
- Entity Framework Core + SQL Server
- Tabulator 6.5.0
- Azure App Service + Azure SQL عند النشر

## تنبيه

هذه النسخة ليست Production Release.  
الفحص الحالي استاتيكي فقط لأن بيئة المراجعة لا تحتوي .NET SDK؛ لذلك يلزم Rebuild وتشغيل واختبارات المتصفح على جهاز التطوير قبل اعتماد أي سلوك.
