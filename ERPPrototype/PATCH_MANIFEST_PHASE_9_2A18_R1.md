# Phase 9.2A18-R1 — Arabic Basket Label Test Fix

## سبب التصحيح
واجهة ملخص السلال تعرض العناوين العربية المعتمدة:

- `السلة`
- `العدد`
- `المتبقي`

لكن اختبار المتصفح القديم ظل يبحث عن النص الإنجليزي `Remaining Amount` داخل ملخص السلال، لذلك فشل رغم أن الواجهة نفسها ظهرت بصورة صحيحة.

## التعديل
تم تعديل توقع واحد فقط في:

`ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`

ليتحقق من ظهور `المتبقي` بدل `Remaining Amount` داخل Dashboard السلال.

لم يتم تعديل كود البرنامج أو الحسابات أو CSS أو قاعدة البيانات.

## الاختبار
شغّل:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المستهدفة:

- Integration: 17/17 PASS
- Browser Stress: 55/55 PASS
- ERPPrototype automated verification: PASS
