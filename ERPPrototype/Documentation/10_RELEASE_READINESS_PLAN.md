# 10 — Release Readiness Plan

**Status:** Approved gates  
**Purpose:** نفرق بين "يعمل على جهازنا"، "صالح لـPilot"، و"صالح للبيع".

## Gate 1 — Local Prototype

Required:

- Build ناجح.
- Login/Admin/Employee smoke tests.
- E6C regression checklist.
- 3,000-row performance report.
- حفظ وإضافة وتعديل وحذف وتعارض.
- لا بيانات حقيقية.
- Known Issues محدثة.

Not required yet:

- Warehouse.
- Advanced dashboard.
- Full commercial monitoring.

## Gate 2 — Technical Validation at SEC Environment

Required:

- فتح الموقع من أجهزة الشركة.
- WebSocket/Blazor Interactive Server مستقر.
- Proxy/firewall test.
- Reconnect test.
- Input/copy/paste performance.
- Azure App Service/SQL stability.
- No 500.30 repeated startup failure.
- Synthetic data only.

Decision:

إذا Interactive Server غير مستقر بسبب الشبكة، نقيّم render/data-flow alternative بالقياس، لا نغير stack بالتخمين.

## Gate 3 — Controlled Pilot

Required:

- Roles المطلوبة للـPilot مكتملة.
- BranchManager scope tested if included.
- Reset temporary password process.
- Audit trail للعمليات الحساسة.
- Client/server/database permission tests.
- Automated tests لأهم business rules.
- Backups and restore test.
- Logging, correlation, and error capture.
- 10,000-row decision.
- Import/export if part of pilot workflow.
- Security configuration review.
- User guide and support process.

## Gate 4 — Commercial Release

Required:

- Independent .NET/security review.
- Penetration/security testing appropriate to scope.
- Data protection and customer contracts.
- Per-customer deployment automation or documented process.
- Per-customer backup/restore.
- Versioning and rollback.
- Monitoring and incident response.
- License compliance.
- Capacity/performance targets.
- Known P0/P1 blockers closed or formally accepted with business sign-off.
- Commercial onboarding and offboarding process.

## Work Required Now

1. Build and test documented E6C.
2. Git checkpoint/tag.
3. Start gradual refactor.
4. Resolve long-session fatigue.
5. Decide 10,000-row loading strategy.
6. Complete roles/account operations needed for Pilot.
7. Then import/export and dashboard.

## Work Deferred

- Microservices.
- Shared-database tenancy.
- HR/accounting/fleet.
- AI/GIS/mobile.
- Full warehouse until work-order core passes.

## Simple Example

نجاح تشغيل السيارة داخل الورشة لا يعني أنها جاهزة لنقل ركاب بأجر.  
الـPrototype يثبت أن المحرك يعمل. الـPilot يثبت أنها تعمل على الطريق الحقيقي مع عدد محدود. الإصدار التجاري يحتاج أمانًا وصيانة ونسخًا احتياطية ومسؤولية تشغيل.
