# 07 — Known Issues and Technical Debt

**Status:** Active register  
**Rule:** المشكلة لا تختفي لأنها مؤجلة. يجب أن يكون لها أولوية وحل مؤقت وشرط إغلاق.

## Priority Meaning

- **P0:** خطر بيانات/أمان أو يمنع التشغيل.
- **P1:** يمنع Pilot أو البيع أو يؤثر بقوة على الاستخدام الأساسي.
- **P2:** مهم للصيانة أو التشغيل لكن يمكن تأجيله داخل Prototype.
- **P3:** تحسين أو تنظيف غير عاجل.

## Active Items

| ID | Priority | Issue | Evidence / impact | Temporary position | Release gate |
|---|---:|---|---|---|---|
| GRID-001 | P1 | إرهاق التنقل الرأسي بعد جلسة طويلة | الأداء يتدهور بعد آلاف الحركات؛ تغيير السنة يعيد السرعة | E6C ثابت؛ لا Recovery تلقائي مقبول | يجب حله أو إثبات حدود مقبولة قبل البيع |
| GRID-002 | P1 | `tabulatorTest.js` = 7,327 سطرًا في E6F ومسؤوليات كثيرة | تعديل Lifecycle أثّر سابقًا على الأسهم والسنة | Refactor تدريجي فقط | مطلوب قبل توسع ميزات الشيت |
| GRID-003 | P1 | Insert/Delete/structural Undo تستخدم full `setData` | تعيد بناء بيانات الشيت والتحقق | لا نضيف عمليات هيكلية ثقيلة جديدة | تحسين مرحلي بعد فصل الموديولات |
| GRID-004 | P1 | 10,000 صف غير مختبرة | Client-side loading قد لا يظل مقبولًا | اختبار منفصل قبل قرار معماري | مطلوب قبل تحديد سعة المنتج |
| TEST-001 | P1 | لا Automated Tests | الاعتماد على الاختبار اليدوي يزيد Regression | Checklist إلزامية الآن | Browser/service tests مطلوبة قبل Pilot |
| AUTH-001 | P1 | BranchManager workflow غير مكتمل | الحساب موجود لكن لا شاشة read-only أو إدارة فرع | لا نقدمه كميزة منتهية | مطلوب قبل Pilot للدور |
| AUTH-002 | P1 | Project role اسمًا ووظيفة غير محسوم | `ProjectManager` في الكود مقابل Projects Director في المنتج | لا Migration بدون قرار | مطلوب قبل قاعدة عميل |
| AUTH-003 | P1 | Rename/reset password/activate/deactivate غير مكتملة | الحسابات ثابتة لكن تغيير الأشخاص غير مدعوم | Admin ينشئ الحساب فقط حاليًا | مطلوب قبل Pilot |
| DATA-001 | P1 | Scope uniqueness يحتاج تأكيد | DB الحالي company-wide؛ قرارات سابقة قد تُفهم per department | لا نغير index بالتخمين | مطلوب قبل بيانات حقيقية |
| DATA-002 | P1 | نقل سنة Assignment Date يحتاج تأكيد | الكود ينقل تلقائيًا؛ قد يكون المطلوب اقتراحًا | توثيق السلوك الحالي | مطلوب قبل اعتماد Workflow |
| OPS-001 | P1 | Seeder/DB initialization داخل startup | بعد 3 محاولات يفشل بدء التطبيق وقد يظهر 500.30 | اجمع Azure logs | يجب حسمه قبل استقرار Azure |
| ADMIN-001 | P2 | `AdminPanel.razor` يستخدم DbContext مباشرة | صعوبة الاختبار وغياب audit/use-case boundary | لا نوسع الصفحة قبل Service | Refactor قبل ميزات إدارة إضافية |
| AUDIT-001 | P1 | لا Audit trail إداري | تغييرات الحسابات والفروع لا تسجل كسجل أعمال | logging العادي غير كافٍ | مطلوب قبل عميل حقيقي |
| OBS-001 | P1 | لا Client error reporting/Correlation Id | المستخدم لن يفتح Console في الإنتاج | Console يدوي في Prototype | مطلوب قبل Pilot خارجي |
| SEC-001 | P1 | إعدادات Production غير مكتملة | `AllowedHosts=*`، لا CSP/rate limiting review | بيئة تجريبية فقط | مراجعة قبل العميل |
| FEATURE-001 | P2 | Excel import/export غير منفذين | جزء أساسي من قبول Excel-like | خارج خطوة الأداء الحالية | مطلوب قبل اكتمال V1 |
| FEATURE-002 | P2 | Dashboard غير منفذ | KPIs غير متاحة | مؤجل حتى نجاح الشيت | مطلوب بعد grid validation |
| FEATURE-003 | P3 | Warehouse/invoice غير منفذين | مقصود خارج Prototype | لا نبدأ الآن | ليس Gate للشيت |
| CODE-001 | P3 | اسم `Busket` خطأ إملائي في الكود/DB | تغييره يحتاج Migration واسع | UI يعرض Basket | يؤجل حتى Migration مخطط |
| BUILD-001 | P0 حتى الاختبار | الحزمة لم تُبن في بيئة المراجعة | لا .NET SDK متاح هنا | يجب Rebuild على جهاز التطوير | لا اعتماد قبل PASS |
| DOC-001 | P2 | تقارير تاريخية كانت في الجذر وتسبب لبسًا | مصدر حقيقة غير واضح | نُقلت إلى Archive | مغلق في هذه الحزمة |


