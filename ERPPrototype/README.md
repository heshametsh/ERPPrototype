# ERPPrototype

نظام Blazor لمتابعة أوامر العمل بأسلوب قريب من Excel، مبني باستخدام ASP.NET Core Identity وEF Core وSQL Server وTabulator.

## نقطة الاستقرار الحالية

- `Phase8.9-Stable`: إغلاق الـRefactor بعد Release Build ناجح، واختبارات الحفظ الآلية `10/10`، وفحص Git، وإنشاء نسخة مصدر نظيفة.
- لا يوجد Refactor إضافي مخطط له بدون مشكلة أو ميزة تثبت الحاجة.
- `Phase 9.0`: مرشح تأسيس أول رحلة متصفح آلية قبل استكمال تعديلات شيت أوامر العمل.

## التحقق الآلي الحالي

لتشغيل اختبارات الحفظ العشرة فقط من داخل مجلد المشروع:

```powershell
.\Tools\Invoke-Phase8Verification.ps1
```

لتشغيل اختبارات الحفظ ثم مشاهدة رحلة المتصفح الأولى من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

رحلة المتصفح تستخدم قاعدة SQL Server مؤقتة وتطبيقًا محليًا على منفذ عشوائي، ثم تختبر تسجيل الدخول وفتح شيت الموظف وتغيير السنة. لا تستخدم قاعدة التطوير أو الإنتاج.

## إنشاء ZIP نظيف

```powershell
.\Tools\New-CleanProjectArchive.ps1
```

الأداة تستبعد `bin` و`obj` و`.vs` و`TestArtifacts` وملفات الجهاز والبناء، ولذلك لا يزيد حجم التسليم بسبب نواتج التشغيل أو ملفات المتصفح التشخيصية.

ابدأ من `START_HERE_ERP_PROTOTYPE.md` ثم `Documentation/00_DOCUMENTATION_INDEX.md`.
