# نظام المقاول — Contractor ERP

نظام ويب لمقاولي الكهرباء (الشركة السعودية للكهرباء وما يشبهها): شيت أوامر عمل بسرعة Excel، وأمر عمل واحد مشترك بين كل الأقسام، وشاشات للمديرين تعرض المشاكل.

**كل التقنيات مجانية ومفتوحة المصدر** — راجع `docs/LICENSES.md`.

## اقرأ الأول

1. `docs/PLAN.md` — خطة البناء ومراحلها.
2. `docs/ARCHITECTURE.md` — شكل النظام والفولدرات بشرح بسيط.
3. `docs/business/` — قواعد البزنس (منقولة من المشروع الأول).

## التشغيل على جهاز المطور

المطلوب: .NET 10 SDK، Node 22، Docker.

```bash
# 1) قاعدة البيانات
docker run -d --name erp-pg -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=erp -e POSTGRES_DB=contractor_erp -p 5432:5432 postgres:17-alpine

# 2) السيرفر (بيعمل الجداول وبيانات تجريبية تلقائيًا في وضع التطوير)
cd backend
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5080 dotnet run --project src/Host --no-launch-profile

# 3) الواجهة (في شباك تاني)
cd frontend
npm install
npm run dev        # افتح http://localhost:5173
```

حسابات تجريبية (باسورد `Demo#2026`): `employee` و `employee2` (قسم تاني) و `newemployee` (باسورد مؤقت) و `admin`.

## الاختبارات

```bash
cd backend  && dotnet test                  # قواعد + PostgreSQL حقيقي + حدود الموديولات
cd frontend && npm test && npm run typecheck && npm run lint
```

## النشر عند عميل

```bash
cd deploy
cp customer.env.example customer.env      # عدّل الدومين والباسورد
docker compose --env-file customer.env run --rm app --migrate
docker compose --env-file customer.env up -d
```

كل عميل = نسخة لوحده (قاعدة بيانات وباسوردات ونسخ احتياطية منفصلة).
