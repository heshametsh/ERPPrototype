# ACCEPTED DECISIONS - B11 THROUGH GATE 5C-1

## DEC-066 - Gate 5C-1 visible aggregates use the current visible Revo snapshot

- **Status:** Accepted.
- aggregates use current visible Revo rows;
- core Money and Custom Money participate;
- Filter working-snapshot semantics remain unchanged until explicit Apply/Clear.

## DEC-065 - Gate 5B-12 reuses the existing service/SQL persistence path

- **Status:** Accepted.
- no second Save engine;
- B11 snapshot capture remains the Save foundation;
- Add/Update/Delete use the existing `WorkOrderService` and SQL path;
- results reconcile by `ClientKey`;
- stale `RowVersion` rejects transactionally while newer employee work remains Dirty.

## DEC-064 - Selection Core V4R3 preserves Revo native ownership

- **Status:** Accepted.
- row identity uses `ClientKey`;
- column identity uses `prop`;
- Revo retains native focus/range/editing ownership;
- Filter, Sort, Scroll and right-click preserve semantic selection identity.

## DEC-063 - Gate 5B-11 snapshot-safe Save is the persistence handshake foundation

- **Status:** Accepted.
- Save captures one generation;
- accepted results advance only that Baseline;
- newer edits remain Dirty;
- failed Save preserves Baseline, Dirty and History.

---

# CURRENT GRID DECISION OVERRIDE - 2026-09-04

## DEC-062 - Retire root Gate/Lab manifests only after preserving durable engineering history

- **Status:** Accepted documentation/cleanup rule.
- the root Gate 5A-5B manifest and lab README files are historical evidence, not runtime dependencies or current architecture contracts.
- before retirement, durable problem symptoms, root causes, fixes and regression clues are preserved in `51_REVO_GATE_BUG_HISTORY_2026-09-04.md`.
- current implementation, regression, roadmap and release documents receive newer overrides so old "future" statements do not incorrectly reopen already accepted B12/5C-1 work.
- exact original manifest contents, old baseline commits, touched-file lists and historical test counts remain recoverable from Git history.
- cleanup must not delete the root evidence files until the preservation documentation is reviewed and committed.

---

# CURRENT GRID DECISION OVERRIDE — 2026-08-30

## DEC-061 — Gate 5B-10 Header Selection is accepted without replacing Revo native selection ownership

- **Status:** Accepted / Implemented at Revo code checkpoint `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`.
- Gate 5B-10 provides Plain/Ctrl/Shift whole-row and whole-column selection.
- row semantic identity is `ClientKey`; column semantic identity is `prop`.
- the ERP extension is registered through Revo `grid.plugins` and uses Revo event/render boundaries instead of patching Revo source.
- the active contiguous row/column portion remains represented through Revo public `setCellsFocus(...)`; ERP state carries only the semantic whole-row/whole-column identities needed for product behavior.
- selected visuals are emitted through Revo render properties so virtualization recreates them correctly.
- column refresh uses public `updateColumns(...)`; reassigning the full `grid.columns` collection merely to repaint is rejected because it can break RTL logical/display ordering.
- Filter prunes hidden row identities; Sort and Scroll preserve identity selection; year/dataset switch clears selection.
- right-click inside selection preserves it and existing B9 command targeting remains regression-protected.
- acceptance evidence: Build PASS, Gate 5B-9 real-browser PASS, Gate 5B-10 scenarios 01-09 PASS, and user manual browser verification PASS on 2026-08-30.
- disjoint Ctrl multi-cell ranges remain postponed.

## DEC-060 — B10 selection extension must preserve Revo as native selection owner

- **Status:** Accepted / Implemented by Gate 5B-10.
- Gate 5B-10 is accepted at `86eb2ff3ce51addc2046133c820dd5dc75bfd08f`; rejected earlier B10 experiments are not part of the accepted implementation.
- Revo owns native active cell/range, focus, keyboard editing/navigation and virtualization.
- ERP may add only the missing semantic Ctrl/Shift selection for whole rows/columns, keyed by stable row `ClientKey` and column `prop`.
- do not build a parallel full selection engine, clear Revo focus to manufacture selection, or use a DOM-scanning painter that fights virtualization.
- right-click commands consume a combined selection snapshot but do not become another selection owner.
- disjoint Ctrl multi-cell ranges are postponed until complete Copy/Paste/Delete/Undo semantics are explicitly designed and tested.
- tests must prove employee-visible rendered selection, including after virtualization scroll; internal store assertions are supplemental.

## DEC-059 — Filter removes hidden rows from future row-selection scope

- **Status:** Accepted / Implemented by Gate 5B-10.
- Filter is the operation that changes the employee's current row result for this rule.
- when a selected Work Order is filtered out, it leaves row selection immediately.
- clearing the Filter does not automatically restore that old selection.
- Scroll does not prune selection; it only changes the virtual viewport.
- Sort preserves selection by stable Work Order identity.
- every new sheet mutation that resolves row/cell targets must intersect its final target with the current filtered result as a safety check.
- a dirty change made while the row was visible remains a legitimate pending change and may be saved if a later Filter hides the row.
- Undo/Redo continues the earlier logical History operation and is not redefined as a new hidden-row command.

## DEC-058 — Gate 5B-9 Structure Workspace is the stable Revo checkpoint

- **Status:** Accepted / Checkpointed at `202cf3f`.
- one neutral context menu contains Rows/Columns structural commands; Copy/Paste/Clear are not duplicated there.
- Insert Rows/Columns uses explicit count and direction; selection size does not multiply insert count.
- row deletion from whole-column selection is constrained to displayed/current filtered rows.
- Custom Column Insert/Delete uses one Sheet History transaction; core columns remain protected.
- visual RTL Left/Right insertion is translated to logical order and adjacent Custom Column layout can rebalance safely.
- right-click inside current selected columns/range preserves selection; outside targets clicked column.
- clipboard single-cell paste can fill selected range as one logical operation.
- real DB Save is still intentionally absent from this isolated route.

## DEC-057 — Gate 5B-8 Selection Context preserves selection meaning for commands

- **Status:** Accepted / Included in stable `202cf3f`.
- right-click inside an existing range/whole-column selection is context only and must not collapse it to the pointer cell.
- right-click outside the current selection may target the clicked location.
- whole-column intent is a column selection meaning, not automatic permission to act on all source rows.
- year/dataset switch clears selection.

## DEC-056 — Gate 5B-7 Persistence Identity preserves persisted row identity through History

- **Status:** Accepted / Included in stable `202cf3f`.
- browser rows use stable `ClientKey`; persisted rows retain database `Id` and `RowVersion`.
- persisted row delete records carry exact `Id` + `RowVersion`; Undo/Redo does not lose or invent identity.
- deleting a temporary unsaved row does not create a database-delete record.
- persisted rows missing `RowVersion` fail the persistence-identity contract.
- this is preparation for Save; it does not mean the Revo route already performs production DB Save.

---

# CURRENT ENGINEERING OVERRIDE — 2026-08-26

## DEC-055 — Native V1 is historical, not the active daily engineering workflow

- **Status:** Accepted / Supersedes the active-workflow status of DEC-041/DEC-042.
- Native V1 receipts/prompts/tools may remain for historical evidence, but they are not mandatory gates for current ERP development.
- engineering judgment stays with the Main AI/engineer reviewing the real repository.
- local scripts/Git/Build/tests/browser automation are execution and evidence tools, not local intelligence.
- important changes are reviewed/tested at stable candidate boundaries; automated browser evidence plus user manual acceptance is required for important employee-visible Grid behavior.
- old Native V1 decisions below remain historical records and must not be interpreted as the current operating workflow.

## DEC-054 — Revo Gate 5B-6 Unified Validation accepted

- **Status:** Accepted / Implemented at `6a6f3ce`.
- invalid values remain in the sheet and are visibly marked; Save eligibility is blocked until errors are corrected.
- Manual Edit, Paste, Range Clear and Undo/Redo resulting state feed one validation owner without forcing all mutation types through one giant mutation gateway.
- row structure and History retain their own owners.
- validation is incremental for changed/identity-related rows; duplicate identity updates both affected rows.
- Revo cell properties render validation state instead of scroll-time DOM scanning in Gate 5B-6.
- acceptance included self-tests, hardened real-browser validation assertions, full existing Grid regression, and user manual browser verification.
- next Revo foundation step is persistence identity/`RowVersion`, then snapshot-safe Save and real DB Save.

