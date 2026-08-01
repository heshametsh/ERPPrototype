# Phase 9.0C — 1,000-Row Current-Sheet Coverage and Stress Baseline

## الهدف

تحويل منصة اختبارات المتصفح من فحص تأسيسي فقط إلى فحص واقعي فوق حجم كبير، مع فصل الاختبار الوظيفي عن اختبار الضغط.

## حجم البيانات

قاعدة E2E المؤقتة تنشئ:

- 1,000 أمر عمل في السنة الحالية.
- 1,000 أمر عمل في السنة السابقة.
- 2,000 أمر عمل إجمالًا داخل قاعدة الاختبار المعزولة.

لا يتم استخدام قاعدة التطوير أو Azure.

## Suites

### Smoke

يفتح التطبيق ويسجل الدخول ويتأكد من تحميل 1,000 صف وأن Virtual DOM لا يرسم كل الصفوف داخل DOM.

### Full

يشمل Smoke، ثم:

- الوصول للصف رقم 1,000 بالتمرير الافتراضي.
- البحث عن أمر عمل قريب من نهاية الشيت.
- مسح البحث واستعادة 1,000 صف.
- تعديل ملاحظة في منتصف الشيت وحفظها.
- Refresh والتأكد من بقاء القيمة المحفوظة.
- تغيير السنة وتحميل 1,000 صف أخرى دون تسرب بيانات السنة السابقة.

### Stress

يشمل Full، ثم:

- إدراج 1,000 صف مرة واحدة فوق شيت يحتوي 1,000 صف.
- Undo وإعادة العدد إلى 1,000 وحالة Dirty إلى صفر.
- Redo وإعادة 1,000 صف مضاف.
- Undo نهائي للرجوع إلى Baseline نظيف.
- تسجيل أزمنة التحميل والبحث والحفظ والإدراج وUndo/Redo في ملف JSON.
- تشغيل اختبار SQL إضافي يضيف ويعدل ويحذف 1,000 صف في كل عملية.

## التشغيل المقترح للقبول

من مجلد Solution:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Headed
```

النتيجة المطلوبة:

```text
Result: 11/11 passed.
Phase 9.0C SQL Server stress safety net: PASS
Result: 25/25 browser checks passed.
Phase 9.0C Stress browser suite: PASS
ERPPrototype automated verification: PASS
```

ملف القياسات يظهر داخل آخر مجلد في:

```text
ERPPrototype.E2ETests\TestArtifacts\...\phase9-1000-row-stress-metrics.json
```

أول تشغيل مقبول ينشئ Baseline فقط. لا توجد حدود زمنية اعتباطية في هذه المرحلة؛ يتم اعتماد الحدود لاحقًا من القياس الفعلي على جهاز التطوير.
