# CURRENT-STATE POINTER - 2026-09-04

This document remains authoritative for its own subject area.

For the latest implementation checkpoint, active issues and execution sequence use `03_CURRENT_IMPLEMENTATION.md`, `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `09_REFACTOR_ROADMAP.md` and `10_RELEASE_READINESS_PLAN.md`.

Only older statements that describe Gate 5A/B10/B11 or Real DB Save as the current next step are historical.

---

# 01 — ERP Prototype Project Context

**Version:** 4.2
**Status:** Approved
**Last update:** 2026-08-30
**Accepted Revo code checkpoint:** `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`
**Owner:** Hesham Omar

## 1. Product Vision

ERP Prototype هو نظام ويب لمقاول كهرباء يعمل مع الشركة السعودية للكهرباء وجهات البنية التحتية المشابهة.

المنتج ليس بديلًا لـSAP ولا هدفه بناء ERP عام ضخم من أول نسخة.

الهدف طويل المدى:

> **موظف الشيت يعمل بسرعة قريبة من Excel، كل الشركة تعتمد على Work Order واحدة موثوقة، كل قسم متخصص يعمل على الجزء الذي يخصه من نفس Work Order، والمدير يرى الاستثناءات والتأخير والقيم والمخاطر بدل البحث في آلاف الصفوف.**

المراحل الطبيعية للمنتج:

1. Master Work Orders Sheet سريع وموثوق.
2. Specialist workflows مرتبطة بنفس Work Order.
3. Manager Control Center.
4. موديولات تشغيلية/تجارية حسب الحاجة الحقيقية.

## 2. Current Technology Direction

- Blazor Web App — Interactive Server.
- ASP.NET Core.
- ASP.NET Core Identity.
- Entity Framework Core.
- SQL Server.
- Modular Monolith.
- `/work-orders` live route: Tabulator 6.5.0 until accepted cutover.
- selected replacement: RevoGrid Community 4.25.2.
- Revo target: Community/public APIs for grid mechanics while ERP owns business semantics.

No Microservices without a proven need.
No full backend rewrite.

### Current Revo checkpoint — 2026-08-30

- stable isolated route: `/work-orders-revogrid-gate5b10`.
- accepted Revo code checkpoint: `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`.
- Gate 5B-7 persistence identity, Gate 5B-8 selection context, Gate 5B-9 Structure Workspace and Gate 5B-10 Header Selection are present.
- Gate 5B-10 provides visible Plain/Ctrl/Shift whole-row/whole-column selection while Revo keeps native active range/focus, keyboard/editing and virtualization ownership.
- Filter removes filtered-out Work Orders from row selection and does not automatically reselect them when the Filter is cleared; Sort preserves identity and Scroll only changes the virtual viewport.
- Gate 5B-9 regression, Gate 5B-10 real-browser acceptance and user manual verification passed.
- the Revo candidate still does not perform real database Save.
- next bounded engineering step is the snapshot-safe Save contract, then real DB Save and end-to-end concurrency/recovery.
- dirty work created before a row becomes filtered-out remains valid dirty work and may still be saved once the Save path is connected.

## 3. Deployment Model

Early commercial deployments remain isolated per customer/company:

```text
Company A → App A + Database A + Users/Secrets/Backups A
Company B → App B + Database B + Users/Secrets/Backups B
```

- same source code.
- separate customer data.
- browser-delivered client experience.
- employee PCs should not require local database/runtime installation.
- offline/field architecture is later and must not be confused with making a Blazor Server circuit “offline”.

## 4. Core Product Structure

```text
Company
  → Branch
      → Departments
          → Master Work Orders / Specialist work
```

Long-term domain direction:

```text
Contract / Project
       ↓
    Work Order
       ↓
Municipality / Site / Execution / Inspection / Documents / Materials / Commercial
```

Exact Contract/Project model will be designed when that phase starts.

## 5. Master Work Order Principle

The Work Order is created first in Master Work Orders Sheet.

That original Work Order is then shared across the branch.

Other departments do **not** create separate copies.

Each specialist module stores its own data linked to the same Work Order.

Canonical rules: `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

## 6. Roles

### `Employee`

Department-scoped employee.

- Master Work Orders employee creates/updates source Work Order.
- specialist employees work inside permitted specialist scope/module.
- exact specialist Identity role names are not frozen yet.

### `BranchManager`

Manager of one branch and all departments.

- sees branch Work Orders.
- owns sensitive operational overrides in branch.
- after downstream interaction, identity corrections/delete require BranchManager.
- BranchManager can reopen a fully closed Work Order.

### `ProjectManager`

Manager of all Branch Managers.

