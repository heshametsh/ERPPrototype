# SUPERSEDED DOCUMENT

هذه النسخة محفوظة للتاريخ فقط. استبدلتها النسخة الحالية الموجودة في جذر المشروع، لأنها كانت تشير إلى Syncfusion ونطاق أولي أقدم لا يطابق كود E6C الحالي.

---

# START HERE — Technology Validation & Prototype Build

## Language and communication
- Communicate with me in Arabic, preferably Egyptian Arabic.
- I am not a programmer and I do not know how to write code.
- Explain one step at a time, in clear complete sentences.
- Do not overwhelm me with theory, jargon, or many alternatives.
- Do not agree with me automatically. Tell me the technically correct answer even if it contradicts my preference.
- Never guess. If information is missing and affects architecture, security, implementation, or business rules, ask first.
- Distinguish clearly between confirmed facts, assumptions, engineering judgment, and recommendations.
- Keep the conversation focused on implementation and technology validation only.

---

# Project goal

I want to build a commercial web-based operations/ERP-like product for contracting companies working with Saudi Electricity Company and similar organizations.

The system does not replace SAP or UDS. Employees perform official work in those systems, then update our system so the contractor can track work orders, delays, productivity, financial stages, branches, departments, engineers, and employees in one place instead of fragmented Excel files.

The product may later be sold to multiple contracting companies.

---

# Current deployment decision

For the first commercial versions, each customer company should have:

- A separate application instance.
- A separate database.
- Separate configuration and users.

Do not build shared-database multi-tenancy now.

This is a dedicated-environment / multi-instance model:

Company A → separate app + separate database  
Company B → separate app + separate database

Use the same source code for all customers.

Do not use ABP Framework in the first prototype unless a concrete requirement appears that justifies its complexity.

Do not use Microservices. Use a well-organized Modular Monolith.

---

# Current technology direction

Use this stack for the prototype:

- .NET current LTS version
- Blazor Web App
- ASP.NET Core
- Entity Framework Core
- SQL Server locally
- Azure SQL Database when published
- Azure App Service for hosting
- ASP.NET Core Identity for login, users, roles, and permissions
- Syncfusion Blazor DataGrid under the Community License, provided the license conditions are satisfied

Do not switch technology casually. If you recommend changing any part of this stack, explain:
1. What problem the change solves.
2. The trade-offs.
3. Why the current choice is insufficient.
4. Migration impact.

---

# Highest product priority: Excel-like user experience

The main work-order screen is the most important screen in the product.

Users currently work in Excel and must not feel that the new system is slower or more restrictive.

The grid must aim to provide:

- Direct editing inside the same row and cell.
- No separate edit form for normal daily updates.
- Navigation with arrow keys, Tab, Shift+Tab, Enter, and Shift+Enter.
- Fast cell editing.
- Copy and paste between Excel and the application.
- Multi-row and multi-cell operations where practical.
- Sorting and filtering similar to Excel.
- Column resizing and reordering.
- Frozen important columns.
- Show/hide columns.
- Fast search.
- Fast performance with thousands of rows.
- Server-side loading/filtering where needed.
- Export filtered data to real `.xlsx` files.
- Import from Excel using a controlled template.
- Validation and error preview before importing.
- Protection against duplicate work orders.
- Arabic RTL support.
- Minimal clicks.

Do not assume Syncfusion is sufficient only because the documentation says so. The prototype must test the actual user experience.

If Syncfusion fails the practical Excel-like test, evaluate replacing only the grid component before changing the whole stack.

---

# Uploaded Excel file

I will upload this file to the new chat:

`تقرير اوامر العمل -توصيلات.xlsx`

Treat it as the real reference for the first work-order grid.

First inspect the workbook carefully:
- Sheet names.
- Headers.
- Data types.
- Formulas.
- Dropdown-like values.
- Date columns.
- Status values.
- Financial columns.
- Invalid, missing, or inconsistent values.
- Any negative or misleading calculated durations.
- Duplicate work-order numbers.
- Formatting that carries business meaning.

Do not change the original file.

Use it to build a prototype that resembles the current workflow, not an unrelated generic CRUD screen.

---

# Confirmed business behavior

- The employee edits data directly inside the grid, in the same row.
- The employee does not normally open another page to edit each work order.
- Excel export is essential because other companies and departments may still work using Excel.
- The application should look mainly like Excel, with some dashboards.
- The first important KPIs are:
  - Execution
  - Work-order closure
  - Material issue and return
  - Productivity
- Reports should primarily be Excel because users need filtering and reuse.

---

# General business workflows