---

# BUSINESS / PRODUCT DECISION OVERRIDE — 2026-08-26

## DEC-053 — ProjectManager is global operational visibility, not a Work Order editor

- **Status:** Accepted
- `ProjectManager` is manager of Branch Managers and sees all branches needed for oversight.
- Work Orders are **read-only** for ProjectManager.
- ProjectManager does not perform BranchManager-sensitive identity changes, delete or Reopen.
- BranchManager remains operational authority for exceptions inside his branch.

## DEC-052 — Downstream interaction, not visibility, protects Work Order identity/delete

- **Status:** Accepted
- Work Order merely appearing in another department/module queue does **not** count as interaction.
- Interaction begins when another module records a real business action/record linked to Work Order.
- Before interaction, Master employee may correct `WorkOrderNumber`, `WorkTypeCode`, or delete an incorrectly entered Work Order.
- After interaction, those sensitive operations become BranchManager-only.
- other allowed Master fields remain editable by employee.

## DEC-051 — Master Work Orders creates shared Work Order; specialist departments extend same record

- **Status:** Accepted
- Master Work Orders employee is first ERP entry point.
- Work Order then moves through branch.
- specialist departments do not create duplicate Work Orders.
- each specialist module stores its own work linked to same Work Order.
- specialist details must not automatically become more Main Basket states or dozens of Master Sheet columns.

## DEC-050 — Basket follows expected SEC process but remains operationally flexible

- **Status:** Accepted
- Basket represents main/general/official stage.
- expected order is guidance, not rigid State Machine that stops real work.
- specialist work may progress while another formal step is delayed.
- future management logic may surface exceptions/warnings instead of preventing legitimate parallel progress.

## DEC-049 — Work Order closure is operational + financial; Reopen is BranchManager-only

- **Status:** Accepted
- `انتهاء أمر العمل` means fully complete operationally and financially, including final invoice closure.
- ordinary employees cannot reopen.
- BranchManager may Reopen inside his branch.
- ProjectManager remains read-only.
- Reopen must create durable Business History.

## DEC-048 — Partial Invoice is one-time; Remaining represents Final Invoice amount

- **Status:** Accepted
- invoice types in current model: Partial and Final.
- Partial Invoice is optional and occurs once only.
- eligibility threshold can vary by region/contract and is not frozen as one global constant.
- `Final Invoice Amount = Work Order Value - Partial Invoice Amount`.
- if no Partial exists, Final = Work Order Value.
- current `Remaining Amount` is the derived final portion and does not become zero after final invoice approval.
- Partial and Final values remain historically visible.

## DEC-047 — Sensitive identity/delete actions require durable trace after downstream use

- **Status:** Accepted
- after downstream interaction, manager-authorized identity correction/delete must not erase the fact/history of what happened.
- client Undo/Redo is not sufficient Business Audit.
- exact technical persistence approach for archive/tombstone/audit is deferred until implementation.

## DEC-046 — Cross-year AssignmentDate change requires confirmation

- **Status:** Accepted
- changing Assignment Date to another year requires user confirmation before Work Order is moved.
- after confirmation, server Save remains authoritative.
- supersedes older documentation that left automatic move vs confirmation open.

---

# NATIVE V1 AI-ENGINEERING DECISION OVERRIDE — 2026-08-24

## DEC-042 — Native V1.1 records every completed real mission

- **Status:** Accepted / Implemented
- **Decision:** Every completed real Native mission writes one lightweight receipt, whether it produces a Candidate or is diagnostic/read-only. The receipt adds `receiptVersion: "1.1"`, mission identity/type, final state, result, and the exact supplied `participants[]`; Candidate fields remain nullable when no Candidate exists.
- **Participation rule:** `participants[]` contains only roles that actually participated: `MAIN`, `REVIEWER`, or optional `SPECIALIST`. No reviewer or specialist is inferred from availability or recommendation.
- **Telemetry rule:** Requested/actual model, session/thread, tokens, cached tokens, tool calls, and elapsed time are stored only when supplied by the Native session; unavailable values remain `null`.
- **Compatibility rule:** Existing V1 Candidate receipts remain readable, and the existing `reviews[]` semantics remain unchanged.
- **Outcome rule:** `CONFIRMED_DIAGNOSIS` and `REJECTED_DIAGNOSIS` are append-only factual events. Receipt completion never classifies a diagnosis automatically.
- **Architecture boundary:** This is a compatible evolution of `NativeV1Receipt.psm1`; it adds no router, reviewer transport, collector, database, dashboard, learning engine, or automatic learning.

## DEC-041 — Freeze the Native V1 engineering surface

- **Status:** Accepted / Architecture V1 frozen
- **Decision:** The active AI-engineering surface is limited to `AGENTS.md`, this Decisions Log, one neutral Native reviewer contract, a minimal Git-visible-state fingerprint, a tiny Candidate Receipt writer/storage, and passive Native telemetry only when the Native session actually exposes it.
- **Archive:** Project Brain/legacy qualification, the revisioned Review Record, the old reviewer-findings schema, routing, Lead, CLI child-reviewer, sandbox/transport, evidence-pack, collector, learning-engine, database, dashboard, and replacement-framework material is historical under `Documentation/Archive/AI-Team-V3/`.
- **Candidate Receipt:** The learning unit contains `receiptId`, `mission`, `baseSha`, `candidateSha`, `changeType`, `risk`, `mainDecision`, and `reviews[]`; missing telemetry is `null`. Later events are factual `CONFIRMED_FINDING`, `REJECTED_FINDING`, `KNOWN_DEFECT`, and `REQUIREMENT_CHANGED` records.
- **Rule:** Local code stores supplied observations and fingerprints Git-visible state only. It does not route, select reviewers, classify findings, accept candidates, or make engineering judgments.
- **Reason:** Architecture V1 is frozen; retaining unused orchestration would preserve complexity and create a second architecture by compatibility.

## DEC-043 — Native V1.2 auditable lifecycle and bounded review workflow

- **Status:** Accepted / Implemented
- **Decision:** Evolve the same `NativeV1Receipt.psm1` into a backward-readable V1.2 receipt with factual wall-clock timing, concise material `decisionTrace[]`, explicit lifecycle events (`USER_ACCEPTED`, `PUSH_COMPLETED`, `MISSION_COMPLETED`), and optional supplied failure classification context.
- **Gate rule:** Main supplies whether review or manual acceptance is required. A required review is satisfied only by one valid `native-reviewer-v1` result recorded with `NATIVE_SUBAGENT`; CLI/child/ephemeral/sandbox/archived transports are rejected and cannot satisfy finalization. A sufficient `NO_FINDINGS_EVIDENCE_SUFFICIENT` result does not automatically trigger another reviewer.
- **Lifecycle rule:** `USER_ACCEPTED` is never inferred. `PUSH_COMPLETED` is recorded only when local Git HEAD factually matches `candidateSha`. `MISSION_COMPLETED` advances the receipt only after all supplied required gates are present and records `completedAt`/`durationSeconds`.
- **Test rule:** Prefer closest deterministic tests during implementation, targeted tests after behavior stabilizes, and one justified full regression after Candidate/reviewer corrections. Do not weaken tests or create a reviewer/router/transport/harness service to save time.
- **Compatibility rule:** Existing V1/V1.1 receipts remain readable; existing participant/review telemetry remains nullable and is never fabricated.
- **Architecture boundary:** No ERP product/runtime, database, service, dashboard, orchestration framework, or archived AI-Team V3 code is changed or revived.

---

# GRID ENGINE DECISION OVERRIDE — 2026-08-20

> هذا القرار أحدث من قرار “keep Tabulator” في 2026-08-17 ومن `DEC-004` كاتجاه مستقبلي. Tabulator يظل **current runtime only** إلى أن ينجح cutover.