- sees all branches.
- monitors, compares and drills down.
- **read-only on Work Orders.**
- does not perform sensitive Work Order edits/deletes/reopen.

### `Admin`

System/account administration.

Admin operational Work Order rights are not inferred automatically from Admin role; they must be explicit if needed.

## 7. Work Order Identity

Canonical company-wide identity:

```text
WorkOrderNumber + WorkTypeCode
```

- WorkOrderNumber = 9 digits.
- WorkTypeCode = 3 digits.
- globally unique across company/years.

Before another module records real business interaction, Master employee may correct identity/delete an incorrectly entered Work Order.

After real downstream interaction:

- identity correction → BranchManager only.
- delete → BranchManager only.
- ordinary allowed operational fields remain editable by Master employee.

Visibility in another module alone does not count as interaction.

## 8. Work Year

- Assignment Date can move the Work Order to another year.
- cross-year change requires user confirmation.
- server remains authoritative for final move.

## 9. Financial Model

Stored business inputs:

- Work Order Value.
- Partial Amount / one-time Partial Invoice amount.

Derived:

```text
Final Invoice Amount = Work Order Value - Partial Invoice Amount
```

Current UI name remains `Remaining Amount`.

Business semantics:

- Partial Invoice is optional and occurs once.
- threshold eligibility may differ by region/contract; do not hard-code one universal value.
- if no Partial, Final = full Work Order Value.
- Final/Remaining does not become zero after final invoice approval.
- Partial and Final remain visible as historical values.
- Final/Remaining is not a receivables balance.

## 10. Basket and Lifecycle

Basket is the main/general/official stage.

It should reflect Saudi Electricity process, but remain flexible.

Expected process order can exist, but real specialist work may progress while another formal step is delayed.

ERP should record/surface exceptions rather than blindly block legitimate work.

Detailed specialist states belong in specialist workflows, not dozens of Master Baskets.

## 11. Closure

`انتهاء أمر العمل` means complete operationally **and** financially.

Reopen:

- BranchManager only.
- durable business history required.
- ProjectManager remains read-only.

## 12. Validation

Approved soft working-sheet validation:

- invalid value stays visible.
- error is clearly marked.
- employee may continue working.
- Save is blocked until corrected.
- same principle for manual edit, Paste, bulk operations and Range Clear.
- Partial = 0 normalizes to blank/null, not an error.

Server/database remain authoritative.

## 13. Grid Product Principles

- Keyboard first.
- minimum clicks.
- inline editing.
- Excel-compatible Copy/Paste.
- selection/range behavior.
- one logical History action for one user operation.
- Paste at end of sheet uses only available rows.
- Undo/Redo separate from business audit.
- frozen visual dimensions remain controlled by Grid behavior document.

Tabulator is a behavior reference during migration, not long-term architecture authority.

## 14. Near-Term Scope

Finish Revo production foundation:

- ✅ unified validation.
- ✅ client persistence-identity foundation (`ClientKey` / `Id` / `RowVersion`) through row History.
- ✅ selection-context and Structure Workspace foundation through Gate 5B-9.
- clean Ctrl/Shift row/column selection and Filter-pruning behavior without replacing Revo native cell-range/focus ownership.
- snapshot-safe Save.
- real DB Save + server failure mapping.
- concurrency/recovery.
- database-connected custom columns/layout acceptance.
- important employee productivity parity.
- self-hosted/pinned Revo assets.
- 10k/browser qualification.
- controlled cutover.

Then move product investment toward operational lifecycle, manager control and specialist workflows.

## 15. Long-Term High-Value Modules

Likely order, subject to operation study:

- Contract/Project light model.
- operational ownership/due/blocker/activity.
- manager alerts/control center.
- Municipality/excavation permit lifecycle.
- Site/GIS basics.
- Execution.
- Inspection/Quality.
- Documents/Photos.
- HSE where required.
- Materials.
- completion/payment certificates and commercial control.
- subcontractors/cost/profitability where justified.
- field/mobile/offline after workflows stabilize.

## 16. Explicit Non-Goals for Now

Do not build merely because a generic ERP has it:

- full accounting.
- HR/payroll.
- generic CRM.
- generic workflow designer.
- formula engine in Work Orders.
- microservices.
- huge warehouse suite.
- advanced offline architecture before stable workflows.
- 100-column Master Work Order sheet.

## 17. Success Principle

A feature is valuable when it helps one of these:

1. employee works faster/safer.
2. Work Order becomes more trustworthy.
3. specialist can do real work without duplicating data.
4. manager can identify where intervention is required.
5. company can reconstruct important history.

If a feature only makes Grid more impressive without improving one of those, it is low priority.