## Closed Issues — 2026-07-27

| ID | Issue | Resolution | Evidence |
|---|---|---|---|
| GRID-CLOSED-001 | الضغط المستمر على Enter أصبح ثقيلًا قرب الصف 1,040 | E6D أضاف Enter إلى بوابة التنقل الرأسي المركزية المستخدمة مع الأسهم | المستخدم اختبر الاستمرار بعد نقطة البطء وأكد أن السلوك أصبح سريعًا |
| GRID-CLOSED-002 | أول كليك يمين بدون تحديد سبب `activeRange.occupies is not a function` | E6E ينشئ نطاق خلية حقيقيًا قبل معالجة Tabulator لأول right-click | المستخدم اختبر سنة بصف واحد وسنة كبيرة وأكد اختفاء الخطأ وعمل القائمة |
| GRID-CLOSED-003 | عمليات هيكلية/Undo/Redo سببت `element?.focus is not a function` | E6F أضاف bounded focus retry guard مع فحص حقيقي للعنصر | المستخدم اختبر Insert/Delete/Undo/Redo/Copy-Paste/Save ولم يظهر الخطأ أو أي Console error |

## Closed / Rejected Experiments

| Item | Result |
|---|---|
| Fixed rowHeight Step16P1A | فشل وتم الرجوع |
| Same-instance `replaceData` recovery | تسبب في توقف الأسهم/السنة؛ مرفوض |
| Range recycle diagnostic | لم يعالج الإرهاق؛ ليس السبب |
| Hidden instance recovery R3 variants | تجارب تشخيصية غير معتمدة؛ ليست في E6E |
| Pixel-only resize restoration | تسبب في انحراف الصفوف؛ استُبدل بالـlogical anchor في E6C |

## How to Close an Item

لا يُكتب “تم الحل” إلا بعد:

1. Code change.
2. Build.
3. Regression checklist.
4. Specific reproduction test.
5. Performance/security evidence when relevant.
6. Documentation update.
7. Git checkpoint.

## Simple Example

`GRID-001` لا يُغلق لأن تغيير السنة يعيد السرعة. تغيير السنة Workaround، مثل إعادة تشغيل جهاز يسخن. الإغلاق الحقيقي يعني أن الجلسة الطويلة تظل سريعة أو أن هناك حلًا آمنًا غير ملحوظ ومثبتًا بالاختبار.


## E6F Provisional Performance Reference

القيم المؤقتة لمنع Regression أثناء Refactor: ArrowDown p95 = 107.3ms، ArrowUp p95 = 108.3ms، Enter p95 = 125.2ms. الحدود المؤقتة: 118ms / 119ms / 138ms. هذه ليست أهداف المنتج النهائية ولا تغلق `GRID-001`.