1. **No ERP rewrite:** نحتفظ بـASP.NET Core + Blazor Server + EF Core + SQL Server + Identity + Modular Monolith.
2. **Approved grid-engine exception:** RevoGrid Community **4.25.2** هو Work Orders replacement target.
3. **Current runtime remains safe:** `/work-orders` ما زال Tabulator 6.5.0 حتى Gate 5A/5B/5C.
4. **Version rule:** exact `4.25.2`, never `latest` in the application.
5. **Deployment/license rule:** self-host the package and retain its MIT license before cutover; Community features used by the project must remain within the MIT package.
6. **Migration rule:** port product behavior, not Tabulator internals/hacks.
7. **Univer decision:** no longer a finalist; native end-of-sheet Paste expanded the sheet instead of truncating to available rows.
8. **Paste rule:** clipboard overflow at the end of the sheet is clipped to available rows; the grid must not add rows automatically.
9. **Current task:** isolated Blazor/RevoGrid real-data integration, then real Save/Delta, then visual/regression cutover.
10. **Rollback:** Tabulator remains the current implementation and rollback point until the RevoGrid cutover checkpoint is accepted.

---


## Technology-history navigation

لرؤية التسلسل الكامل من **Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid** مع سبب كل انتقال والـEvidence المتاح، راجع `13_TECHNOLOGY_EVOLUTION.md`.

هذه الوثيقة (`08_DECISIONS_LOG.md`) تظل المرجع للقرار التفصيلي نفسه؛ ملف Technology Evolution يجمع التسلسل ولا يستبدل الـDecision Log.



# POST-AUDIT DECISIONS — reconciled 2026-08-17

> هذه القرارات أحدث من القرارات التاريخية أدناه وت supersede أي قرار يتعارض معها. التفاصيل والأسباب في `12_ENGINEERING_AUDIT_REPORT.md`.

1. **No ERP rewrite:** الحفاظ على ASP.NET Core/Blazor Server/EF/SQL/Identity؛ قرار Tabulator كـfuture engine تم نسخه بقرار RevoGrid في 2026-08-20.
2. **Execution status/current priority:** previous remediation remains preserved; Grid Shootout is complete and RevoGrid 4.25.2 is selected. Current task is isolated real Blazor/RevoGrid integration before production cutover.
3. **Performance is a hard gate:** 10k target; 50k capacity; أي Lag ملحوظ يرفض التصميم.
4. **Save semantics:** Save = اعتماد وحفظ محلي durable؛ Sync أوتوماتيك وليس زرًا منفصلًا.
5. **Draft:** قبل Save يمكن حماية العمل محليًا كDraft غير معتمد؛ Restore/Discard بعد reopen.
6. **No fixed server polling.** الاتصال عند حدث مهم مثل Save/Resume مع Pending work.
7. **Preflight:** metadata صغيرة؛ لا توقف Sync إلا لتغيير يمس Offline work فعليًا.
8. **Offline scope:** كل السنوات المصرح بها للقسم؛ initial background prep ثم delta.
9. **Offline editing lease:** 5 ساعات من آخر server contact؛ بعدها read/copy + حفظ ما بدأ فقط.
10. **Trusted Login:** 7 أيام بعد Login كامل.
11. **Auth:** Username + Password + Email OTP؛ البريد قناة تحقق وليس هوية؛ Admin ببريد خاص.
12. **Temporary password:** 8 خانات بسيطة؛ إجبار التغيير؛ lockout تقريبًا 5 محاولات/15 دقيقة.
13. **OperationId/receipts:** idempotent Sync/lost-ACK recovery.
14. **Partial Sync:** sync السليم فقط، preserve conflicts.
15. **Conflict policy:** different fields auto-merge; same field user resolves; server-delete does not auto-resurrect.
16. **Custom schema:** server-approved structure wins؛ Offline values تُحمى ويُطلب تصرف المستخدم قبل destructive Sync.
17. **AssignmentDate cross-year:** confirmation؛ Asia/Riyadh business time.
18. **Multi-tab:** BroadcastChannel + Web Locks؛ one Sync owner.
19. **Multi-device:** allowed؛ DeviceId + independent Outbox.
20. **No dedicated Excel Import currently:** Copy/Paste from Excel is enough؛ Export/clipboard out must be Formula-Injection safe.
21. **Work Order Value:** production-mandatory؛ Work Orders employee enters estimate؛ Extracts specialist reviews/corrects final system value.
22. **Roles:** Admin creates/disables accounts؛ managers delegate operational capabilities within scope; no shared Admin credentials.
23. **Main Basket + specialist sub-workflows:** Municipality/GIS/Execution/Extracts/Warehouse details must not explode the main Basket.
24. **Warehouse detailed design deferred.**
25. **Inspection/KPI attribution detail deferred** until KPI/workflow phase.
26. **Offline on InPrivate:** not supported.
27. **No separate Admin trusted-device revocation feature for now.**
28. **Production:** Staging, CI, backup+restore test, safe migrations, limited Pilot before Production.

# 08 — Decisions Log

**Status:** Approved
**Purpose:** حفظ سبب القرارات حتى لا نعيد المناقشة من الصفر أو نغيّر الاتجاه بصمت.

## DEC-001 — Blazor instead of Power Apps

- **Status:** Accepted
- **Decision:** استخدام Blazor Web App + ASP.NET Core + EF Core + SQL Server.
- **Reason:** التحكم في تجربة Excel-like والأداء والصلاحيات والمنتج التجاري.
- **Impact:** وثائق Power Apps/Dataverse القديمة أصبحت Archived.
- **Simple example:** بدل بناء المنتج داخل منصة جاهزة بحدودها، نملك التطبيق والكود وقاعدة البيانات مباشرة.

## DEC-002 — Dedicated environment per customer

- **Status:** Accepted
- **Decision:** App وDatabase منفصلان لكل شركة في الإصدارات الأولى.
- **Reason:** عزل أبسط وأوضح وأقل مخاطرة من Shared DB multi-tenancy الآن.
- **Trade-off:** تكرار النشر والنسخ الاحتياطي لكل عميل.

## DEC-003 — Modular Monolith

- **Status:** Accepted
- **Decision:** تطبيق واحد مع موديولات داخلية واضحة.
- **Reason:** يناسب حجم المنتج الحالي ويمنع تعقيد Microservices.
- **Trade-off:** نحتاج انضباطًا في الحدود داخل نفس المشروع.

## DEC-004 — Tabulator is the current runtime grid

- **Status:** **Superseded as the future engine on 2026-08-20; retained as current runtime until cutover**
- **Decision:** Tabulator 6.5.0 ما زال Grid الفعلي في `/work-orders`، لكن لم يعد المحرك المستهدف للمستقبل.
- **Reason:** كان مناسبًا للتحقق الأولي، لكن real-use performance debt وكثرة grid-specific stabilization أدت إلى Grid Shootout مستقل.
- **Replacement decision:** `DEC-030` — RevoGrid Community 4.25.2.

## DEC-005 — No public registration

- **Status:** Accepted
- **Decision:** Admin ينشئ الحسابات؛ لا يوجد Register عام.
- **Reason:** الحسابات مرتبطة بأدوار وفروع وأقسام ثابتة.
- **Simple example:** المستخدم لا يختار بنفسه أنه موظف قسم معين؛ المدير يربط الحساب بالمكان الصحيح.

## DEC-006 — One Admin

- **Status:** Accepted
- **Decision:** حساب Admin واحد فقط.
- **Implementation:** Seeder يرفض وجود أكثر من Admin.
- **Risk:** يلزم Recovery/credential process موثق قبل الإنتاج.

## DEC-007 — Session-only Undo/Redo

- **Status:** Accepted for V1
- **Decision:** التاريخ داخل الجلسة فقط.
- **Reason:** تقليل التعقيد؛ بعد Refresh لا نضمن Undo.
- **Impact:** المستخدم يجب أن يحفظ أو يتراجع قبل تغيير السنة.

## DEC-008 — E6C is the foundation baseline

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** E6C هي نقطة الأساس التي بدأ منها التنظيم، وتظل Tag تاريخية للرجوع.
- **Contains:** central buffer 260px، vertical gate، ArrowUp correction، logical row anchor on resize.
- **Excludes:** R2/R3 automatic/hidden recovery experiments.
- **Reason:** آخر نسخة اختبرها المستخدم وعادت فيها الوظائف الأساسية سليمة.

