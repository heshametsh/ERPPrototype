# ERPPrototype

نظام Blazor لمتابعة أوامر العمل بأسلوب قريب من Excel، مبني باستخدام ASP.NET Core Identity وEF Core وSQL Server وTabulator.

## نقطة الاستقرار الحالية

- `Phase 8.9`: نقطة الاستقرار المقبولة بعد إغلاق الـRefactor.
- فصل قراءة أوامر العمل وتجهيز خطة الحفظ، مع إبقاء الصلاحيات والتكرار العالمي وRowVersion والـTransaction كوحدة ذرية داخل `WorkOrderService`.
- شبكة الحفظ الآلية: 10 اختبارات تشمل التطبيع والتحقق والنطاق والتكرار والتزامن ونقل السنة والإضافة والتعديل والحذف والـRollback.
- إغلاق Phase 8 نجح في Release Build والاختبارات 10/10 وفحص Git وإنشاء ZIP مصدر نظيف بحجم 3.06 MB، من غير تغيير قواعد العمل أو الواجهة أو قاعدة البيانات.
- الـRefactor متوقف بعد Phase 8.9؛ أي تقسيم جديد يحتاج ميزة أو مشكلة مقاسة تثبت الحاجة.

## إعادة التحقق الآلي

من داخل مجلد المشروع:

```powershell
.\Tools\Invoke-Phase8Verification.ps1
```

أو لتنظيف الملفات المحلية، تشغيل التحقق، ثم إنشاء ZIP مصدر نظيف في خطوة واحدة:

```powershell
.\Tools\Invoke-Phase8Closure.ps1
```

## إنشاء ZIP نظيف مستقبلًا

```powershell
.\Tools\New-CleanProjectArchive.ps1
```

الأداة تستبعد `bin` و`obj` و`.vs` وملفات الجهاز والبناء، ولذلك لا يزيد حجم التسليم بسبب المكتبات الناتجة عن التشغيل.

ابدأ من `START_HERE_ERP_PROTOTYPE.md` ثم `Documentation/00_DOCUMENTATION_INDEX.md`.
