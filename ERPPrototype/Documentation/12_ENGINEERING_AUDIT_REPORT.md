# ERP Prototype — Engineering Audit Master Report

**Document ID:** `12_ENGINEERING_AUDIT_REPORT.md`  
**Edition:** Grid Engine Selection Reconciliation — 2026-08-20  
**Status:** Independent audits complete. Previous remediation remains preserved. Grid Engine Shootout is complete and **RevoGrid Community 4.25.2 is selected as the Work Orders replacement target**. `/work-orders` still runs Tabulator until migration qualification. **Current task: Gate 5A isolated Blazor + RevoGrid real-data integration.**  
**Audit baseline:** `codespaces-sync-2026-08-08` @ `00503ab`  
**Current production runtime baseline retained:** `0f6bd3b` (`Optimize Work Orders financial sorting`)  
**Latest reviewed Git HEAD:** `dc0b2b0` (`Checkpoint before Univer Gate U1`)  
**Current source package reviewed:** `ERPPrototype_Current_Review_2026-08-20.zip`. The package includes Git state captures and the Grid Shootout files. Current `/work-orders` remains Tabulator; RevoGrid is still isolated test code.  
**Latest pasted local build evidence before the final cleanup:** Build PASS; final ZIP content was separately checked for cleanup consistency.

> This is the current daily engineering source of truth. Detailed standalone audits remain evidence; current code remains the source of truth for what is actually implemented.

---

# 1. Final verdict

## Keep the foundation — no rewrite

Preserve:

- ASP.NET Core + Blazor Server for normal ERP modules.
- EF Core + SQL Server.
- ASP.NET Core Identity.
- browser-local high-frequency spreadsheet interaction; **RevoGrid Community 4.25.2 is the selected target grid engine**.
- Modular Monolith direction.
- global `(WorkOrderNumber + WorkTypeCode)` uniqueness.
- RowVersion, SQL constraints/indexes, explicit transactions.
- server-side Work Orders authorization/final validation.
- `WorkOrderSavePlanBuilder`.

Explicitly **not** recommended without new evidence:

- whole ERP rewrite;
- Microservices / CQRS-everywhere;
- generic repositories for style;
- React/Vue rewrite;
- whole Work Orders rewrite while changing the grid engine;
- native Windows/MAUI client on SEC machines;
- server round-trip for every spreadsheet interaction.

## Grid-engine decision — 2026-08-20

The earlier Technology Fit recommendation to keep Tabulator is **superseded only for the Work Orders grid engine** by later measured evidence and the user's explicit selection.

Current facts:

- `/work-orders` still runs Tabulator 6.5.0.
- RevoGrid Community 4.25.2 is selected as the replacement target, not yet integrated.
- RevoGrid isolated qualification covered 100,000 rows plus the required ERP interaction behaviors.
- Accepted RevoGrid gates include full-column selection under heavy scroll, sort/filter, native Paste 5,000, end-of-sheet truncation to available rows, session Undo/Redo including after Save, readonly behavior, 1,000-row delete/restore, custom-column structure, Split, RTL and Zoom preservation.
- Univer is not selected. Its native end-of-sheet Paste expanded 100,001 total rows to 103,801 when only 200 target rows were available for 4,000 clipboard values.
- RevoGrid Community 4.25.2 is MIT-licensed. The migration must pin exactly `4.25.2`, self-host the package for the final runtime, and retain its license text. Future upgrades are separate decisions and require regression qualification.
- This decision does **not** replace Blazor Server, EF Core, SQL Server, Identity, current server authorization, RowVersion, SQL uniqueness or transaction boundaries.

Migration principle: **replace the grid engine, not the ERP architecture.**

The consolidated technology timeline and reasons for Power Apps → Blazor → Syncfusion → Tabulator → RevoGrid are retained in `13_TECHNOLOGY_EVOLUTION.md`.

## Highest-leverage weakness

The main debt is the **Work Orders browser ↔ server boundary**:

- broad JS/Blazor contract;
- multiple live state copies/owners;
- full-row/full-sheet work around small edits;
- weak durable Save acknowledgement;
- no durable Draft/Outbox yet;
- Custom Column schema concurrency needs more than WorkOrder RowVersion.

Target: **controlled Work Orders boundary migration**, not a rewrite.

---

# 2. Target architecture

```text
Normal ERP
ASP.NET Core + Blazor Server
        ↓
Application Services / EF Core
        ↓
SQL Server


Work Orders
Browser-owned RevoGrid client (target; Tabulator remains current until cutover)
        ↓
IndexedDB
(Draft + Outbox + local snapshots)
        ↓
Narrow HTTPS Sync/API contract
        ↓
Existing ASP.NET Core server authority
        ↓
EF Core + SQL Server
```

### SEC constraint

Offline Work Orders must be browser-only:

- no runtime/app installation;
- no SQLite/local service installation;
- no Admin rights;
- browser + HTTPS only.

---

# 3. Frozen Work Orders UI

Do not change unless explicitly reopened:

| Item | Frozen value |
|---|---:|
| Grid row | 22 |
| Grid header | 42 |
| Grid font | 13.25px |
| KPI | 44 |
| Selected bar | 34 |
| Basket min/default | 184 |
| Basket max | 320 |

Primary use: Split Screen 100%; support 90/80/75/70/67%.  
Readability > maximum visible row count.

---

# 4. Confirmed strengths to preserve

- Work Orders Department authority is re-derived on the server.
- Client-side validation is UX; server/SQL remains final authority.
- SQL unique index protects global Work Order identity.
- RowVersion protects stale writes.
- Remaining Amount is correctly derived.
- explicit transactions protect Save atomicity.
- Tabulator/Virtual DOM is suitable for Excel-like UX.
- SQL Integration + Playwright E2E infrastructure is valuable and should be extended.
- route-lazy loading is a good concept; the readiness contract is the problem.

---