## DEC-009 — Stop performance patches before engineering foundation

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** لا Patch جديد للإرهاق قبل التوثيق والاختبارات وفصل المسؤوليات.
- **Reason:** تعديلات صغيرة بدأت تكسر ميزات بعيدة مثل الأسهم وتغيير السنة.
- **Simple example:** عندما يصبح إصلاح مفتاح واحد يقطع الكهرباء عن أكثر من غرفة، ننظم اللوحة قبل إضافة مفاتيح أخرى.

## DEC-010 — Gradual extraction, no full rewrite

- **Status:** Accepted
- **Decision:** استخراج Module واحد كل مرة من `tabulatorTest.js`.
- **Reason:** Rewrite كامل يجمع أخطاء كثيرة ويصعب مقارنة السلوك.
- **Rollback:** كل مرحلة لها Git checkpoint واختبار مستقل.

## DEC-011 — Shared behavior is centralized

- **Status:** Accepted
- **Decision:** السلوك المشترك مثل vertical navigation يُدار من مسار مركزي.
- **Exception:** اتجاه خاص فقط عند وجود دليل تقني، مثل ArrowUp viewport correction.
- **Reason:** منع الحلول المتكررة والمتعارضة.

## DEC-012 — Documentation is a product asset

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** التوثيق والـKnown Issues والاختبارات والقرارات تُحدث مع التنفيذ.
- **Reason:** المحادثات ليست مصدر معرفة دائم، والمستخدم غير مبرمج ويحتاج شرحًا بسيطًا وأمثلة.


## DEC-013 — E6E historical stable checkpoint

- **Date:** 2026-07-27
- **Status:** Superseded by DEC-015, then DEC-017
- **Decision:** اعتماد E6E كنقطة التشغيل المستقرة الحالية، مبنية تراكميًا على E6C.
- **Contains:** E6C resize/buffer/navigation safeguards، E6D Enter repeat gate، وE6E first-right-click range guard.
- **Reason:** حلت مشكلتين قابلتين لإعادة الإنتاج بدون إدخال Recovery أو Restart أو تغيير قواعد البيانات.
- **Rollback:** الرجوع إلى Git tag `E6C-Baseline` عند ظهور Regression غير مقبول.
- **Simple example:** E6C هي أساس المبنى، وE6E هي آخر طابق تم فحصه واعتماده للاستخدام الحالي.

## DEC-014 — Fix confirmed functional defects before module extraction

- **Date:** 2026-07-27
- **Status:** Accepted
- **Decision:** العيب الوظيفي المحدد والقابل لإعادة الإنتاج يُصلح ويُختبر قبل نقل نفس الجزء إلى Module جديد.
- **Reason:** فصل كود مكسور ينقل المشكلة ويزيد تكلفة التشخيص.
- **Constraint:** لا يتحول ذلك إلى سلسلة Performance patches غير محدودة؛ الإصلاح يجب أن يكون صغيرًا ومثبت السبب.


## DEC-015 — E6F historical stable checkpoint

- **Date:** 2026-07-27
- **Status:** Superseded by DEC-017
- **Decision:** اعتماد E6F كنقطة الرجوع الحالية قبل بدء Module extraction.
- **Contains:** E6C foundation، E6D Enter gate، E6E right-click guard، E6F structural focus safety.
- **Evidence:** Clean/Rebuild PASS، الوظائف الأساسية PASS، Console بلا أخطاء بعد العمليات الهيكلية.
- **Rollback:** Git tag `E6E-Stable` أو الأساس `E6C-Baseline`.

## DEC-016 — Accept a provisional two-run performance baseline

- **Date:** 2026-07-27
- **Status:** Accepted by user
- **Decision:** استخدام متوسط تقريرين نظيفين كمرجع مؤقت بدل مطالبة المستخدم بجولة ثالثة.
- **Limitation:** عرض نافذة الاختبار اختلف، لذلك المرجع ليس Median صارمًا ولا يستخدم لإثبات تحسين صغير.
- **Use:** اكتشاف Regression واضح بعد Refactor فقط.
- **Simple example:** القياس مثل ميزان تقريبي يمنع زيادة كبيرة في الوزن، لكنه ليس ميزان معمل لإثبات فرق جرامات قليلة.


## DEC-017 — M5D4R3 is the current stable checkpoint

- **Date:** 2026-07-29
- **Status:** Accepted after user testing
- **Decision:** اعتماد `M5D4R3-Stable-Range-UX` كنقطة العمل والرجوع الحالية، مع بقاء E6C كأساس تاريخي للسلوك.
- **Contains:** Phase 5 clipboard ownership، in-place save reconciliation، global duplicate reporting، logical range clear، ordered validation، وdrag Auto-scroll بسرعة 8/32.
- **Rollback:** `M5D3-Stable-Range-Clear-And-Validation` إذا ظهر Regression خاص بالـAuto-scroll.

## DEC-018 — Final role and uniqueness terminology

- **Date:** 2026-07-29
- **Status:** Accepted
- **Decision:** `ProjectManager` هو الاسم النهائي. `Employee` هو اسم الـIdentity role التقني وDepartment Employee / موظف القسم هو اسم العرض. التفرد عالمي عبر الشركة وكل السنوات للزوج `WorkOrderNumber + WorkTypeCode`.
- **Impact:** لا Role migration أثناء Phase 6، ولا إعادة فتح Scope التفرد بدون متطلب أعمال جديد موثق.

## DEC-019 — Diagnose gradual fatigue with time windows and lifecycle resources

- **Date:** 2026-07-29
- **Status:** Accepted
- **Decision:** Phase 6.1 تقيس الأداء تلقائيًا في نوافذ 30 ثانية مع Listeners/Timers/RAF/Observers، بدل الاعتماد على علامة يدوية للحظة البطء.
- **Reason:** القياسات أثبتت أن التدهور تدريجي، وليس حدثًا مفاجئًا.
- **Constraint:** وضع Lifecycle تشخيصي فقط؛ أي تحسن نهائي يُثبت مجددًا في Baseline.

## DEC-020 — Accept current navigation performance without a runtime fix

- **Date:** 2026-07-29
- **Status:** Accepted by user
- **Decision:** إغلاق مسار تحسين الأسهم وEnter والـWheel حاليًا بدون Recovery أو Rewrite أو Targeted Patch، لأن المستخدم أكد أن السرعة العملية الحالية مقبولة.
- **Evidence:** Phase 6.0 أثبتت تدهورًا تدريجيًا، وPhase 6.1 لم تثبت تراكمًا مستمرًا في Timers أو Observers أو known lifecycle owners.
- **Reason:** القياس وحده لا يبرر تعديلًا عالي المخاطر عندما لا توجد مشكلة استخدام مؤثرة.
- **Reopen when:** اختبار 10,000 صف، شكوى فعلية، أو Regression مقارنة بالـBaseline.

## DEC-021 — Defer search debounce until a measured need exists

- **Date:** 2026-07-29
- **Status:** Accepted by user
- **Decision:** عدم إضافة Debounce للبحث الآن.
- **Reason:** البحث الحالي سريع مع بيانات البروتوتايب، وإضافة Debounce ستضيف تأخيرًا مقصودًا وTimer ومسار اختبار جديد دون فائدة مثبتة.
- **Reopen when:** البحث يصبح بطيئًا مع بيانات أكبر أو القياس يثبت تشغيل فلترة مكلفًا مع كل حرف.


## DEC-022 — Track changed fields and run only dependent rules

- **Date:** 2026-07-31
- **Decision:** Existing-row changes are tracked by stable field keys. Batch operations apply values together, and validation/save logic acts only on affected fields and rule dependencies.
- **Reason:** Editing one column across thousands of rows must not make the system revalidate or rewrite unrelated columns.
- **Example:** Pasting estimated value does not execute the global Work Order Number + Work Type duplicate rule. Editing either identity field does.
- **Future impact:** User-created columns must register stable metadata and use the same generic change pipeline. Core business fields remain strongly typed and indexed.

## DEC-023 — Explain project logic before code details

