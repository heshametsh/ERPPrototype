# Phase 9.2D2 — E2E Consolidation Report

**التاريخ:** 2026-08-04  
**النطاق:** مشروع `ERPPrototype.E2ETests` فقط  
**نوع التسليم:** نسخة موحدة كاملة لاستبدال مجلد الاختبارات، وليست Patch إضافيًا فوق D2/R1/R2.

## سبب التوحيد

النسخة المرفوعة كانت تحتوي على منطق D2 ثم إصلاحي R1 وR2. نجح R1 في تثبيت تغيير السنة والـVirtual Scroll، لكن R2 قرأ الطرف الأول من نطاق Tabulator واستخدم بحثًا خطيًا داخل جميع الصفوف، فنتج False Failure رغم وصول الشيت بصريًا إلى الصف 1000.

## ما تم الاحتفاظ به

- إلغاء Observe وSlowMo.
- تشغيل Benchmark بوضع محايد.
- انتظار Dataset السنة الصحيحة وإكمال Dashboard وعمليات استعادة الـViewport.
- التحقق الحقيقي من ظهور الصف بعد `scrollToRow`.
- قياس Arrow وEnter وWheel مع Fresh browser لكل Run.

## ما تم تنظيفه

1. حذف مسار R2 الخاطئ بالكامل:
   - `getBounds().start ?? getBounds().end`
   - `rows.findIndex(...)`
   - fallback إلى `state.activeCell` داخل قياس التنقل الطويل.
2. قراءة موضع Arrow/Enter أصبحت O(1) من نطاق Tabulator النشط:
   - `activeRange.getBottomEdge() + 1`
3. التحقق من نهاية Keyboard يعيد استخدام `longSession.PositionAfter` بدل قراءة ثانية مستقلة قد تتعارض مع القياس.
4. إصلاح تعبير Wheel position الذي احتوى على `tableId => Number(` مكررًا.
5. تبسيط حساب هدف الاستمرار العميق وإزالة حسابات متعاكسة كانت تنتهي دائمًا لنفس القيمة.
6. توحيد شرط Lifecycle داخل `ScrollToRowAsync` في دالة JavaScript محلية واحدة بدل تكراره قبل وبعد التمرير.

## مقارنة الحجم

| الملف | النسخة المرفوعة | النسخة الموحدة | الفرق |
|---|---:|---:|---:|
| `PerformanceBaselineBrowserTest.cs` | 1,173 | 1,131 | -42 |
| `WorkOrdersPage.cs` | 2,385 | 2,376 | -9 |
| الإجمالي للملفين | 3,558 | 3,507 | -51 |

- عدد الدوال في الملفين لم يزد: **100 قبل و100 بعد**.
- لم تُضف Helper جديدة لمجرد تمرير الاختبار.
- لا يوجد تعديل على التطبيق أو قاعدة البيانات أو JavaScript الإنتاجي.

## التحقق الثابت المنفذ

- توازن أقواس C# في الملفين المعدلين.
- عدد Raw String delimiters زوجي.
- فحص Syntax لمقاطع JavaScript المعدلة بواسطة Node.js.
- التأكد من غياب منطق R2 القديم من ملف الأداء.
- التأكد من أن `SlowMo = 0` ولا توجد واجهة Observe.
- إنشاء SHA-256 لكل ملفات الحزمة.

## ما لم يتم تنفيذه في بيئة الإنشاء

لا يتوفر .NET SDK أو SQL Server في بيئة الإنشاء، لذلك يلزم على جهاز المشروع:

1. تشغيل Stress كاملًا.
2. ثم تشغيل Arrow Performance 1,000 rows × 5 runs.

## أوامر الاختبار

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

بعد نجاحه:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```