# 5. Root causes from the completed audits

| Root | Engineering conclusion |
|---|---|
| Browser/server contract too broad | Narrow typed Work Orders host/API contract. |
| Multiple live state owners | Browser durable state becomes interactive owner; SQL remains committed authority. |
| Small edits cause large work | Physical field deltas + small acknowledgements. |
| Custom schema is shared state | Add Department `Schema/Config Version`. |
| Save truth can become ambiguous | `OperationId` + server receipt + deterministic resync. |
| Arabic labels used as identity | Stable language-neutral codes before Offline/English schema freezes. |
| Tests miss cross-boundary failures | Expand current E2E/Integration system; do not replace it. |

---

# 6. Current P1 / pre-Pilot engineering work

## Startup / reliability

- `LDR-002`: **Closed / verified at `33e73c6`**. Work Orders now waits for the complete core runtime before reporting ready.
- `CSB-001`: **Open.** Save/year preflight can fail outside a complete event error boundary. A later experimental patch for this area was rejected and fully rolled back.
- `JS-003` / `EXF-001`: **Initialization-recovery portion substantially closed at `98d9aa3`.** The grid now requires positive initialization acknowledgement, performs bounded retry, cleans failed partial instances, and offers manual Retry. Broader online recovery items remain under the Online Reliability package.
- `JS-002`: unsaved work must survive/guard route navigation and reload.
- `CSB-003`: Admin DB/query failures need recoverable operational boundary.

## Recovery / concurrency

- `FRC-007`: one RowVersion conflict must not sacrifice unrelated dirty work.
- `CON-002` / `CON-003`: Custom Column schema/value race and mixed schema/row snapshot require one schema-version boundary.
- `FRC-008`: Initial Admin provisioning must recover safely from partial Identity failure.

## Security

- `SEC-001`: temporary Admin password must block privileged mutations until changed.
- Custom Column title XSS remains confirmed; render user names as text.
- future API/Offline actor identity must always come from authenticated server context.

## Performance

Keep these explicit; “Stress Test” alone is not enough:

- `PERF-002`: duplicate conflict path can be O(N²).
- `PERF-003`: small Save can trigger whole-sheet reconciliation.
- `PERF-006`: search refilters on every key.
- `PERF-008`: 500+ changed cells can trigger full-grid replace.
- `PERF-009`: Undo/Redo limited by transaction count, not retained size.
- `PERF-010`: Custom Column delete can scan all Department history.
- `PERF-011`: current Save transport sends full dirty rows, not physical field deltas.
- `PERF-012`: money numeric parsing is coupled to display formatting.
- current performance runner needs valid latency probes and accepted budgets.

**Operating target:** 10k Work Orders per Department/year must be comfortable.  
**50k:** Stress/Capacity target, not normal guaranteed operating size.

## 6.1 Runtime evidence reconciliation — 2026-08-16

The post-audit sequence has now produced runtime evidence instead of relying on static findings alone.

### Verified checkpoints and safety gates

- `33e73c6`: Test Foundation strengthened and `LDR-002` fixed.
- `3dc88ff`: Open Performance, visible Real-User, and 10k Torture baselines added.
- SQL Server Integration: **25/25 PASS**.
- Full Browser Regression: **46/46 PASS**.
- Work Orders Torture: **PASS** at 10,000 rows/year after 1,000-row edit, insert, and delete abuse plus mixed Save and year switching.

### Clean open baseline — same-machine loopback

| Rows/year | Median login→usable grid | Median SQL rows query | Median server sheet load | Median browser first usable | Approx. grid data |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 965 ms | 19.6 ms | 36.2 ms | 299 ms | 299 KB |
| 5,000 | 1,535 ms | 50.9 ms | 65.5 ms | 787 ms | 1.51 MB |
| 10,000 | 2,085 ms | 75.6 ms | 111 ms | 1,299 ms | 3.02 MB |

**Interpretation:** SQL is not the dominant open-time bottleneck at 10k on the local loopback baseline. Most user-visible open cost is after the database query, in browser/data-transfer/grid preparation. This does **not** substitute for SEC-network validation.

### 10k torture evidence

The sheet survived the full abuse journey without detected data loss or browser/server errors. Final state: 10,000 active rows, zero dirty rows, and at most 60 rendered DOM rows.

High-value measured findings:

- six financial sorts: **17.4 s total**, worst browser Long Task **2.596 s**;
- edit 1,000 rows in one Excel-like paste: **3.48 s**, worst Long Task **1.399 s**;
- search/filter/sort while 1,000 rows remain dirty: **6.44 s**, worst Long Task **2.247 s**;
- Undo/Redo through the large dirty operation: about **3.2 s** each, worst Long Task about **1.3 s**;
- Save 1,000 edits: **9.32 s**, worst Long Task **1.288 s**;
- insert/fill/save 1,000 new rows and delete/save 1,000 rows completed and persisted;
- mixed Save of 250 edits + 250 inserts + 250 deletes completed and persisted;
- aggressive wheel and 1,000 keyboard navigation actions did not show the multi-second freezes seen in Sort/dirty bulk work.

### Audit finding ↔ runtime evidence status