- **Date:** 2026-07-31
- **Decision:** Explanations must begin with the Work Orders business situation, the before/after behaviour, the exact user test, and remaining work. Internal code details are secondary.
- **Reason:** The user is directing product logic and testing but is not a programmer.


## DEC-024 — One lifecycle owner for each Work Orders grid instance

- **Date:** 2026-07-31
- **Status:** Accepted for focused regression
- **Decision:** `tabulatorLifecycle.js` owns state creation, lifecycle listeners, async cancellation, viewport lock, instance disposal, and final destroy. `tabulatorTest.js` coordinates initialization but must call the lifecycle owner for both year reinitialization and component disposal.
- **Reason:** the old and new year sheets must never receive the same keyboard, copy, paste, resize, or pointer action.
- **Example:** when the employee moves from 2026 to 2025, we disconnect the 2026 sheet before opening 2025, just as a machine is isolated before another control panel is connected.
- **Constraint:** R1 is extraction only. Navigation and resize algorithms are not changed until the lifecycle regression passes.

## DEC-025 — One interaction binding owner for each live Work Orders sheet

- **Date:** 2026-07-31
- **Status:** Accepted for focused regression
- **Decision:** `tabulatorInteractions.js` owns binding grid/window/document user interactions. `tabulatorLifecycle.js` owns their cleanup. The feature algorithms remain in their existing modules during R2.
- **Reason:** event ownership must be auditable before future user-created columns and layouts are added. A new column may register metadata and reuse the shared route, but must not add another document-level keyboard or clipboard path.
- **Example:** a custom “Estimated Value” input column uses the existing direct-typing, selection, Copy/Paste, Undo, and dirty-field pipeline. It does not install a new keydown handler.
- **Constraint:** R2 is extraction only; no shortcut, navigation, resize, clipboard, context-menu, or edit behavior is intentionally changed.



## 2026-07-31 — Give the Blazor Save Workflow One File Owner

**Decision:** move `SaveChangesAsync`, the save stream limit, save-only mapping helpers, and save-only DTOs from `WorkOrders.razor.cs` to `WorkOrders.Save.cs` without altering their content.

**Reason:** the verified save workflow is large and business-sensitive. Keeping it mixed with page loading, year switching, and disposal makes future changes harder to review and increases the chance of accidentally changing unrelated behaviour.

**Business example:** changing the message shown after moving three work orders to 2027 should require reviewing the save workflow only; it should not require navigating through grid initialization and year-loading code.

**Constraint:** no JavaScript API, service contract, uniqueness rule, authorization rule, transaction, status message, or performance stage may change in this extraction.

## 2026-07-31 — Separate Save Request Preparation from Result Interpretation

**Decision:** keep one `SaveChangesAsync` coordinator, but move browser-delta-to-service-request preparation into `WorkOrders.SaveRequest.cs` and service-result-to-browser-presentation preparation into `WorkOrders.SaveResult.cs`.

**Reason:** after R1 proved the complete save journey still works, the next safest boundary is to separate “what will be saved?” from “what did the server decide and what must the employee see?” This makes duplicate, concurrency, moved-year, and temporary-row logic reviewable without mixing them with stream reading and loading-state cleanup.

**Business example:** changing Basket in one row produces a changed-row request. A duplicate failure produces cell marks and a failure message. These are different decisions and must not be hidden inside one long button method.

**Constraint:** R2 does not change the service contract, global identity rule, year movement, row-version protection, Arabic messages, JavaScript calls, or performance stage names. Browser dirty-state extraction remains a later step after R2 runtime regression.



## 2026-07-31 — Give Browser Dirty State One Module Owner

**Decision:** extract original row snapshots, dirty row ids, changed field keys, deleted saved-row ids, dirty/deleted Save collection, and post-Save baseline acceptance into `tabulatorDirtyState.js` while preserving the existing public `tabulatorTest` method names.

**Reason:** the same unsaved-state collections were being read or mutated from initialization, field edits, structural operations, Undo/Redo, Save streaming, and Save reconciliation. A single owner makes it reviewable whether the screen, Save request, and unsaved count describe the same data.

**Business example:** after changing Basket and then undoing to the stored value, the order must stop appearing as unsaved. After a successful Save, the server row version—not the pre-save browser version—must become the new comparison baseline.

**Constraint:** R3 does not change field definitions, validation, uniqueness, year routing, service calls, database writes, Arabic messages, Undo/Redo algorithms, or performance-stage names. It does not add autosave or persistence for Undo history across refresh.


## 2026-07-31 — Split Read Queries Before Save Mutations

**Decision:** Phase 8.8-R1 moves the implementation of `LoadSheetAsync` to a scoped `WorkOrderQueryService`, while retaining forwarding overloads on `WorkOrderService` for compatibility.

**Reason:** the read path has a clean, read-only boundary—employee scope, available years, and selected-year projection—and does not need the mutation transaction. Extracting it first reduces the 1,395-line service without mixing the change with global uniqueness, RowVersion, deletes, or database writes.

**Business example:** opening another year should only read the employee's department and return rows in sheet order. It must not instantiate save rules or alter any work order.

**Constraint:** R1 preserves query filters, projection, ordering, performance stage names, and the existing page call. No save method, validation rule, transaction boundary, uniqueness scope, or database schema is changed.

## DEC-026 — No test-green patch stacking; Phase 9.2D2 requires consolidation before closure

- **Date:** 2026-08-04
- **Status:** Accepted by user
- **Decision:** لا يتم إنشاء أو تكديس Patch جديد لمجرد جعل الاختبار ينجح. لا تُغلق Phase 9.2D2 قبل مراجعة حجم وتعقيد الكود الناتج، حذف التكرار والمسارات القديمة والمؤقتة، وتوحيد التعديلات في تنفيذ نهائي نظيف.
- **Reason:** نجاح الاختبار وحده قد يخفي تضخمًا في الكود أو Helpers وWaits وFallbacks متكررة، فيجعل الاختبارات نفسها أصعب في الصيانة وأقل موثوقية.
- **Required evidence before closure:**
  - مقارنة صافي الأسطر والدوال والتعقيد مع بداية Phase 9.2D2.
  - تصنيف كل فشل من الأدلة قبل أي تعديل جديد.
  - مسار واحد واضح لقراءة الخلية النشطة، انتظار جاهزية السنة، والتمرير الافتراضي.
  - حذف Dead Code والـtemporary diagnostics والـobsolete waits والـfallbacks غير اللازمة.
  - إعادة Stress والـPerformance baseline المطلوبين بعد التنظيف.
  - توثيق صافي التغيير والدين الفني المتبقي.
- **Constraint:** لا يُقبل Patch إضافي كطبقة فوق الحل السابق إذا كان استبدال المسار الخاطئ أو تبسيطه ممكنًا.
- **Simple example:** إذا ثبت أن الاختبار يقرأ موضع الخلية من State قديم، يُستبدل هذا القارئ بالقارئ الصحيح من Tabulator بدل إبقائه وإضافة قارئ احتياطي ثانٍ.



## DEC-027 — Persist column widths by department, not by year or user

- **Date:** 2026-08-04
- **Status:** Accepted by user
- **Decision:** Core and custom Work Orders column widths are saved by `DepartmentId + FieldKey`, shared across every year of that department. Width changes require the existing Save button and participate in Undo/Redo before Save.
- **Header rule:** title, filter icon, and sort icon form one adjacent group. Long titles ellipsize so controls do not move to the far edge or disappear.
- **Reason:** the same department sheet must keep one familiar layout while still allowing the employee to make narrow or wide columns without wasting horizontal space.
- **Constraint:** Phase 9.3B changed width only. Later decisions govern rename, delete, immutable type, filters, sorting, and visibility.


## DEC-028 — Remove legacy Status and Notes fields

- **Date:** 2026-08-05
- **Status:** Accepted by user
- **Decision:** `Status` and `Notes` are removed completely from Work Orders. They are not converted into custom columns. The migration drops both database columns and intentionally deletes their existing values.
- **Protected columns:** Work Order Number, Work Type, Assignment Date, Work Order Value, Partial Amount, Remaining Amount, and Basket only.
- **Reason:** every non-core business field should be created explicitly through the department custom-column system rather than retaining two special legacy fields.
- **Constraint:** no compatibility alias or hidden fallback remains in the entity, DTOs, save pipeline, grid columns, filters, validation, tests, or current documentation. A department may later create its own custom Text column with any suitable name.

