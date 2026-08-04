# Phase 9.1D1 — Open Work Orders Header Summary

**Status:** Candidate — لا يتم إنشاء Commit أو Tag قبل نجاح الاختبارات.

**Base required:** `Phase-9.1C-Stable`

## نطاق هذه الخطوة فقط

هذه الحزمة تنفذ أول تعديل متفق عليه فقط، ولا تغيّر الفلاتر أو ترتيب الأعمدة بعد:

1. إزالة رسالة التعليمات الموجودة أعلى الشيت.
2. وضع ملخص أوامر العمل المفتوحة في نفس المكان داخل الهيدر.
3. الإبقاء على ملخص الصفوف المحددة أسفل الشيت كما هو بأربع قيم.

## ملخص الهيدر الجديد

يعرض دائمًا بيانات القسم والسنة الحاليين:

- `Open Work Orders`
- `Open Work Order Value`
- `Open Partial Amount`
- `Open Remaining Amount`

أمر العمل المفتوح هو أي أمر لا تكون سلته `انتهاء امر العمل`، باستخدام القيمة المركزية `WorkOrderBuskets.WorkOrderCompleted` بدل كتابة النص داخل JavaScript.

الملخص لا يتأثر بالبحث أو الفلاتر أو الترتيب. لكنه يتحدث عند تغيير البيانات نفسها، مثل:

- تعديل قيمة أمر العمل أو المبلغ الجزئي.
- نقل أمر العمل إلى `انتهاء امر العمل` أو إعادته منها.
- Undo / Redo.
- إضافة أو حذف صفوف وحفظ البيانات وإعادة تحميل الصفحة.

الصف الجديد الفارغ لا يدخل في العدد حتى يحتوي بيانات فعلية.

## ملخص التحديد

يبقى أسفل الشيت ويظهر فقط عند وجود تحديد، ويعرض بدون تغيير:

- `Selected Work Orders`
- `Selected Work Order Value`
- `Selected Partial Amount`
- `Selected Remaining Amount`

## الملفات المعدلة

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.cs`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/js/tabulatorAggregates.js`
- `wwwroot/js/tabulatorTest.js`
- `ERPPrototype.E2ETests/Phase9FoundationBrowserTest.cs`
- `ERPPrototype.E2ETests/Phase9FoundationRunner.cs`

## التركيب

فك محتويات ZIP مباشرة داخل مجلد المشروع الداخلي الذي يحتوي على:

```text
ERPPrototype.csproj
```

وافق على استبدال الملفات.

لا توجد Migration ولا Backfill في هذه الخطوة. لا تشغّل `Update-Database`.

## الاختبار

من مجلد الحل الخارجي شغّل:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

النتيجة المطلوبة:

```text
Integration tests: 17/17 PASS
Browser checks: 47/47 PASS (Stress)
ERPPrototype automated verification: PASS
```

اختبار المتصفح يتحقق من أن:

- العناصر الأربعة ظهرت أعلى الشيت.
- نقل أمر واحد إلى `انتهاء امر العمل` ينقص العدد والمبالغ المفتوحة فقط.
- Undo يعيد العدد والمبالغ إلى قيمها الأصلية.
- البحث والفلاتر لا يغيران ملخص الأوامر المفتوحة.
- تعديل المبالغ وUndo/Redo يحدث ملخص الهيدر قبل الحفظ.
- ملخص التحديد السفلي يظل يعمل كما كان.

## الفحص المنفذ قبل التسليم

تم بنجاح:

- JavaScript syntax check لجميع ملفات JavaScript بالمشروع.
- فحص `git diff --check` للملفات المعدلة.
- فحص توازن أقواس CSS وC# بصورة ثابتة.
- Harness مستقل لحساب الأوامر المفتوحة واستبعاد `انتهاء امر العمل`.
- Harness مستقل لتحديث العدد والمبالغ عند الإغلاق والإعادة والتعديل المالي.

لم يتم تشغيل Build أو SQL Server أو Playwright داخل بيئة إعداد الحزمة لعدم توفر .NET وSQL Server فيها؛ الاعتماد النهائي يكون من نتيجة جهازك.

## الرجوع

قبل Commit يمكن الرجوع إلى النسخة المستقرة بالأمر:

```powershell
git restore --source Phase-9.1C-Stable --staged --worktree -- ERPPrototype
```