| Finding | Status after runtime evidence | Current conclusion |
|---|---|---|
| `LDR-002` | **Closed / verified** | Loader contract test reproduces the old race and now proves Work Orders waits for the complete core runtime. |
| `PERF-002` duplicate O(N²) path | **Open — static confirmed, not quantified here** | Current torture did not intentionally create a large duplicate-conflict batch. Keep targeted measurement before closing. |
| `PERF-003` small Save whole-sheet reconciliation | **Open — not isolated** | Bulk Save is measurably expensive, but the current evidence does not isolate the small-Save reconciliation cost. |
| `PERF-006` search refilters every key | **Open — not yet measured as real typing** | Current automation uses field fill for search; it does not prove per-keystroke cost. Do not claim this finding closed or runtime-confirmed yet. |
| `PERF-008` 500+ changed cells full-grid replace | **Runtime confirmed** | 1,000-cell Paste/Undo/Redo produced >1 s Long Tasks; the 500-cell replacement threshold remains a real large-batch cost center. |
| `PERF-009` history limited by transaction count, not retained size | **Partially confirmed** | Large Undo/Redo latency is proven; retained-memory growth/budget risk still needs a dedicated long-session memory test. |
| `PERF-010` Custom Column delete scans Department history | **Open — static only** | The current performance/torture run did not exercise large historical Custom Column deletion. |
| `PERF-011` Save sends full dirty rows | **Static confirmed + runtime symptom** | 1,000-edit Save took 9.32 s, but transport/server/client shares are not yet isolated enough to attribute all latency to this finding. Narrow Delta Save remains the planned architectural fix. |
| `PERF-012` money parsing coupled to display formatting | **Strongly runtime-confirmed** | Financial Sort is the clearest current UX cliff, with a 2.596 s Long Task. Keep as a measured optimization target; do not bypass the approved remediation order without an explicit decision. |
| `PERF-013+` structural/validation cliffs | **Coverage established** | 1,000 insert/delete/mixed persistence survived; validation failure handling was also exercised during harness development. Continue targeted measurement as new cliffs appear. |

### Acceptance decision

- **Functional/capacity robustness at 10k:** PASS for the current torture scope.
- **Performance engineering baseline:** established.
- **User-experience performance acceptance:** **NOT CLOSED** because Sort and dirty bulk operations still produce visible multi-second freezes.
- **SEC real-device/network acceptance:** still pending as a later environment gate.

At checkpoint `3dc88ff`, the approved next package was **Online Reliability**. Later work completed initialization recovery, then the user explicitly reprioritized the repeatable real-user ArrowDown regression. Section 6.2 records that newer state; this is a tactical priority change, not an architecture rewrite.

## 6.2 Cross-chat runtime reconciliation — 2026-08-17

This section reconciles work completed after the `3dc88ff` Master update with the current source package and the performance handoff.

### Completed after the previous Master checkpoint

- `98d9aa3` — **Harden Work Orders initialization recovery**
  - positive browser-side initialization acknowledgement is required before the sheet is considered usable;
  - transient initialization failure gets a bounded automatic retry;
  - repeated failure leaves no partial/stale Tabulator instance;
  - manual Retry restores the requested year cleanly;
  - a dedicated browser recovery test exists in the current source.

- A later **Save/year event-boundary experiment failed its acceptance path and was fully rolled back**. It is not part of the current source and must not be reintroduced as if it were accepted work.

- `0f6bd3b` — **Optimize Work Orders financial sorting**
  - accepted runtime change is isolated in `wwwroot/js/tabulatorFinancialFields.js`;
  - repeated financial comparator work is cached by normalized sort value;
  - measured sort-storm time improved from roughly **17.4 s** to **0.56 s**;
  - worst Long Task improved from roughly **2.60 s** to **0.07 s**;
  - this is an accepted optimization and must be preserved.

- The temporary **ManualPerformanceCapture** experiment failed and was abandoned.
  - its files are absent from `ERPPrototype_Current_2026-08-17.zip`;
  - the built-in `?perf=baseline` / `?perf=deep` profiler remains the approved measurement path.

### New measured real-user navigation regression

Real Work Orders sheet measurement: **4,947 rows**.

Baseline:
- ArrowDown: average **131.8 ms**, P50 **151.4 ms**, P95 **214.7 ms**, max **237 ms**.
- Wheel up/down: approximately **17–18 ms** typical input-to-paint.
- JS heap did not show growth; rendered DOM stayed bounded at roughly **40–50 rows**.

Deep diagnostic:
- ArrowDown: average **141.69 ms**, P95 **188.5 ms**, max **221.8 ms**.
- Tabulator `onkeydown` was the largest repeated keyboard-associated script: average about **41.06 ms** across 104 measured frames.
- `tabulator.range.navigate` itself averaged only **4.84 ms**.
- `tabulator.renderer.scroll-rows` averaged about **4.09 ms**.
- 124 ArrowDown inputs produced **254 `range-changed` events** and 99 keyboard-linked scroll events.
- no memory leak was demonstrated; rendered rows remained bounded by Virtual DOM.

### Reconciliation with the older GRID-001 decision

`07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md` previously kept `GRID-001` as P2 monitoring because:
- older ArrowDown performance was acceptable to the user;
- it explicitly said to reopen the issue on a 10k test, a real complaint, or a clear regression.

Those reopening conditions are now met.

**Decision:** reopen `GRID-001` as a **current P1 Work Orders UX performance blocker** until the ArrowDown path is understood and materially improved. Do not create a duplicate issue ID for the same underlying navigation problem.

### What is proven vs not proven

Confirmed:
- ArrowDown is materially slower than wheel on the real sheet.
- the cost is a browser interaction/render problem, not a demonstrated SQL or memory-leak problem.
- slowdown becomes especially visible when navigation also requires vertical viewport movement.
- high Range activity is real and must be explained from current code.

Not yet proven:
- Virtual DOM is defective;
- duplicate `range-changed` events are themselves the root cause;
- `range.navigate` is the dominant cost;
- one application JS module is solely responsible.

**Rule:** no ArrowDown patch until the current code path is traced and the code-level cause is identified.
---

# 7. Revision to old fixed Employee model

Old reports treated “one Department Employee slot” as a fixed future invariant.

**This is superseded by the later product direction.**

Future model needs:

- multiple employees;
- organizational scope;
- operational capabilities;
- manager delegation;
- specialist workflows.

Therefore do **not** fix `CON-001` by permanently hard-coding one Employee per Department.  
Only keep true single-owner constraints where the business still requires them.

---

# 8. Save, Draft and Sync — final semantics