## DEC-029 — Immutable custom-column types and lightweight client-side Header behavior

- **Date:** 2026-08-05
- **Status:** Accepted by user
- **Type rule:** A custom-column type is selected once at creation and cannot be changed later. `Custom Column Properties` permits rename only; deletion is a separate confirmed action.
- **Automatic Header rule:** Custom `Text`, `Date`, and whole `Number` columns receive value filters. Custom `Money` columns receive numeric sorting only, starting descending.
- **Visibility rule:** `Hide Column` is available from a visible data-column Header. `Unhide Column` appears in the same context menu only when hidden columns exist and lists them on demand. No permanent `Columns` toolbar button is added.
- **Persistence rule:** Width and hidden state are saved by `DepartmentId + FieldKey`, shared by every year of the department, and written only through the existing explicit Save transaction. Hide/Unhide participates in Undo/Redo before Save.
- **Performance rule:** Filtering, sorting, hiding, and showing operate on the existing Tabulator data in the browser. No server request is made for those interactions. The hidden-column list is built only when the context menu opens, and the obsolete database scan that supported empty-only type conversion is removed.
- **Safety constraint:** The row-number column cannot be hidden and at least one data column remains visible, because Unhide is intentionally reachable only through a visible Header.

## DEC-030 — RevoGrid Community 4.25.2 selected for Work Orders

- **Date:** 2026-08-20
- **Status:** Accepted by user
- **Decision:** اعتماد **RevoGrid Community 4.25.2** كمحرك Work Orders المستهدف بدل Tabulator بعد اكتمال isolated qualification.
- **Current-runtime constraint:** لا يتغير `/work-orders` إلى RevoGrid قبل Gate 5A/5B/5C.
- **Evidence:** 100,000-row core gate plus ERP history/readonly/delete/custom-column/Split/RTL/Zoom gates passed in the isolated shootout. The frozen reference is `wwwroot/grid-shootout/REVOGRID_FROZEN_BASELINE_2026-08-20.json`.
- **Paste rule evidence:** RevoGrid matched the approved end-of-sheet truncation rule in the accepted gate. Univer did not: a 4,000-value Paste with only 200 rows available expanded the sheet by 3,800 rows.
- **License/version rule:** pin exact `4.25.2`; Community package is MIT-licensed. Self-host package assets and retain license text before production cutover. Do not depend on `latest`.
- **Migration rule:** preserve existing Work Orders business/server contracts and frozen visual sizes. Reimplement required interaction behavior using public RevoGrid APIs; do not mechanically port Tabulator internals.
- **Rollback:** keep the current Tabulator route intact until the RevoGrid cutover checkpoint passes full regression.


## DEC-031 — One RevoGrid Change Engine owns session change history

- **Date:** 2026-08-21
- **Status:** Partially superseded by DEC-033. Dirty/Baseline/ClientKey/Save rules remain; History ownership moved out of Change Engine.
- **Decision:** Build one grid-independent Change Engine before wiring RevoGrid Edit/Paste/Delete/Insert/Custom Columns. User data changes must enter the same transaction/history model rather than each feature creating its own Undo/Dirty logic.
- **Identity:** `ClientKey` is the stable row identity inside the browser session. Database `Id` may appear after the first Save and must not require re-keying History. `DisplayOrder` remains the separate ordering value used to place rows between existing rows.
- **Dirty rule:** Dirty means current value differs from the last server-accepted Baseline. Returning to the Baseline removes Dirty without deleting History.
- **History rule:** Save does not clear Undo/Redo. A new user edit after Undo clears Redo. A multi-cell Paste is one transaction.
- **Year rule:** Dirty blocks dataset/year replacement. When the sheet is Clean and the employee changes year, the old year's Undo/Redo History is cleared and the new year starts as a new dataset session.
- **Save rule:** The server remains authoritative. A successful Save advances the Baseline only for the accepted Save snapshot; a failed Save leaves Baseline, Dirty, and History unchanged.
- **Memory rule:** History uses a configurable memory budget, not only a transaction count. The newest single transaction remains undoable even if that transaction alone exceeds the configured budget.
- **Architecture constraint:** Gate 5B foundation is implemented as a pure browser module with no RevoGrid binding. RevoGrid event integration is a later client of this engine after the standalone engine passes its own regression.
- **Reference rule:** RevoGrid Community public events/source are the implementation base. RevoGrid Pro Event/History architecture is used only as a behavioral/ownership reference; no proprietary code is copied. Tabulator remains a lessons-only reference.

## DEC-032 — Gate 5B-1 uses one RevoGrid-to-Change-Engine bridge for Cell Edit

- **Date:** 2026-08-21
- **Status:** Partially superseded by DEC-033. Before/After Cell Edit binding remains; direct Undo/Redo ownership/replay moved to Sheet History.
- **Decision:** Cell Edit is the first real RevoGrid client of the standalone Change Engine. The bridge captures `beforeedit`, lets RevoGrid apply the value, then finalizes from `afteredit`. Undo/Redo replays the engine transaction against the same row objects and refreshes RevoGrid without replacing the full source.
- **Session identity:** Gate 5B-1 assigns each loaded row a session `ClientKey`; database `Id` and ordering `DisplayOrder` remain separate responsibilities.
- **Scope guard:** Range mutations, including Paste, are blocked in Gate 5B-1 so they cannot change data outside the engine before the Paste binding gate is implemented.
- **Keyboard rule:** Grid Ctrl+Z/Ctrl+Y uses the Change Engine only after a cell edit is committed. While the text editor is still open, keyboard undo/redo remains owned by the editor.
- **Year rule:** A year switch starts only when the engine is Clean. Editing is locked during the dataset-load handshake; successful replacement resets the engine to the new dataset and clears old History. Failure keeps the old dataset session active.
- **Production constraint:** `/work-orders` remains Tabulator and Gate 5A behavior remains unchanged when `EnableChangeEngine` is false. No database Save is added in Gate 5B-1.


## DEC-033 — Separate Sheet History from Dirty/Save ownership

- **Date:** 2026-08-21
- **Status:** Accepted by user
- **Decision:** `Sheet History` owns the ordered Undo/Redo timeline for reversible sheet actions. `Change Engine` owns only server Baseline, live Dirty delta, Save handshake, and dataset-change safety.
- **Replay rule:** Undo/Redo uses one History Coordinator path. The coordinator delegates each entry to the feature adapter that owns that state, emits one explicit replay lifecycle, and prevents replay from being recorded as a new user action.
- **Feature ownership:** Cell Edit uses the data adapter. Later Paste, Filter/Sort, Columns, Insert/Delete and other reversible features must register their own adapter rather than adding feature logic into the History core.
- **Dirty rule:** Only cells whose current value differs from the last accepted server Baseline remain in Dirty memory. If a touched cell returns to Baseline, its Dirty tracker is released unless an in-flight Save still needs it.
- **Focus rule:** After a successful Undo/Redo, the coordinator asks RevoGrid through public focus/scroll APIs to return selection to the affected cell when that target is currently visible/focusable. Focus feedback must not undo a successful replay if the target is temporarily hidden.
- **Year rule:** History never crosses a Work Year boundary. Dirty still blocks year change. Per-year Filter/Sort/Column view state is session-only and will be qualified with those feature adapters; first visit to a year starts with no inherited view changes.
- **Revo reference:** Community public Events/APIs remain the implementation base. Revo Pro Event Manager/History/plugin ownership is an architectural reference only; no proprietary source code is used.
- **Supersedes:** DEC-031 History ownership and DEC-032 direct Change-Engine Undo/Redo replay details.

## DEC-034 — Undo/Redo selection uses minimal reveal, never unconditional scroll

