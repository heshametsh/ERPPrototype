# ERPPrototype

نظام Blazor لمتابعة أوامر العمل بأسلوب قريب من Excel، مبني باستخدام ASP.NET Core Identity وEF Core وSQL Server وTabulator.

## نقطة الاستقرار الحالية

- `Phase 8.8-Stable`: فصل قراءة أوامر العمل وتجهيز خطة الحفظ، مع إبقاء الصلاحيات والتكرار العالمي وRowVersion والـTransaction كوحدة ذرية داخل `WorkOrderService`.
- شبكة الحفظ الآلية: 10 اختبارات تشمل التطبيع والتحقق والنطاق والتكرار والتزامن ونقل السنة والإضافة والتعديل والحذف والـRollback.
- `Phase 8.9`: إغلاق وتنظيف نهائي فقط؛ لا يغيّر قواعد العمل أو الواجهة أو قاعدة البيانات.

## التحقق الآلي

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