## Save button stays familiar

User edits → presses **Save**.

Save means:

> “These changes are approved and saved work.”

It does **not** mean “manual Sync”.

### On Save

1. approved deltas are durably saved to IndexedDB;
2. they enter Outbox;
3. user gets immediate local confirmation;
4. server synchronization is automatic when an approved sync attempt occurs.

If server is unavailable:

> **تم الحفظ محليًا — في انتظار المزامنة**

Save must not freeze waiting for the server.

## Draft

Edits before Save may be protected automatically as a compact local Draft.

After crash/reopen:

- show `Restore / Discard`;
- do not silently merge old Draft;
- Draft is not sent to server until user presses Save.

## Undo/Redo

Approved requirement: Excel-like Undo/Redo remains available after Save in the same session.

Optimize by:

- compact deltas;
- retained-data/memory budget;
- no giant row copies where avoidable.

---

# 9. Server contact policy — hard rule

## No polling

Do not query the server every:

- 30 seconds;
- 2 minutes;
- 15 minutes;
- or any fixed interval “just to check”.

Reason:

- SEC firewall/proxy visibility;
- traffic;
- performance;
- no business value while idle.

## Meaningful contact only

Primary trigger:

- **Save**.

Other permitted triggers only when useful, e.g.:

- reopening Work Orders while Pending work exists;
- real network-state change while Pending exists;
- explicit recovery/resume.

The Preflight request itself is the availability check; do not ping then Sync.

## If server is down

- keep Pending work locally;
- no timer hammering;
- retry on the next meaningful trigger.

### Accepted consequence

Because there is no continuous contact:

- account disable does not need to take effect in the same second;
- other users’ changes do not need to appear live;
- both are discovered on the next real server interaction.

This is intentional.

---

# 10. Preflight rule

A triggered Sync starts with a **tiny metadata Preflight**, not a full-sheet comparison.

Send/compare only what is required, e.g.:

- data/sync version;
- schema/config version;
- local pending operation scope.

## No relevant conflict

Sync proceeds automatically.

Example: user changed WO 123; server changed unrelated WO 555.

## Relevant/destructive conflict

Stop **before** Sync applies destructive server changes.

Example:

- server deleted Custom Column X;
- Offline device contains unsynced values in X.

User must first:

- copy;
- export;
- create replacement column;
- move to another column;
- explicitly discard.

**Server wins on approved structure; Offline user data is never silently destroyed.**

---

# 11. Offline data scope

Approved:

- cache **all authorized years for the user’s Department**, not only current year;
- initial preparation runs in background;
- after first preparation, use deltas;
- interrupted preparation resumes rather than restarting all years.

Suggested UX:

`جاري تجهيز العمل بدون إنترنت — 65%`

then:

`العمل بدون إنترنت جاهز`

If a year is not fully prepared when connection is lost, only completed local data is guaranteed Offline.

---

# 12. Offline authorization

## Trusted Login

After successful full Login:

- device/session context trusted for **7 days**;
- no Email OTP every open during the trust window;
- Logout or expiry ends trust.

After 7 days, Work Orders requires online Login again.

## Continuous Offline editing limit

Maximum Offline editing since last successful server contact: **5 hours**.

Warnings should be progressive, e.g.:

- ~1 hour left;
- 30 minutes;
- 10 minutes.

At expiry:

- no new edits;
- read/copy still allowed;
- edits already started can still be Save’d locally;
- Draft/Outbox remain safe.

## InPrivate

Offline is disabled in Edge InPrivate/Incognito because local durability is not reliable enough for this use.

---

# 13. Authentication decisions

| Decision | Final rule |
|---|---|
| Full Login | Username + Password + 6-digit Email OTP |
| Trusted period | 7 days |
| Temporary password | Minimum 8 simple characters; no forced complex mixture |
| First Login | Must change temporary password |
| Failed Login | ~5 attempts → ~15 min lockout |
| Public error | Generic `بيانات الدخول غير صحيحة` |
| Admin restart | Restart must never silently reactivate disabled Admin |

## Verification email

Email is a **verification channel**, not account identity.

- Username identifies user.
- employee/manager verification email may be shared operationally, e.g. secretary mailbox.
- Email uniqueness is not required for normal staff.
- Admin should use a private verification email.

**Risk accepted:** shared OTP mailbox is weaker than person-specific MFA; do not use it as the preferred Admin protection.

---

# 14. Offline local data model

## Performance rule

Do **not** write IndexedDB per keystroke.

Use:

- edit/cell completion;
- compact deltas;
- coalesced/batched local writes;
- no full-sheet scan per edit.

## Outbox operation should carry

- `OperationId`;
- `DeviceId`;
- stable row/business identity;
- base RowVersion;
- changed fields only;
- schema/config version where applicable.

## Lost acknowledgement

If server may have committed but response was lost:

- do not blindly re-run;
- check by `OperationId`;
- server returns receipt/status.

## Successful Sync

Heavy Outbox payload can be removed after success.  
Keep only a compact receipt/history record as needed.

Never auto-delete:

- Draft;
- Pending Outbox;
- unresolved conflict data.

---

# 15. Conflict decisions

| Scenario | Approved behavior |
|---|---|
| Same row, different fields | Auto-merge when safe |
| Same field changed | User resolves server vs local |
| 50 operations, 3 conflicts | Sync 47; preserve only 3 conflicts |
| Server rejected operation | Keep local data + show reason |
| Server deleted row, Offline edited | Do not resurrect automatically |
| Server schema changed | Server structure wins; rescue local values before Sync |
| AssignmentDate changes year | Explicit confirmation before move |

Business time zone: **Asia/Riyadh**.  
Business calendar/year: Gregorian.


## Additional approved Offline/Sync behavior

