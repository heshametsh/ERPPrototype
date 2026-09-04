# CURRENT-STATE POINTER - 2026-09-04

This document remains useful for its subject/history. For current implementation, active issues and roadmap use `03_CURRENT_IMPLEMENTATION.md`, `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `09_REFACTOR_ROADMAP.md` and `10_RELEASE_READINESS_PLAN.md`.

Older statements in this document that describe Gate 5A/B10/B11 or Real DB Save as the current next step are historical.

---

# 46 — Final Lead Review and Long-Term Product Direction — 2026-08-26

## Post-review execution status — updated 2026-08-30

This review remains evidence for baseline `a74c9c9`; do not rewrite its findings as if they were produced against later code.

Post-review implementation has advanced through Gate 5B-10; accepted Revo code checkpoint is `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`:

- Gate 5B-6 Unified Validation remains accepted.
- Gate 5B-7 adds client persistence identity (`ClientKey` / `Id` / `RowVersion`) through structural History.
- Gate 5B-8 adds selection-context/right-click semantics.
- Gate 5B-9 adds the shared Structure Workspace, filtered displayed-row delete scope, Custom Column structural History, RTL insertion handling and clipboard range fill.
- Gate 5B-10 adds accepted Plain/Ctrl/Shift whole-row/whole-column selection, Filter-pruning, Sort identity preservation, virtualization-safe visual selection, right-click preservation and dataset-switch clearing while Revo keeps native cell range/focus ownership.
- Gate 5B-9 + Gate 5B-10 real-browser regressions and user manual B10 verification passed.
- the Revo route still has no production DB Save/cutover.
- the next bounded mission is snapshot-safe Save, then real DB Save and concurrency/recovery.

The strategic findings below remain tied to the original `a74c9c9` review baseline.

---


**Status:** Current strategic synthesis
**Baseline reviewed:** `a74c9c908a2372b0e9141dcf7f6ef772bd6c07b3`
**Inputs:** 14 independent reviews: UX, business logic, Saudi market fit, product strategy, architecture, shared infrastructure, data integrity, grid technology, Revo migration, performance, security, testing, maintainability, deployment/operations.
**Important:** this document is a synthesis and roadmap. It does not claim every approved target behavior is implemented today.

---

# 1. Executive Conclusion

ERP Prototype has a strong technical foundation for its stage.

Strongest assets:

- SQL Server + EF Core persistence.
- explicit transactions.
- optimistic concurrency using `RowVersion`.
- server-side scope/authorization checks.
- global Work Order identity.
- mature spreadsheet-style employee workflow.
- a RevoGrid migration foundation that is structurally cleaner than continuing to extend the old Tabulator integration.

The main product gap is not “the grid is missing more Excel features”.

The main gap is:

> The system is already good at storing and editing Work Orders, but it is not yet strong enough at managing the operational life of those Work Orders across the company.

Long-term target:

> **Fast employee sheet + one shared Work Order + specialist workflows + management control center.**

---

# 2. What the Product Should Become

Do not turn the product into:

- a generic ERP with every module.
- a giant spreadsheet with 100 columns.
- a copy of SAP.
- a workflow engine that blocks real contractor work whenever the ideal sequence is not followed.

Build an **operating system for an electrical contractor**.

## 2.1 Employee — Fast Master Sheet

Employee needs:

- thousands of rows.
- keyboard-first behavior.
- Excel-compatible paste.
- fast filters/search.
- Undo/Redo.
- clear validation.
- explicit Save.
- reliable concurrency.

RevoGrid is the platform for this experience.

## 2.2 Specialist — Work Order Workflow

Each specialist area works on the same Work Order:

```text
Municipality
Execution
Inspection
Engineering
Materials
Commercial
Documents
...
```

The specialist sees the data needed for his work and adds specialist history/data.

The Master Sheet does not need to expose every specialist detail.

## 2.3 Management — Control Center

Managers should not inspect 10,000 rows to understand the business.

The system should eventually answer:

- what changed today?
- what is late?
- what requires intervention?
- what financial value is exposed?
- which branch/department is building backlog?
- which permits are near expiry?
- which Work Orders are in unusual process combinations?

---

# 3. Tabulator's Remaining Role

Tabulator is not the long-term architecture.

Its remaining value is as a **behavior reference**.

For every existing feature:

1. identify the useful employee behavior.
2. compare it with Revo's current behavior.
3. use Revo Community native mechanics where they are better.
4. preserve ERP-specific semantics where our implementation is better.
5. do not copy Tabulator internals/workarounds without a reproduced Revo need.

Examples:

- preserve one-action Paste and Undo/Redo semantics.
- preserve validation behavior.
- preserve custom column/layout product capability.
- preserve search/KPI/selection productivity where useful.
- do not preserve Tabulator's fragmented ownership just to obtain parity.

---

# 4. RevoGrid Decision

RevoGrid Community remains the correct replacement direction.

The current Revo foundation already has a cleaner model around:

```text
Change Engine
Sheet History
Dirty State
Paste
Range Clear
Insert/Delete
Filter/Sort
Stable client identity
Derived financial synchronization
```

Target architecture:

> **Revo owns grid mechanics. ERP owns business meaning. A narrow adapter owns unavoidable Revo-specific integration.**

Revo should own where possible:

- virtualization.
- range geometry.
- focus/navigation.
- clipboard mechanics.
- column sizing/movement.
- rendering mechanics.
- filter/sort mechanics where public APIs support the product behavior.

ERP should own:

- business validation.
- financial semantics.
- dirty state / save snapshot.
- History meaning as ERP logical operations.
- permissions.
- RowVersion integration.
- business audit.
- specialist workflows.
- manager rules.

Do not buy Revo Pro as the architecture solution. Public Pro ideas may be used only as UX/architecture inspiration and reimplemented with our own code/Community APIs when valuable.

---

# 5. Revo Production Roadmap

The current isolated Revo route is not ready to replace `/work-orders` yet. The important remaining boundary is persistence, validation and recovery, not another cosmetic Grid feature.

## Stage R1 — Unified Validation

One coherent validation model for:

- manual edit.
- Paste.
- Range Clear.
- Undo/Redo resulting state.
- required fields.
- identity.
- Basket.
- date.
- financial fields.
- custom fields.

Invalid values remain visible; Save is blocked.

## Stage R2 — Persistence Identity

Standardize:

- `Id`.
- `ClientKey`.
- `RowVersion`.
- `WorkYear`.
- `DisplayOrder`.
- custom values.
- changed fields/deleted state.

## Stage R3 — Save Contract

Snapshot-safe Save handshake:

```text
begin Save
→ snapshot the exact change generation
→ server Save
→ accept only what succeeded
→ edits made while Save is running remain dirty
→ rejection does not falsely mark work clean
```

## Stage R4 — Real DB Save

- Add.
- Update.
- Delete.
- server validation.
- duplicate detection.
- scope validation.
- transaction result.

## Stage R5 — Concurrency and Recovery

- stale `RowVersion`.
- another user changing the same row.
- deleted-on-server cases.
- lost response after database commit.
- reconnect/retry behavior.
- dirty navigation/reload protection.

## Stage R6 — Business/Workspace Parity

Bring only valuable production capabilities:

- custom columns.
- width/visibility/layout persistence.
- quick Work Order search.
- KPI/basket summaries.
- selection totals.
- year move confirmation.
- production messages/command surface.

## Stage R7 — Production Qualification

- self-host/pin Revo assets.
- real browser acceptance.
- browser diagnostics fail tests.
- exact row identity assertions.
- target Chrome/Edge.
- 10k qualification.
- reconnect/failure journeys.
- side-by-side acceptance.
- rollback checkpoint.

## Stage R8 — Cutover

Only after acceptance:

- route `/work-orders` moves to Revo.
- Tabulator remains rollback during the accepted cutover window.
- later remove obsolete Tabulator runtime in a separate cleanup checkpoint.

After this point, Grid engineering should stop being the center of the product roadmap.

---

# 6. Architecture for the Long Term

Most important architecture rule after Revo:

> Work Order is the shared business reference; WorkOrderService must not become the implementation home of every future ERP module.

Preferred shape:

```text
                    Work Order
                        |
      +-----------------+------------------+
      |                 |                  |
 Municipality        Execution         Inspection
      |                 |                  |
      +---------- specialist records ------+
                        |
               Activity / Audit