- **Date:** 2026-08-21
- **Status:** Accepted by user
- **Decision:** بعد Undo/Redo ينتقل تحديد RevoGrid إلى الخلية المتأثرة، لكن الشاشة لا تتحرك إذا كانت الخلية ظاهرة بالفعل. إذا كانت الخلية خارج الـviewport بالكامل، يتحرك الشيت بأقل مسافة لازمة لإظهارها عند أقرب حافة.
- **Revo source evidence:** في Community 4.25.2، `setCellsFocus` منفصل عن `scrollToCoordinate`. أما `scrollToRow` و`scrollToColumnProp` فيحوّلان رقم الصف/العمود إلى بداية العنصر ثم يطلبان Scroll مباشر، لذلك استدعاؤهما دائمًا بعد History replay يسبب قفزة غير لازمة حتى عندما تكون الخلية ظاهرة.
- **Implementation boundary:** منطق Focus/Reveal يعيش في Adapter مستقل عن Sheet History core. يستخدم `getProviders()` الرسمي لقراءة Dimension/Viewport state، ثم يستدعي Revo public APIs فقط. الـHistory لا يملك حسابات Scroll.
- **Visibility rule:** وجود أي جزء من الخلية داخل الـviewport يعني أنها ظاهرة؛ يتم تغيير التحديد فقط بدون تحريك الشاشة. الأعمدة المثبتة لا تسبب Horizontal Scroll.
- **Hidden target:** إذا كان الصف غير ظاهر بسبب Filter، لا يلغي Focus adapter الفلتر من نفسه. عندما يدخل Filter في Sheet History، Filter adapter هو المسؤول عن إرجاع حالته حسب ترتيب History.
- **Simple example:** لو الموظف عند الصف 100 والخلية التي يرجعها Undo ظاهرة أسفل نفس الشاشة، يتغير التحديد فقط. لو الخلية في الصف 400 خارج الشاشة، يتحرك الشيت فقط حتى يظهر الصف 400 عند أقرب طرف بدل وضعه في منتصف الشاشة أو أعلىها بلا داعٍ.

## DEC-035 — Gate 5B-2 Paste uses Revo's final range payload as one History action

- **Date:** 2026-08-21
- **Status:** Accepted by user after manual runtime qualification.
- **Decision:** Clipboard Paste is the second data client of the existing Sheet History + Change Engine foundation. A Paste of any size is one Sheet History entry containing only cells RevoGrid actually applies.
- **Revo Community rule:** `clipboardrangepaste` identifies the action as Paste. The actual old/new capture is taken at `beforerangeedit`, after RevoGrid has already clipped the matrix to available rows/columns and skipped readonly cells. RevoGrid then applies the range and `afteredit` finalizes the transaction.
- **ERP rule:** The bridge does not parse clipboard text, grow the sheet, reimplement Revo's readonly logic, or scan the whole dataset. It records only Revo's final applied range delta.
- **History rule:** One Paste = one Undo/Redo action. Separate Paste operations remain separate actions. Undo/Redo reuses the same `data-cell-set` replay adapter as Cell Edit.
- **Scope guard:** Gate 5B-1 keeps Paste blocked. Gate 5B-2 enables Clipboard Paste only; Autofill and other range mutations remain blocked until separately qualified.
- **End-of-sheet rule:** Because the bridge captures Revo's already-transformed range, the approved product behavior remains native: Paste stops at the last available row and never creates rows automatically.
- **Reference rule:** RevoGrid Pro Event Manager/History is used as an architectural reference: edit/paste/range flow is normalized before History, and bulk Paste is one transaction. No proprietary code is copied.

## DEC-036 — Gate 5B-3 keeps Excel-like filter UX while Revo Community owns filtering

- **Date:** 2026-08-21
- **Status:** Functionally accepted by user; active-filter header indication is completed by DEC-037.
- **Decision:** Work Orders keeps the accepted Excel-like filtering experience instead of exposing Revo Community's condition-panel UI. The ERP layer owns only the picker UI and selected-value state; RevoGrid Community 4.25.2 `FilterPlugin` remains the engine that calculates and applies filtered/trimmed rows.
- **Column capability rule:** `Work Order Number`, `Work Type`, `Assignment Date`, and `Basket` are Filter-only. `Work Order Value`, `Partial Amount`, and `Remaining Amount` are Sort-only. Custom `Text`, `Date`, and `Number` are Filter-only; custom `Money` is Sort-only.
- **Date UX:** Date filters use the approved hierarchy `Year → Month → Day` with Search, Select All, Clear Filter, and Apply. Value filters use an Excel-like checkbox list and virtualize large option sets rather than rendering every Work Order number into the DOM.
- **Search-selection rule (2026-08-22 refinement):** typing a non-empty Search term replaces the popup's pending checkbox selection with the currently matching options, but does **not** filter/reorder the grid until Apply. This gives the employee Excel-style `type → Apply` behavior while preserving the approved snapshot rule. Select All while searching affects only searched/visible options, matching Revo Pro's documented `select-all-visible` boundary. Clearing the Search box preserves the pending checkbox selection; `Clear Filter` remains the explicit command for removing the column filter. A zero-match Search disables Apply so it cannot accidentally mean “show all”.
- **Native-engine boundary:** Normal Filter Apply/Clear does not patch Revo source or replace its filtering/virtualization engine. The ERP header button supplies selected-value criteria through `grid.filter.multiFilterItems`, and the registered custom predicate runs inside Revo's native `runFiltering → setTrimmed` path. DEC-038 adds only a History-replay overlay that restores the small `ClientKey` visibility delta needed for the approved working snapshot; it does not calculate or store a replacement full filter result.
- **History/Dirty rule:** Apply or Clear is one `Sheet History` action when it changes filter state or the working view. Filter state never enters `Change Engine` Dirty and never creates a database Save delta. Undo/Redo first uses the same Revo native filter path, then DEC-038 may restore the recorded working-view identity delta.
- **Year rule:** A clean year switch clears History but preserves independent Filter view state per visited year for the lifetime of the page session. A year opened for the first time starts with no inherited filter.
- **Data-change rule:** Superseded by DEC-038. Filter view is now intentionally snapshot-based during Edit/Paste/Insert/Delete; explicit Filter Apply/Clear is what recalculates visible rows.
- **Revo source evidence:** Community 4.25.2 renders its native filter button only when grid filtering is enabled and `column.filter !== false`, while `FilterPlugin.getRowFilter` evaluates programmatic `multiFilterItems` against the column map independently of that header-button flag. This allows a custom ERP picker without replacing Revo's filter engine.
- **Pro reference:** Revo Pro demonstrates the same architectural separation of enhanced filter UI/plugins from the grid/filter core. The exact Excel date tree is an ERP UX choice; no claim is made that Pro implements this exact tree and no proprietary source is used.


## DEC-037 — Gate 5B-4 separates Header Selection, Filter, and Sort without patching Revo

- **Date:** 2026-08-21
- **Status:** Implemented for isolated runtime qualification.
- **Decision:** A Work Orders data-column header has three distinct responsibilities. Clicking the header body selects that column across the rows currently visible in the Revo view. Clicking the Filter button opens the ERP Excel-like picker. Clicking the dedicated Sort button changes sorting. The whole header is no longer an implicit Sort target in Gate 5B-4.
- **Visible-selection rule:** whole-column selection uses Revo Community public `getVisibleSource("rgRow")` and `setCellsFocus(...)`. If a filter leaves 200 visible rows from a 4,000-row dataset, header selection covers only those 200 visible rows. Hidden/trimmed rows are never silently included.
- **Filter-active rule:** the Filter button never disappears after Apply. Revo Community `FilterPlugin` already owns the column `hasFilter` flag when native filtering is applied; the ERP template only renders that native state as a clearly active funnel. No duplicate ERP filter-active state is introduced.
- **Sort engine rule:** only approved Money columns expose Sort. The dedicated ERP Sort control calls Revo Community public `updateColumnSorting(...)` / `clearSorting()`; Revo `SortingPlugin` continues to own comparator selection, proxy-index ordering, viewport refresh, and `aftersortingapply`. ERP code does not reorder `source`.
- **Sort cycle:** Work Orders numeric sorting follows the approved business UX: first click `desc` (largest to smallest), second click `asc`, third click returns to natural source order. Only one Sort column is active at a time.
- **History/Dirty rule:** one user Sort transition is one Sheet History action. Undo/Redo replays through the same native sorting API and does not record itself again. Sort is view state only and never enters Change Engine Dirty or Save payload.
- **Year rule:** Sort view state is independent per visited year for the current page session, matching Filter view-state ownership. A first visit to a year starts unsorted. A clean year switch clears the old History; returning to a visited year restores its Sort/Filter view without restoring the old Undo stack.
- **Interaction rule:** clicks on Filter/Sort controls are excluded from whole-column selection. A plain header-body click is Selection only. This separation keeps each feature owner explicit and avoids the Tabulator-style coupling being retired.
- **Community source evidence:** exact 4.25.2 source shows `SortingPlugin` triggers implicit header sorting only when `column.sortable` is true; the public grid API exposes `updateColumnSorting`, `clearSorting`, `getVisibleSource`, and `setCellsFocus`. The filter plugin updates `hasFilter` itself when applying native filter state. Gate 5B-4 uses those public/native boundaries and does not patch Revo source.
- **Pro reference:** Revo Pro documents a dedicated `ColumnSelectionPlugin` that reacts to header interaction and integrates with selection/data stores. Pro/Community sorting retains a separate `SortingPlugin`. Gate 5B-4 follows that responsibility split while keeping the ERP-specific visible-only selection and dedicated icon UX. No proprietary source is used or copied.