- **Create Work Order Offline:** allowed; server remains final authority for global uniqueness during Sync.
- **Delete Work Order Offline:** allowed as a Pending delete until server confirms it.
- **Save while Sync is already running:** local Save succeeds immediately and joins the next bounded Sync batch.
- **Work during Sync:** grid remains usable; Sync must not lock the whole sheet.
- **Large Outbox:** synchronize in small bounded batches.
- **Unrelated server update:** apply automatically when it does not collide with local edits.
- **Server update to a cell currently being edited:** do not overwrite under the user’s cursor; finish edit then merge/conflict-check.
- **Same unresolved conflict edited locally again:** keep the latest local value and update the existing conflict record rather than creating duplicates.
- **Logout with Pending work:** warn, allow Logout, preserve Pending data on that device/account.
- **Logout with unsaved Draft:** warn separately and allow user to Save/restore decision before exit.
- **User moved to another Department/scope:** do not purge old local data until no Draft/Outbox/Pending work depends on it; apply new authorization on next real server contact.
- **Storage pressure:** warn early; never auto-delete Draft/Outbox/unresolved work.
- **IndexedDB unavailable/fails:** switch Work Orders to clear **Online-only** mode; never pretend local protection succeeded.
- **Browser Site Data manually cleared:** unsynced local data may be lost; warn users when Pending work exists.
- **Application/local-schema update:** preserve Draft/Outbox first; if local migration fails, do not wipe the database to “fix” it.
- **Incompatible app version during Pending Offline work:** pause Sync safely, preserve local work, update/reload, then resume.
- **Status UX:** keep simple indicators such as `محفوظ محليًا`, `في انتظار المزامنة`, `جاري المزامنة`, `تمت المزامنة`, plus Pending count/last successful Sync where useful.

---

# 16. Multi-tab / multi-device

## Same browser

Use proven SEC Edge capabilities:

- BroadcastChannel;
- Web Locks.

Rules:

- tabs can notify each other;
- one Sync owner at a time;
- lock releases automatically if owning tab closes/crashes.

## Same account on several devices

Allowed.

Each device has:

- stable DeviceId;
- independent Draft/Outbox;
- same server conflict rules.

## Different users on one PC

Application data must be separated by account.

**Remaining security gate:** verify real Windows/Edge profile sharing on SEC PCs.  
If several humans use one Edge profile + DevTools, logical application separation is not strong encryption.

Do not invent browser encryption without a proper key strategy.

---

# 17. SEC workstation validation

A real SEC/SCECO workstation was tested.

## Development/access

- GitHub Codespaces opened.
- branch updated to `00503ab`.
- working tree clean.
- Release Build PASS.

## Browser capabilities

- IndexedDB: true.
- Service Worker API: true.
- Cache Storage: true.
- Secure Context: true.
- storage persistence API available.
- quota ≈ 10 GB.
- `navigator.storage.persist()` returned **false**.

Meaning: Offline works, but browser storage must not be described as permanently guaranteed against enterprise policy/eviction.

## Durability proven

- IndexedDB write succeeded.
- survived Edge close/reopen.
- survived full Power Off / Power On.
- Offline write survived close/reopen.
- cached Offline page opened without Internet.
- cached page still opened Offline after device power cycle.
- Pending Outbox survived Edge close/reopen.

## Scale test — IndexedDB only

| Synthetic local data | Write | Read | Approx storage |
|---|---:|---:|---:|
| 10k rows + 10 custom fields | 1,373 ms | 43 ms | +5 MB |
| 50k rows + 10 custom fields | 3,430 ms | 168 ms | +17 MB |

This proves local storage capacity/performance only, **not** 50k Tabulator UI performance.

## Browser coordination proven

- BroadcastChannel works both ways.
- Web Lock exclusivity works.
- lock is released when owning tab closes.
- `online/offline` browser events work.

## Local schema upgrade proven

IndexedDB v1→v2 preserved:

- old Work Order;
- Pending Outbox;
- created new store.

## Atomicity test

An explicitly aborted IndexedDB transaction committed no partial rows.

This proves transaction abort behavior, not a physical-disk crash guarantee.

## Background Sync

- API supported;
- registration works;
- Offline tag queue observed;
- tag left queue after Online return.

Full application-handler proof was blocked by Codespaces tunnel/auth/CORS behavior.

**Decision:** Background Sync is optional; correctness must not depend on it.

---

# 18. Remaining SEC network gate

Must be tested with:

1. actual SEC cable;
2. actual Staging/Production domain;
3. DNS;
4. Proxy/PAC;
5. HTTPS 443;
6. domain/category firewall filtering;
7. API requests;
8. Service Worker on real Origin;
9. SEC network ↔ external Internet switching.

Do not assume:

- Internet = server available;
- SEC network = public Internet;
- small payload = firewall allow.

Preferred transport:

- HTTPS 443;
- stable domain/origin where practical;
- small ordinary HTTP requests;
- no unusual ports;
- no unnecessary permanent connection.

Final network/API topology is not frozen until this test.

---

# 19. Custom Columns

- keep the feature;
- allow Offline structure work if required;
- server-approved schema is final;
- schema changes participate in Schema/Config Version;
- delete/type-change conflicts must protect Offline values;
- render column names as text, never trusted HTML;
- do not rebuild static metadata for every row unnecessarily;
- do not let ordinary edits trigger Department-history-wide work.

---

# 20. Excel / Clipboard

## Current direction

No dedicated Excel Import feature is required now.

Use:

- Copy/Paste from Excel into Work Orders;
- same validation rules as normal entry.

## Export

Excel Export is likely future functionality.

Protect external Excel output from Formula Injection while preserving the original stored value.

## Copy out to Excel

Clipboard output that may be pasted into Excel should also neutralize dangerous formula interpretation where required.

---

# 21. Financial ownership

Approved direction:

