# التراخيص — كل حاجة مجانية

القاعدة: **مفيش مكتبة تدخل المشروع إلا لو ترخيصها مجاني للاستخدام التجاري** (MIT / Apache-2.0 / BSD / PostgreSQL / LGPL).
أي مكتبة جديدة تتسجل هنا قبل ما تتضاف.

| المكتبة | الاستخدام | الترخيص |
|---|---|---|
| .NET 10 / ASP.NET Core / EF Core / Identity | السيرفر | MIT |
| Npgsql + Npgsql EF Core | الاتصال بـ PostgreSQL | PostgreSQL License |
| PostgreSQL 17 | قاعدة البيانات | PostgreSQL License |
| FluentValidation | فحص شكل الطلبات | Apache-2.0 |
| Serilog | السجلات | Apache-2.0 |
| xUnit, Testcontainers, NetArchTest | الاختبارات | Apache-2.0 / MIT |
| React, Vite, TypeScript | الواجهة | MIT / Apache-2.0 |
| Mantine | مكونات الشاشات (يدعم العربي RTL) | MIT |
| TanStack Query | جلب البيانات | MIT |
| React Router, i18next, Zod | التنقل، الترجمة، الفحص | MIT |
| RevoGrid Community (`@revolist/react-datagrid`) | الشيت | MIT |
| Vitest, oxlint | اختبارات وفحص الواجهة | MIT |
| Caddy | HTTPS | Apache-2.0 |

## ممنوع (بقوا مدفوعين أو ترخيصهم مقيد)

- **MediatR, AutoMapper, MassTransit (الإصدارات الجديدة)**: بقت تجارية سنة 2025.
- **Duende IdentityServer**: مدفوع للشركات.
- **AG Grid Enterprise, Handsontable, Syncfusion**: مدفوعين.
- **Redis 7.4+**: ترخيصه اتغير. لو احتجنا كاش موزع نستخدم **Valkey** (BSD).

> راجع الترخيص الحالي لأي مكتبة قبل الاعتماد عليها؛ التراخيص بتتغير.
