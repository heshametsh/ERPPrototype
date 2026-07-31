# 01 — UDS ERP Project Context

**Version:** 3.0  
**Status:** Approved for the current prototype baseline  
**Supersedes:** `UDS_PROJECT_CONTEXT_v2.0`  
**Baseline:** Step 16E6C  
**Owner:** Hesham Omar

## 1. Product Vision

UDS ERP هو منتج ويب لمتابعة عمليات المقاولين العاملين مع الشركة السعودية للكهرباء وجهات البنية التحتية المشابهة.

النظام لا يحل محل SAP أو UDS. هو طبقة متابعة داخل شركة المقاول تجمع أوامر العمل والتأخير والإنتاجية والمراحل التشغيلية والمالية بدل الاعتماد على ملفات Excel منفصلة.

الهدف الأول هو استبدال تجربة Excel اليومية بتجربة أسرع أو مساوية لها، وليس بناء ERP ضخم كامل من أول نسخة.

## 2. Current Architecture Decision

التقنية المعتمدة حاليًا:

- Blazor Web App — Interactive Server
- ASP.NET Core
- ASP.NET Core Identity
- Entity Framework Core
- SQL Server محليًا
- Azure SQL Database عند النشر
- Azure App Service
- Tabulator لشيت أوامر العمل

قرار Power Apps وDataverse الموجود في Version 2.0 أُلغي كاتجاه حالي وأُرشف، لأن الكود الفعلي والاختبارات انتقلت إلى Blazor وSQL Server.

## 3. Customer Deployment Model

في الإصدارات التجارية الأولى:

```text
Company A -> App A + Database A + Users/Secrets/Backups A
Company B -> App B + Database B + Users/Secrets/Backups B
```

- نفس Source Code لكل العملاء.
- لا Shared Database Multi-Tenancy الآن.
- لا Microservices.
- لا ABP Framework إلا إذا ظهر احتياج مثبت لا يستطيع التصميم الحالي حله.
- الاتجاه هو Modular Monolith: تطبيق واحد قابل للنشر، لكن داخله حدود واضحة بين الموديولات.

## 4. Product Priorities

بالترتيب:

1. سرعة الاستخدام اليومية.
2. تجربة قريبة من Excel.
3. سلامة البيانات والصلاحيات.
4. بساطة الصيانة.
5. قابلية التوسع بدون تعقيد مبكر.
6. الشكل الجمالي بعد نجاح الأساس الوظيفي.

## 5. V1 Scope

### داخل النطاق الحالي

- تسجيل الدخول.
- إدارة الفروع.
- إنشاء الأقسام الأربعة الثابتة لكل فرع.
- حسابات المستخدمين الثابتة.
- أوامر العمل.
- شيت قابل للتعديل.
- بحث وفلاتر.
- Keyboard navigation.
- Copy/Paste.
- Insert/Delete rows.
- Undo/Redo داخل الجلسة.
- حفظ Delta إلى SQL Server.
- التحقق من التكرار والتعارض.
- اختبار الأداء والاستقرار.
- Excel Import/Export لاحقًا داخل V1 بعد استقرار الشيت.
- Dashboard صغير بعد استقرار الشيت.

### خارج النطاق الحالي

- المحاسبة الكاملة.
- الموارد البشرية.
- الأسطول.
- المشتريات.
- CRM.
- Portal عام.
- Mobile app.
- Offline mode.
- Warehouse والفواتير قبل نجاح Prototype الشيت.

## 6. Company Structure

```text
Company deployment
  -> Branch
      -> Department
          -> Fixed user accounts
          -> Work Orders
```

الأقسام الثابتة:

- التوصيلات/العدادات.
- المشاريع الأرضية.
- المشاريع الهوائية.
- الصيانة والطوارئ.

## 7. Roles

### Product roles المطلوبة

- Admin: حساب واحد فقط، يرى ويدير كل شيء.
- ProjectManager: يرى كل الفروع والأقسام، Read-only لأوامر العمل.
- Branch Manager: يرى فرعه Read-only، ويدير الحسابات الثابتة داخل فرعه.
- Department Employee: يعدل أوامر العمل في قسمه فقط.

### Current code names

- `Admin`
- `ProjectManager`
- `BranchManager`
- `Employee`

`ProjectManager` هو الاسم النهائي المعتمد في المنتج والكود. `Employee` هو اسم الـRole التقني الحالي، بينما **Department Employee / موظف القسم** هو اسم العرض الوظيفي. لا نعيد تسمية `Employee` في قاعدة الهوية ضمن مرحلة الأداء الحالية.

## 8. Work Order Identity and Year

### Current implementation

- Work Order Number: تسعة أرقام.
- Work Type Code: ثلاثة أرقام.
- قاعدة البيانات تفرض Unique Index حاليًا على:
  `WorkOrderNumber + WorkTypeCode` على مستوى قاعدة الشركة.
- عند حفظ Assignment Date بسنة مختلفة، الكود الحالي ينقل الصف تلقائيًا إلى سنة التاريخ.

### Confirmed and open business rules

- قاعدة التفرد مؤكدة ونهائية على مستوى الشركة وكل السنوات للزوج `WorkOrderNumber + WorkTypeCode`، ومتطابقة مع الـUnique Index الحالي.
- ما زال سلوك اختلاف سنة `AssignmentDate` يحتاج قرار UX نهائيًا: النقل التلقائي الحالي أم عرض اقتراح للمستخدم قبل النقل.

لا يجوز تغيير سلوك السنة بناءً على افتراض.

## 9. UX Principles

- Keyboard first.
- أقل عدد نقرات.
- Inline editing.
- المستخدم يظل داخل الشيت.
- لا Form منفصل للتعديل اليومي.
- Copy/Paste مع Excel.
- تحديد خلية أو نطاق مثل Excel.
- رسائل خطأ واضحة وتحدد مكان المشكلة.
- لا نسأل المستخدم عن معلومة يعرفها النظام.
- الأداء Feature أساسية وليس تحسينًا شكليًا.

## 10. Security and Data Principles

- الواجهة ليست مصدر الصلاحية.
- الاستعلام في السيرفر يقيد البيانات قبل إرسالها للمتصفح.
- Service وDatabase يعيدان التحقق من القواعد المهمة.
- لا أسرار داخل الكود.
- لا بيانات حقيقية أو حساسة أثناء الاختبار على الإنترنت.
- كل عميل له قاعدة وأسرار ونسخ احتياطية مستقلة.
- مراجعة أمنية مستقلة مطلوبة قبل بيانات عملاء حقيقية.

## 11. Success Measures

قبل اعتماد الشيت:

- فتح مقبول مع 3,000 صف.
- اختبار 10,000 صف.
- البحث والفلتر بدون تأخير مزعج.
- التعديل والحفظ لا يضيّعان البيانات.
- الجلسة الطويلة لا تتدهور.
- Copy/Paste مطابق للقواعد.
- الصلاحيات لا يمكن تجاوزها من المتصفح.
- العمل على شبكة وأجهزة الشركة.
- Azure وإعادة الاتصال مستقران.

## 12. Simple Example

**لماذا نستخدم App وDatabase منفصلين لكل شركة؟**  
مثل أن لكل عميل خزنة مستقلة. حتى لو حدث خطأ في إعداد عميل، لا تختلط أوراقه مع عميل آخر. الثمن هو أن النشر والنسخ الاحتياطي يتكرران لكل عميل، لكنه أبسط وأكثر أمانًا في الإصدارات الأولى.