- Work Order Value is mandatory for real Pilot/Production data.
- legacy null values must be cleaned before strict production enforcement.
- Work Orders employee can enter/adjust the initial estimated value.
- Extracts/Invoices specialist can review/correct it so final system value is accurate.
- Partial Amount is recorded for partial extract/payment cases.
- Remaining Amount stays derived.

Recommended when this module is built: audit sensitive financial changes (`who / when / old / new`).

Do not create duplicate “final value” fields unless estimate-vs-final reporting becomes a real requirement.

---

# 22. Main Basket + specialist sub-workflows

## Main principle

**One Work Order stays the shared record.**

Main Work Orders employee keeps the **primary Basket flow**.

Do not turn every specialist detail into another main Basket.

Specialist work should become **sub-workflows/tasks linked to the same Work Order**.

## Municipality

Any Work Order with excavation/municipality requirement stays available to Municipality through its lifecycle.

Main Work Orders employee only needs the minimum action indicator, e.g.:

- `لم يتم التقديم`
- `تم التقديم`

Municipality specialist may track deeper details:

- submitted;
- review;
- rejected/resubmit;
- accepted;
- license issued;
- excavation/site completion;
- clearance (`إخلاء طرف`);
- complete.

Detailed Municipality screen/filter design is intentionally deferred.

## GIS

Specialist workflow may include:

- drawing complete;
- under approval;
- approved.

Main Work Orders sheet should not be cluttered by every GIS state.

## Execution

Same model: specialist scope linked to the same Work Order. Detailed screen later.

## Warehouse

Detailed issue/return architecture is deferred.

Temporary KPI direction:

- Issue;
- Return;
- KPI complete when both required actions are complete.

Do not invent the full warehouse solution before the real operation is studied.

---

# 23. Roles and permissions

## Admin

- primary Admin expected to be one person operationally;
- Admin credentials are not shared with managers;
- Admin creates/disables accounts;
- Admin private OTP email preferred.

## Managers

Managers may grant/revoke **operational capabilities** to employees under their scope.

Example:

- employee A normally handles invoices/final close;
- A is absent;
- manager grants capability temporarily to Work Orders employee B;
- permission can expire automatically.

## Guardrails

Manager cannot:

- grant a capability they do not own;
- grant outside allowed organizational scope;
- create unrestricted Admin;
- bypass server authorization.

Account creation/disable remains Admin unless later explicitly changed.

All grant/revoke/delegation actions are Audit Logged.

## Architecture implication

Future access should be based on:

- account identity;
- Branch/Department/organizational scope;
- operational capabilities;
- server authorization policies;
- optional time-bounded delegation.

Avoid creating dozens of fixed technical roles for every specialist action.

---

# 24. Production decisions

Approved:

- central SQL Server.
- DB outage shows simple operational error.
- prepared Offline Work Orders remain locally usable within Offline rules.
- Production update requires Build + normal Tests + Stress.
- automatic DB Backup.
- real restore test.
- Staging/Test environment.
- failed DB Migration cannot leave half-upgraded running app.
- core seeding/provisioning is controlled/one-time, not blindly repeated every Startup.
- operational Logs avoid unnecessary full Work Order payload.
- limited Pilot before broad Production.

Still pending before Production:

- Deployment/Operations review.
- dependency/version/vulnerability/license review.
- CI gate.
- reverse proxy / `AllowedHosts`.
- production Initial Admin provisioning/recovery.
- final backup/restore cadence.
- final hosting/network topology.
- final OTP mail provider/SMTP route.

---

# 25. Test acceptance strategy

## Normal operation first

Before Stress, prove real daily use:

- Login / OTP / forced password change.
- open Work Orders.
- current/old years.
- keyboard/mouse.
- Copy/Paste.
- insert/delete.
- Save.
- Draft restore.
- Undo/Redo.
- search/filter/sort.
- Baskets.
- financial calculations.
- Custom Columns.
- hide/unhide/layout.
- permissions.
- navigation away/back.
- Wide/Split/Zoom regression.
- Sync/Offline once implemented.
- localization once implemented.

Unexpected `console.error`, failed request, or page error should fail the relevant browser test unless explicitly expected.

## Performance

After `LDR-002`, establish trustworthy baseline for:

- open/ready;
- navigation;
- search/filter/sort;
- paste;
- Undo/Redo;
- small Save;
- bulk Save;
- year switch;
- Basket;
- Custom Columns;
- browser memory;
- payload sizes;
- server CPU/SQL where practical.

## Offline/Sync Stress

Include:

- 10k target / 50k capacity.
- thousands of Pending operations.
- network drop/return/flapping.
- slow/down server.
- Save during Sync.
- Tab/Edge close.
- Power Off.
- multiple tabs/devices.
- row/field conflicts.
- server delete vs Offline edit.
- schema conflict.
- lost post-commit acknowledgement.
- duplicate OperationId retry.
- IndexedDB migration/failure.
- storage pressure.
- 5-hour Offline expiry.
- 7-day Login expiry.
- application update with Pending data.
- permissions changed while Offline.

**Acceptance rule:** functionally correct but materially slower Work Orders = **not accepted**.

Performance acceptance requires **both** trustworthy engineering measurements and a visibly smooth employee workflow in the primary **Split Screen 100%** scenario. A benchmark-only PASS does not close the Performance gate; representative SEC Edge/network validation remains a later environment gate.

---

# 26. Mandatory performance rules

1. no full-sheet scan after every edit.
2. no full-row network payload for one changed field.
3. no full-year upload on Save.
4. no full-grid rebuild for ordinary small deltas.
5. no IndexedDB write per keystroke.
6. batch/coalesce local persistence.
7. Sync in bounded small batches.
8. apply server deltas only to affected rows/cells.
9. user Save work has priority over large background downloads.
10. one browser Sync owner via Web Lock.
11. no fixed server polling.
12. measure before/after every structural stage.

---

# 27. Remediation packages

## A — Test + measurement safety net