```

Future modules should be coherent modules linked to WorkOrder:

- Municipality permit/case.
- Site/GIS.
- Execution activity.
- Inspection/quality.
- Documents.
- Materials.
- Commercial/invoice/certificate.
- subcontractors if/when needed.

Do not represent all of those as Custom Columns.

---

# 7. Operational Foundation After Revo

Highest-value product step after cutover is the minimum data that allows the ERP to understand work, time, responsibility and delay:

```text
Responsible / Owner
Stage Entered At
Next Action
Due Date
Blocker / Delay Reason
Business Activity Timeline
```

Today:

```text
Basket = Engineering
```

tells us where the Work Order is.

A stronger ERP should tell us:

```text
Engineering
Entered: 12 days ago
Owner: Team A
Next Action: approval
Due: yesterday
Blocker: missing document
```

Then management can act.

---

# 8. Business Lifecycle Decisions Now Closed

The independent reviews surfaced questions that previously looked open. They are now resolved in `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

Key decisions:

- Partial Invoice happens once only.
- Final Invoice = Work Order Value - Partial.
- Final/Remaining does not become zero after final invoice approval.
- `انتهاء أمر العمل` means operational + financial closure.
- Reopen after closure is BranchManager-only.
- Work Order identity may be corrected by employee before downstream interaction.
- after real downstream interaction, identity changes and delete are BranchManager-only.
- ProjectManager is manager of Branch Managers but Work Orders are read-only for him.
- visibility in another module does not count as interaction; a real saved business action does.
- Basket reflects the main/official stage but does not rigidly block practical parallel progress.
- Master Sheet remains the source Work Order and specialist departments work on the same record.

