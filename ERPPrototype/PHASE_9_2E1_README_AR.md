# Phase 9.2E1 — Engineering Stabilization Gate

هذا الـPatch لا يغيّر منطق التطبيق أو قاعدة البيانات. يضيف فقط اختبارات تثبيت قبل بدء Custom Columns.

## الاختبارات الجديدة

1. **Status اختياري**
   - يحفظ أمر عمل جديدًا بقيمة Status فارغة.
   - يعيد قراءته من SQL Server.
   - يتأكد أن القيمة بقيت فارغة ولم تُستبدل بقيمة افتراضية.

2. **DisplayOrder مع حفظين متزامنين**
   - يشغّل عمليتي حفظ متزامنتين لنفس القسم والسنة.
   - يستخدم EF Core command interceptor داخل مشروع الاختبارات فقط لإجبار العمليتين على قراءة نفس نقطة تخصيص DisplayOrder قبل الإدراج.
   - يتأكد أن السجلين حصلا على قيمتي DisplayOrder مختلفتين.

## النتيجة المتوقعة

- اختبار Status يجب أن ينجح.
- اختبار DisplayOrder قد يفشل في النسخة الحالية. إذا فشل برسالة أن الحفظين حصلا على نفس DisplayOrder، فهذا إثبات مباشر للتعارض المتزامن، وليس عطلًا عشوائيًا في الاختبار.

## التثبيت

فك الضغط داخل مجلد الحل:

`C:\Users\SinDbaD\source\repos\ERPPrototype`

يجب أن تصبح المسارات النهائية:

- `ERPPrototype\ERPPrototype.IntegrationTests\DisplayOrderQueryBarrierInterceptor.cs`
- `ERPPrototype\ERPPrototype.IntegrationTests\IntegrationTestDatabase.cs`
- `ERPPrototype\ERPPrototype.IntegrationTests\IntegrationTestRunner.cs`
- `ERPPrototype\ERPPrototype.IntegrationTests\WorkOrderSaveIntegrationTests.cs`
- `ERPPrototype\Tools\Invoke-ERPTests.ps1`

## التشغيل الأول

لتوفير الوقت، شغّل اختبارات SQL Server فقط، بدون Browser Suite:

```powershell
dotnet run --project .\ERPPrototype\ERPPrototype.IntegrationTests\ERPPrototype.IntegrationTests.csproj --configuration Release
```

العدد بعد نجاح الاختبارين الجديدين يصبح `18/18` في Core، و`19/19` عند تشغيل Stress لاحقًا.