## Emergency and maintenance workflow
Saudi Electricity Company notification  
→ contractor executes  
→ estimate of actual works/materials  
→ SEC employee records in SAP  
→ Work Order created  
→ Purchase Order after budget  
→ contractor receives Work Order + PO  
→ invoice preparation  
→ invoice uploaded  
→ intersheet  
→ management approval  
→ finance approval  
→ treasury

Warehouse behavior: issue only.

## Construction / UDS workflow
Work Order assigned in UDS  
→ department registers it  
→ excavation permit when required  
→ execution  
→ inspection basket  
→ estimate adjustment  
→ material issue and return  
→ completion certificate  
→ invoice/claim  
→ upload to UDS  
→ SEC approval  
→ finance  
→ treasury

Departments include:
- New customer connections/meters
- Underground projects
- Overhead projects

The system tracks statuses and stages entered manually from official systems.

---

# Access and permissions direction

Expected roles include:

- Employee: sees and edits only their permitted department/scope.
- Branch manager: sees all branch work orders and KPIs.
- Higher project/company manager: sees all branches.
- Admin: manages users and permissions.

Do not rely only on hiding UI elements. Enforce permissions in backend queries and services.

---

# Prototype objective

Do not start by building the full ERP.

Build a validation prototype that proves:

1. The application opens and works inside the Saudi Electricity Company network.
2. The grid feels close enough to Excel.
3. Editing and saving are fast.
4. Excel import/export works correctly.
5. Permissions can be enforced.
6. The selected Blazor render mode remains stable behind the company proxy/firewall.
7. Azure hosting performs acceptably.

---

# First prototype scope

Build only:

1. A simple login.
2. Two test roles:
   - Employee
   - Branch manager
3. A work-order grid based on the uploaded Excel file.
4. Between 3,000 and 10,000 test rows for performance validation.
5. Direct inline/cell editing.
6. Keyboard navigation.
7. Sorting, searching, and filtering.
8. Frozen columns.
9. Copy/paste with Excel.
10. Export of the current filtered result to `.xlsx`.
11. Controlled Excel import with validation preview.
12. Save changes to SQL Server.
13. A very small dashboard for:
    - Execution
    - Closure
    - Issue/return
    - Productivity
14. Publish to Azure App Service with Azure SQL for testing.

Do not add warehouse, invoices, notifications, full workflows, mobile app, attachments, or advanced dashboards before the grid prototype passes.

---

# Required performance test

Test and document:

- Initial grid load time.
- Search response time.
- Filter response time.
- Cell edit/save response time.
- Scrolling smoothness.
- Memory behavior.
- Performance with 3,000 rows.
- Performance with 10,000 rows.
- Behavior on the Saudi Electricity Company network.
- Stability when the page stays open.
- Reconnection behavior if the network briefly drops.

Do not load all production rows into the browser if server-side paging or virtualization is more appropriate.

---

# Development method

I am a beginner. Work with me using this method:

1. Tell me exactly what we are doing now.
2. Tell me why it is needed in one short explanation.
3. Give me exact clicks, selections, commands, or code.
4. Wait for my result or screenshot before moving forward.
5. When an error appears, diagnose it from the actual message. Do not guess.
6. Keep each change small and testable.
7. Use source control from the beginning.
8. Create a checkpoint/commit after every working milestone.
9. Never replace large working sections without explaining why.
10. Keep an architecture and decision log updated.

Do not tell me to take a six-month programming course. Teach only what is necessary to build and understand this product.

---

# Safety and quality rules

- Never place real company-sensitive data in the prototype.
- Use synthetic or anonymized data during internet-hosted testing.
- Use parameterized queries / Entity Framework safely.
- Validate all input on the server.
- Add audit fields such as CreatedAt, CreatedBy, UpdatedAt, UpdatedBy.
- Protect secrets using configuration and Azure-managed settings, not hard-coded passwords.
- Use database migrations carefully.
- Keep automated backups.
- Before using the system with paying customers or real sensitive data, require an independent review by an experienced .NET/security developer.

AI may generate code, but generated code is not automatically trusted. Test security-critical and data-critical behavior explicitly.

---

# What I want you to do first in the new chat

1. Read this file completely.
2. Inspect the uploaded Excel workbook carefully.
3. Summarize your understanding in a compact implementation brief.
4. Identify only the missing information that blocks the prototype.
5. Then guide me through preparing my Windows computer.
6. Start with installing the minimum required tools.
7. Do not start coding before confirming that the development environment is correctly installed.
8. Do not reopen the already-settled Power Apps vs Blazor debate unless new evidence materially changes the decision.

The first concrete milestone is:

**A locally running Blazor prototype containing an Excel-like Syncfusion work-order grid based on the uploaded workbook.**