- real-user E2E;
- diagnostics fail rules;
- failure injection;
- responsive matrix;
- Custom Column browser workflow;
- C#↔JS contract;
- valid performance budgets.

## B — Loader/startup/recovery reliability

- `LDR-002`;
- positive initialize contract;
- retry/cleanup;
- Save/year event boundaries;
- Admin error boundary.

## C — Narrow Save/data contract + performance

Target:

```text
Existing update:
  identity + base RowVersion + changed fields only

New row:
  required business fields

Delete:
  identity + base RowVersion

Result:
  OperationId/receipt
  new Id if needed
  new RowVersion
  routing/order changes
  server-normalized changed values only
```

Also address measured high-value performance findings.

## D — Concurrency/schema integrity

- Department Schema/Config Version.
- coherent schema+row load.
- conflict-preserving partial processing.
- Custom Column races.
- year confirmation.
- new flexible account/permission invariants.

## E — Identity/security/permissions

- forced password invariant;
- OTP;
- lockout;
- Admin hardening;
- server-derived actor identity;
- Custom Column XSS;
- Audit Log;
- manager capability delegation foundation.

## F — Localization identity foundation

Before durable Offline schema is frozen:

- stable Basket codes;
- stable Department Type codes;
- stable specialist workflow codes;
- canonical typed date/money;
- stable result/error codes;
- Arabic/English resources;
- dynamic `lang/dir`.

## G — Offline durability + Sync

- IndexedDB.
- Service Worker.
- all authorized years.
- Draft + Outbox.
- DeviceId + OperationId.
- receipts/idempotency.
- 5h Offline / 7d trust.
- event-driven Preflight.
- partial Sync/conflicts.
- multi-tab Web Lock.
- safe local migrations.
- Background Sync optional.

## H — Production operations

- CI.
- Staging.
- deployment/migration/restart procedures.
- backup/restore.
- dependency/license/security review.
- production provisioning.
- SEC network/domain qualification.
- Pilot.

---


# 27A. Secondary audit findings retained — do not lose during implementation

The Master is intentionally concise, but these audit items remain active evidence and must not disappear merely because they are not separate work packages:

| Area / IDs | Retained action |
|---|---|
| `FRC-010`, `FRC-011`, `FRC-016` | Initial load/year-switch/loader failure must have clean retry/recovery and not destroy the previously usable state. |
| `FRC-012` | 8 MiB Save boundary is a symptom of the broad transport contract; narrow deltas should remove the normal risk and tests must prove bulk behavior. |
| `FRC-013` | Custom Column browser mutations must become failure-atomic/recoverable. |
| `FRC-015` | Password change + clearing forced-password state must not leave a partial two-write security state. |
| `SEC-004` / login disclosure | Public Login must not reveal whether a username exists. |
| `SEC-005` / diagnostics | Employee-visible diagnostics must not expose unexpected internal exception detail. |
| `DBI-001` | AssignmentDate remains a **date-only** business value; do not allow time components through future API/import paths. |
| `DBI-002` | Before uncontrolled new write paths, consider SQL enforcement of WorkYear bounds and AssignmentDate↔WorkYear consistency after validating existing data. |
| `DBI-003` | Consider SQL JSON-validity hardening for CustomValues before Production/external writers; do not treat it as current P1. |
| `PR-11` | Opposite concurrent cross-year moves need deadlock/retry testing and user-safe retry UX. |
| `PR-07` / session concurrency | Multi-tab/multi-device and long-session resource behavior must be included in capacity/security testing. |
| `LDR-001` / profiler lifecycle | Performance instrumentation must stop cleanly when no longer requested so measurements are not contaminated. |
| `PERF-013+` structural/validation cliffs | Keep measurement coverage for validation errors, insert/delete, rare DisplayOrder rebalance, and other whole-sheet cliffs found in the detailed Performance Audit. |
| `TST-003..005`, `TST-018..019` | Keep test isolation/CI/test-code maintainability/runner consistency work; do not let a growing E2E monolith become the next maintenance bottleneck. |
| `UI-001`, `TST-016` | Direction/culture testing must be parameterized when bilingual work begins; numeric/code columns may intentionally stay LTR. |
| Production perimeter | `AllowedHosts`, reverse proxy, TLS, secrets, dependencies, vulnerabilities, licenses, backup/restore and deployment remain Production gates. |

### Business decisions that remain intentionally deferred, not forgotten

- `PR-14`: do **not** invent a strict sequential main-Basket state machine now. Keep the current main Basket behavior and implement specialist sub-workflows as their modules are designed.
- Inspection-note classification/department attribution remains deferred to KPI/workflow design; do not add a new Department responsibility now.
- Detailed Warehouse solution remains deferred.

# 28. Final implementation order

1. ✅ **Canonicalize post-audit documentation.**
2. ✅ **Expand the normal test safety net.**
3. ✅ **Fix `LDR-002`.**
4. ✅ **Establish clean Open / Real-User / 10k Torture performance baselines.**
5. ▶ **Current: identify and fix the reopened ArrowDown / `GRID-001` regression** using current code only; no patch before cause, then re-measure with baseline median + focused deep confirmation.
6. **Resume Online Reliability** — continue from the accepted initialization recovery checkpoint; next open area is Save/year event-boundary recovery (`CSB-001`) plus remaining `JS-002` / `CSB-003`.
7. **Build narrow physical Delta Save + receipt-compatible contract.**
8. **Close schema/concurrency/conflict gaps.**
9. **Build Identity/security/permission foundation.**
10. **Introduce stable language-neutral business codes.**
11. **Add durable IndexedDB Draft/Outbox.**
12. **Add event-driven Sync/Preflight/conflict engine.**
13. **Run extended normal regression + Offline/Sync Stress.**
14. **Staging + real SEC domain/cable/firewall qualification.**
15. **Limited Pilot.**
16. **Production only after operational gates pass.**

