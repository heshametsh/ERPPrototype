# ERPPrototype

نظام Blazor لمتابعة أوامر العمل بأسلوب قريب من Excel، مبني باستخدام ASP.NET Core Identity وEF Core وSQL Server وTabulator.

## نقطة الاستقرار الحالية

- `Phase8.9-Stable`: إغلاق الـRefactor بعد Release Build ناجح واختبارات الحفظ `10/10`.
- `Phase 9.0`: قُبل بعد نجاح اختبارات الحفظ `10/10` ورحلة المتصفح `4/4` على قاعدة وتطبيق مؤقتين.
- `Phase 9.0B`: مرشح تثبيت منصة اختبارات المتصفح قبل إضافة سيناريوهات الشيت والميزات الجديدة.

## التحقق الآلي

التشغيل الكامل، وهو الوضع الافتراضي:

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Invoke-ERPTests.ps1 -Suite Full
```

لمشاهدة المتصفح أثناء التنفيذ:

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

تشغيل Smoke سريع، مع إمكانية تخطي اختبارات SQL عندما يكون المطلوب فحص المتصفح فقط:

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Invoke-ERPTests.ps1 -Suite Smoke -SkipIntegration
```

الاختبارات تستخدم قاعدة SQL Server مؤقتة وتطبيقًا محليًا على منفذ عشوائي. لا تستخدم قاعدة التطوير أو الإنتاج. تحتفظ الأداة بآخر 10 مجلدات تشخيص فقط داخل `ERPPrototype.E2ETests/TestArtifacts`.

## إنشاء ZIP نظيف

```powershell
.\Tools\New-CleanProjectArchive.ps1
```

الأداة تستبعد `bin` و`obj` و`.vs` و`TestArtifacts` وملفات الجهاز والبناء.

ابدأ من `START_HERE_ERP_PROTOTYPE.md` ثم `Documentation/00_DOCUMENTATION_INDEX.md`.
