# Phase 9.2B6-R1 — Light Cell Selection Frame

هذا التصحيح الصغير يُركب فوق **Phase 9.2B6**.

## التعديل

- الاحتفاظ بالتظليل الأزرق الفاتح داخل الخلية المحددة.
- إضافة إطار أزرق هادئ بسُمك `1px` حول الخلية أو النطاق المحدد.
- الإطار خفيف وغير حاد، ولا يعيد مقبض التحديد الثقيل.
- لا توجد تغييرات على الجدول أو البحث أو الملخصات أو منطق العمل.

## الملفات

- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

## التركيب

فك محتويات الملف داخل المجلد الذي يحتوي على `ERPPrototype.csproj` ووافق على الاستبدال.

لا تشغّل `Update-Database`.

## الاختبار

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

المتوقع: Integration `17/17 PASS` وBrowser Stress `55/55 PASS`.