These should no longer be raised as unresolved questions.

---

# 9. Management Model

## Branch Manager

Scope:

```text
one branch
all departments in the branch
```

Needs:

- full branch visibility.
- branch exceptions.
- sensitive override actions.
- reopen.
- downstream identity correction/delete authority.
- business history.

## Project Manager

Scope:

```text
all Branch Managers
all branches
```

Needs:

- read-only overview.
- comparison.
- KPIs.
- risks.
- drill-down.
- trends.
- accountability.

Project Manager is **not** an operational edit super-user.

---

# 10. Saudi Electrical Contractor Product Roadmap

The market/product reviews support this direction, but implementation must be phased.

## Phase P1 — Foundation

- Contract / Project light model.
- operational lifecycle fields.
- business history.
- manager scope/overview.
- alert/aging foundation.

## Phase P2 — Highest-value specialist modules

### Municipality / Excavation

Track, when applicable:

- requirement.
- request/submission.
- license.
- expiry.
- status/rejection/resubmission.
- completion/clearance.

### Site / GIS

Start light:

- location.
- coordinates.
- address.
- route/shape attachment/reference.
- map view when useful.

Do not build a GIS platform from scratch.

### Execution

- actual start.
- responsible crew.
- progress.
- blocker.
- completion.
- lightweight daily evidence.

### Inspection / Quality

- inspection result.
- remarks.
- rework.
- reinspection.
- closure.

### Documents / Photos

One evidence model tied to WorkOrder and specialist records.

## Phase P3 — Field and Safety

- HSE / Permit to Work where required.
- observations/incidents.
- field evidence.
- mobile/offline only when the operational workflow is stable enough to justify it.

## Phase P4 — Materials and Commercial

- issue/return/consumption.
- completion certificates.
- payment certificates.
- richer Partial/Final invoice records when needed.
- retention.
- variations.
- subcontractor records.
- cost/profitability.

Do not build full accounting or full warehouse prematurely.

---

# 11. Manager Alerts — Target Direction

The management UI should not be a wall of charts.

High-value signals include:

```text
15 Work Orders assigned to Meters today.
10 sites are overdue.
3 municipality permits expire soon.
One new high-value Work Order entered the branch.
Inspection backlog increased.
A Work Order started Modify Estimate while still officially waiting for Inspection.
```

