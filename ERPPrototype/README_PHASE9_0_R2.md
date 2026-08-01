# Phase 9.0-R2 — E2E Static Web Assets Fix

## السبب

تشغيل التطبيق في البيئة المخصصة `E2ETest` عبر `dotnet run --no-build` لم يكن يفعّل Static Web Assets تلقائيًا. لذلك صفحة HTML كانت تصل، لكن ملفات Blazor وCSS المولدة لم تكن متاحة، ومنها:

- `/_framework/blazor.web.js`
- `ERPPrototype.styles.css`
- `Components/Layout/ReconnectModal.razor.js`

## التعديل

1. `Program.cs`
   - يفعّل `UseStaticWebAssets()` في بيئة `E2ETest` فقط.
   - لا يغيّر Development أو Production.

2. `ERPPrototype.E2ETests/WebApplicationProcess.cs`
   - لا يعتبر التطبيق جاهزًا إلا بعد نجاح صفحة Login وملف `/_framework/blazor.web.js` معًا.
   - يمنع فتح المتصفح على تطبيق ناقص الموارد مستقبلًا.

## التشغيل

من مجلد الـSolution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-Phase9Foundation.ps1 -Headed
```

لا توجد Migration ولا تغيير في قاعدة البيانات أو الشيت.