## DEC-038 — Gate 5B-5 keeps Filter/Sort view stable during data work and adds structural row History

- **Date:** 2026-08-21
- **Status:** Accepted by user for Gate 5B-5 qualification.
- **Employee-visible rule:** Edit, Paste and Insert do not make rows jump or disappear underneath the employee. The current Filter/Sort view is treated as a working snapshot until the employee explicitly applies/changes Filter or Sort again.
- **Filter refresh History rule:** pressing Apply again with the same selected filter values still re-evaluates the current rows. If Edit/Paste/Insert changed the working snapshot, that refresh is one Sheet History action. History stores only the `ClientKey` identities whose visibility differs from the native filter result, not a copy of all rows. Undo restores the exact pre-Apply working snapshot; Redo restores the refreshed result. If Apply produces no view change, no empty History entry is created.
- **Filter picker rule:** Opening the Excel-like picker always reads the current row values. Example: if five visible rows originally had value `1` and the employee changes them all to `2/3`, they stay visible until Filter is applied again, but reopening the picker lists the current `2/3` values rather than stale `1`.
- **Insert rule:** Insert Above/Below is allowed while Filter/Sort is active. The new row is placed by the target row's real source identity/order, receives a new temporary `ClientKey`, and receives a `DisplayOrder` between its real neighbors. It is also inserted into the current visible/proxy snapshot immediately so the employee sees it exactly where requested.
- **Explicit multi-row Insert UX:** `Insert 1 Row Above/Below` remains a one-row command. A separate `Insert Rows...` command asks for an explicit row count and then whether to insert Above or Below the target. The inserted count is never inferred from how many rows happen to be selected. The whole batch is one Sheet History action and Undo/Redo removes/restores the complete batch together.
- **Delete rule:** Delete acts only on the selected visible row identities. It never converts a visible row number directly into a database/source row without resolving the stable `ClientKey`.
- **Multi-row context rule:** right-clicking inside an existing multi-row selection preserves that selected range for `Delete Selected Rows`; right-clicking outside the selected range targets only the row that was actually right-clicked. Revo's later focus change must not silently collapse a valid multi-row delete into one row.
- **DisplayOrder rule:** Normal insertion uses the integer midpoint between neighboring DisplayOrder values. If a local gap is exhausted, only a bounded neighborhood is redistributed first; full-sheet redistribution is last-resort only.
- **History/Dirty rule:** one Insert is one Sheet History action; one multi-row Delete is one Sheet History action. New/deleted/reordered rows are structural Dirty in Change Engine. Undoing an unsaved Insert or restoring a deleted row returns structural Dirty toward Baseline without clearing unrelated History.
- **Revo boundary:** Revo Community remains responsible for row rendering, native proxy/trimmed view stores, FilterPlugin, and SortingPlugin. ERP code uses stable row identity to preserve the approved working snapshot during structural changes and does not patch Revo source. Revo Pro's explicit separation of virtual/physical/authored row indexes and built-in row insert/delete commands is used as an architectural reference only.
- **Production constraint:** Gate 5B-5 is isolated at `/work-orders-revogrid-gate5b5`; no database Save or `/work-orders` cutover is included yet.

## DEC-039 — Remaining Amount stays an ERP-derived field across Revo data actions

- **Date:** 2026-08-22
- **Status:** Accepted
- **Decision:** `Remaining Amount` remains derived from `Work Order Value - Partial Amount`; it is not independently editable or persisted.
- **Revo behavior:** accepted Cell Edit/Paste updates recalculate the affected row immediately. Undo/Redo replay recalculates the same derived value after the underlying financial input is restored. The grid source is not replaced; existing row objects are updated and the Revo `rgRow` viewport is refreshed.
- **History/Dirty rule:** only the employee-edited financial input enters data History/Dirty. `Remaining Amount` is a consequence of that action, not a second user action, and therefore never adds a separate Undo step or Save delta.
- **Architecture rule:** the money calculation is kept in ERP browser rules rather than Revo FormulaPlugin. Revo Community remains the renderer/edit host; server-side `WorkOrderFinancialRules` remains authoritative at Save.


## DEC-040 — Soft working-sheet validation keeps invalid values visible and blocks Save

- **Date:** 2026-08-22
- **Status:** Approved product behavior; implementation planned.
- **Decision:** invalid values entered manually or through bulk/range operations may remain visible in the working sheet and are marked invalid. The employee may continue working, but Save is blocked until all validation errors are corrected.
- **Consistency rule:** manual Edit and Paste/range operations follow the same soft-validation product behavior; the implementation must not create separate contradictory validation semantics per input method.
- **Bulk History rule:** one bulk operation remains one Sheet History action even when it contains one or more invalid cells.
- **Financial rule:** if `PartialAmount > WorkOrderValue` or another invalid financial state makes `RemainingAmount` misleading, `RemainingAmount` is blank/uncomputed until the financial inputs are corrected.
- **Required-data rule:** a row may be temporarily incomplete while the employee is preparing it, but Save remains the final gate for required fields.
- **Authority rule:** browser validation provides working feedback only. Server/database validation remains authoritative and must still reject invalid persisted data.
- **Implementation state:** the unified RevoGrid client validation foundation is not implemented yet at baseline `04e0f1a`; existing server financial validation is evidence for persistence rules, not proof that this client behavior already exists.


## DEC-045 — RevoGrid Range Clear uses the native range payload and real-browser acceptance

- **Date:** 2026-08-26
- **Status:** Accepted
- **Employee-visible rule:** selecting multiple editable cells and pressing `Delete` or `Backspace` clears the writable cells as one user action. Readonly/derived fields such as `Remaining Amount` are never directly cleared.
- **History rule:** one Range Clear is one Sheet History transaction; Undo restores the whole range once and Redo reapplies it once.
- **Financial rule:** clearing `Work Order Value` or `Partial Amount` triggers the existing ERP financial derivation; `Remaining Amount` remains derived and does not become a separate Dirty/History cell.
- **Revo boundary:** native RevoGrid produces the final writable-cell range payload. ERP qualifies an in-place all-blank range mutation as `range-clear`, captures the before state in `beforerangeedit`, then finalizes from the applied row state in `afteredit`. Paste keeps its explicit clipboard identity and unrelated range mutation/Autofill remains blocked.
- **Acceptance rule:** important Grid behavior is not accepted from an isolated/self-test alone. The matching Playwright real-browser journey must exercise the employee-facing page and assert the visible/data/History result. On failure it preserves screenshot, browser trace, console/network diagnostics, loaded module URLs, and range-event evidence.
- **Evidence:** Change Engine self-tests PASS 39/39 and the 2026-08-26 Gate 5B-5 real Chromium journey passed Delete, Backspace, one-step Undo/Redo, financial Remaining synchronization, readonly protection, and the existing structural/filter/sort journey without console, request, or HTTP 5xx errors.
- **Scope:** this qualifies the isolated Revo Gate 5B-5 behavior only. It does not cut over `/work-orders` and does not add database Save.