Each alert should drill down to underlying Work Orders.

Alert thresholds must come from real operational rules, not invented KPI thresholds.

---

# 12. Performance and Scale

Current architecture loads the selected Department/Year dataset into the browser/client session.

That is not a reason to redesign now.

Policy:

- 10k: prove on target browser/hardware.
- 50k: benchmark before architecture commitment.
- 100k single sheet / many concurrent users: likely requires server-backed/windowed data.

That would change **how the Grid receives data**, not require rewriting the ERP backend.

Avoid premature server paging simply because 100k is theoretically possible.

---

# 13. Expansion Constraints to Remove

Before serious multi-user/multi-branch expansion:

- remove assumptions that only one Employee can exist per Department.
- remove brittle assumptions that only current four department types can ever exist.
- make role/scope resolution reusable and authoritative on server.
- keep ProjectManager read-only globally and BranchManager authoritative within his branch.
- specialist permissions should be capability/scope based rather than copied UI assumptions.

---

# 14. Durable Audit

Future ERP needs two histories.

## Session History

Undo/Redo.

## Business History

Durable server-side events.

Sensitive events include:

- identity corrections after downstream use.
- manager-authorized delete.
- closure/reopen.
- important specialist transitions.
- important financial corrections.
- later approvals where relevant.

Do not reuse Undo/Redo as audit.

---

# 15. Security and Reliability Priorities

The 14-review exercise identified production-hardening items to verify/close:

- custom column/header user text must be rendered as text, never trusted HTML.
- initial Admin seeding must not silently reverse an intentional account disable.
- privileged actions should use fresh server authorization.
- Save must have deterministic result/recovery semantics.
- overall PASS must include active Revo candidate gates.
- real-browser diagnostics must fail acceptance on critical browser/network errors.
- structural browser tests should assert exact row identities, not only counts.

These are hardening items, not reasons to abandon the architecture.

---

# 16. What We Should Not Build Now

Do not spend the next roadmap cycle on:

- generic workflow designer.
- formula engine.
- smart autofill.
- multi-range spreadsheet complexity.
- pivot inside employee sheet.
- microservices.
- generic repository layer over EF.
- broad backend rewrite.
- full accounting.
- HR/payroll.
- CRM.
- huge warehouse module.
- deep offline architecture before workflows stabilize.
- a second giant Grid abstraction that recreates Revo itself.

---

# 17. Three-Year Product Direction

## Horizon 1 — Finish the Core

Goal:

> one production Revo Work Orders experience that is safe, fast and maintainable.

Deliver:

- validation.
- Save.
- RowVersion.
- concurrency.
- custom columns/layout.
- KPI/search.
- production qualification.
- cutover.

## Horizon 2 — Become an Operational ERP

Goal:

> the system knows what needs action, not just what value is in each row.

Deliver:

- Contract/Project.
- responsibility.
- due dates.
- blockers.
- lifecycle events.
- manager control center.
- Municipality.
- Site/GIS.
- Execution.
- Inspection.
- Documents.

## Horizon 3 — Become a Contractor Management Platform

Goal:

> connect operational execution to commercial and resource control.

Deliver as justified:

- materials.
- commercial certificates/invoices.
- subcontractors.
- cost/profitability.
- HSE.
- field/mobile/offline.
- deeper analytics/integration.

---

# 18. Product North Star

> **The employee should work as fast as Excel, the company should keep one trustworthy Work Order, specialists should work on their own part of that Work Order, and managers should see exceptions and decisions instead of searching rows.**

Any future feature should be tested against this sentence.

If it makes the sheet slower without meaningful business control, reject it.

If it duplicates Work Order data across departments, redesign it.

If it turns specialist details into dozens of Master Sheet columns, redesign it.

If it gives management actionable visibility from data we already collect, it is high value.

---

# 19. Immediate Next Direction

```text
Revo Unified Validation
        ↓
Persistence identity / RowVersion
        ↓
Snapshot-safe Save
        ↓
Real DB Save
        ↓
Concurrency / failure recovery
        ↓
remaining high-value parity
        ↓
Cutover
```

Only after this should the product roadmap shift strongly toward Operational Foundation and management/specialist modules.