The ArrowDown item is a user-approved tactical insertion because a repeatable core-UX regression was measured. It does not cancel the post-audit architecture roadmap.

Do not jump directly to Offline implementation before the Save/client contract and tests are trustworthy.

---

# 29. Future-feature guardrails

Current foundation must not block:

- Municipality;
- GIS;
- Execution;
- Extracts/Invoices;
- Warehouse later;
- manager delegation;
- manager KPI/alerts;
- Arabic/English.

But do **not** prematurely implement their full screens/workflows now.

Core model:

```text
One Work Order
  ├─ Main Basket
  ├─ Municipality sub-workflow
  ├─ GIS sub-workflow
  ├─ Execution sub-workflow
  ├─ Extracts/Invoices sub-workflow
  └─ Warehouse sub-workflow later
```

Each specialist sees what they need; main Work Orders employee sees only the minimum specialist indicator required to act.

---

# 30. Superseded old decisions

| Old assumption | Current decision |
|---|---|
| Account disable must be instantaneous without server contact | Enforce on next real server interaction; no polling |
| Sync immediately because Internet returned | Sync on meaningful trigger + Preflight |
| One Department Employee is permanent future model | Flexible employees/capabilities |
| Cache only current year | Cache all authorized Department years |
| Ban Offline Custom Column structure changes | Allow with schema-version conflict protection |
| Save means server Sync | Save = approved durable local work; Sync is automatic |
| Email must be unique for OTP | Username is identity; staff verification email may be shared |
| Excel Import required | Not required; Copy/Paste is enough now |
| Background Sync required | Optional only |
| Admin needs a separate “revoke trusted device” management feature | Rejected for now; rely on 7-day trust, 5-hour Offline lease, and next server verification |
| Every specialist state becomes a main Basket | Use specialist sub-workflows |

---

# 31. Remaining genuine open items

## Gates, not current product questions

- real SEC cable + domain + Proxy/Firewall.
- final hosting/network topology.
- Deployment/Operations review.
- dependency/version/vulnerability/license review.
- CI.
- final backup schedule.
- OTP mail provider.
- shared SEC browser-profile reality.
- quantitative and manual Work Orders performance sign-off on the selected RevoGrid integration; `GRID-001` remains open until real cutover.

## Deliberately deferred feature detail

- Municipality screen/filter UX.
- GIS UX.
- Execution queue UX.
- detailed Extracts module.
- detailed Warehouse solution.
- final KPI formulas.
- exact specialist permission matrix as those modules are built.

These do not block the current engineering foundation.

---

# 32. Release rule

A build is not approved merely because it compiles or one test passes.

Required, as applicable:

1. normal full E2E passes;
2. authorization/security passes;
3. concurrency/recovery passes;
4. performance budgets pass;
5. Offline/Sync Stress passes;
6. responsive matrix passes;
7. Staging passes;
8. SEC environment/network gate passes;
9. backup/restore passes before Production.

---

# 33. Current next action

**Current task: Gate 5A — isolated Blazor + RevoGrid Community 4.25.2 real-data integration.**

Required sequence:

1. preserve the live `/work-orders` Tabulator route unchanged;
2. pin RevoGrid to exact `4.25.2`; do not use `latest`;
3. create an isolated Blazor route/component for RevoGrid;
4. load through the **real existing employee/year read path** (`LoadSheetAsync`) rather than a new duplicate query;
5. map core fields + custom-column definitions/layouts without changing database schema;
6. measure the real Blazor → browser transfer, initialization, scroll and memory with realistic 10k shape;
7. confirm year switch/disposal does not duplicate state/listeners;
8. no production Save mutation in Gate 5A.

After Gate 5A:

**Gate 5B — Save/ERP behavior**

- real Dirty/Delta collection;
- existing server validation/authorization/transaction authority;
- temporary Id → saved Id + RowVersion reconciliation;
- duplicate/concurrency/moved-year result mapping;
- Undo/Redo after Save;
- custom-column/layout persistence.

Then:

**Gate 5C — visual/regression/cutover**

- frozen Row/Header/Font/KPI/Selected-bar dimensions;
- Split + RTL + Zoom;
- full automated/manual regression;
- self-hosted exact package + MIT license;
- controlled `/work-orders` switch;
- only after accepted cutover: remove obsolete Tabulator runtime in a separate cleanup checkpoint.

**Do not resume broad Offline work before the selected grid is integrated and the Online Work Orders foundation is stable.**

---

# 34. Evidence sources retained

Key source documents:

- `12_ENGINEERING_AUDIT_REPORT_FINAL_SYNTHESIS_2026-08-14.md`
- `14_FINAL_CROSS_AUDIT_SYNTHESIS.md`
- Architecture Red-Team
- Code Simplicity
- Execution Flow
- Performance Cost
- State & Ownership
- Failure / Recovery
- Data-flow & Serialization
- Concurrency & Multi-user
- Maintainability
- Testability
- Security-by-design
- Offline + Localization Readiness
- Technology Fit

Post-audit product decisions and real SEC workstation validation through **2026-08-16** are consolidated here.


### Added reconciliation evidence — 2026-08-17

- `ERP_Performance_Handoff_2026-08-17.md`
- `UDS_Performance_baseline_2026-08-17T12-36-56-342Z.json`
- `UDS_Performance_deep_2026-08-17T12-39-47-021Z.json`
- `ERPPrototype_Current_2026-08-17.zip`
- captured Git/log/build conversation through financial-sort checkpoint `0f6bd3b`
- `ERPPrototype_Current_Review_2026-08-20.zip` with Git state at `dc0b2b0`
- `wwwroot/grid-shootout/REVOGRID_FROZEN_BASELINE_2026-08-20.json`
- RevoGrid Gate 3 / Gate 4F / 4H / 4I / 4J isolated test artifacts and the accepted user-run JSON evidence
- Univer U1/U1B/U1C comparison evidence; U1C records native end-of-sheet row growth
