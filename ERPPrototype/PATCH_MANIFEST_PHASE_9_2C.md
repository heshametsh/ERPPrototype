# ERP Prototype — Phase 9.2C CSS Consolidation Candidate

## الهدف

إزالة تراكم تصميمات Phase 9.2 القديمة وتثبيت قاعدة CSS واحدة تمثل شكل **B6-R1** الحالي، بدون إضافة تصميم جديد أو تغيير منطق البرنامج.

## الملفات المستبدلة وقت التشغيل

```text
Components\Pages\WorkOrders.razor.css
wwwroot\app.css
```

## ملفات التوثيق والأداة

```text
Tools\Invoke-Phase92CCssConsolidation.ps1
Documentation\00_DOCUMENTATION_INDEX.md
Documentation\31_CHANGE_SUMMARY_2026-08-03_PHASE9_2C.md
PATCH_MANIFEST_PHASE_9_2C.md
SHA256SUMS.txt
```

## ضمانات النطاق

- لا تعديل في Razor أو JavaScript أو C#.
- لا تعديل في قاعدة البيانات أو Migrations.
- لا تعديل في الحفظ أو الحسابات أو الفلاتر أو السلال.
- لا `Update-Database`.
- الأرشفة الاختيارية للـManifest القديمة تنظيمية فقط.

## التركيب

فك محتويات ZIP داخل المجلد الذي يحتوي على `ERPPrototype.csproj` ووافق على الاستبدال.

شغّل التحقق الثابت:

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Invoke-Phase92CCssConsolidation.ps1
```

ثم اختبارات المشروع:

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

المستهدف:

```text
Integration: 17/17 PASS
Browser Stress: 55/55 PASS
ERPPrototype automated verification: PASS
```

لا تعمل Commit أو Tag قبل نجاح الاختبارات واعتماد الصورة بصريًا.
