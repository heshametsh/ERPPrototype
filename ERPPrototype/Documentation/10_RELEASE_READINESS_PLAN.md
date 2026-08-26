# CURRENT RELEASE READINESS OVERRIDE — 2026-08-26

## Gate R0 — Revo Production Candidate — OPEN

Before `/work-orders` cutover:

- ✅ unified validation complete at `6a6f3ce`.
- real DB Save complete.
- `RowVersion`/concurrency identity complete.
- snapshot-safe Save acceptance proven.
- server validation/duplicate/scope failure mapping proven.
- edit during in-flight Save does not get falsely marked clean.
- custom columns/layout and high-value employee workflow accepted.
- exact Revo assets pinned/self-hosted.
- target browser qualification.
- 10k accepted on target office-class hardware.
- reconnect/failure journeys accepted.
- real-browser diagnostics are acceptance failures, not logging-only.
- exact row identities verified for structural operations.
- rollback checkpoint retained.

## Gate R1 — Online Work Orders Production Safety

Before real production:

- current security review findings closed/verified.
- disabled Admin cannot be silently reactivated by startup behavior.
- user-controlled header/text rendering is safe.
- privilege-sensitive operations recheck server authority as required.
- Save outcome after disconnect/commit boundaries is recoverable/deterministic.
- backup/restore and deployment rollback procedure exists.
- database migration plan tested.
- monitoring/logging/support evidence exists.

## Gate R2 — Business Governance Before Expanded Modules

Before specialist modules create irreversible business history:

- durable Business Audit foundation implemented.
- downstream interaction can be determined reliably.
- BranchManager-sensitive identity/delete rules implemented.
- Closure/Reopen rules implemented.
- role/scope matrix matches `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

## Gate R3 — Multi-user / Multi-branch Expansion

Before wide rollout:

- more than one Employee per Department supported where business requires.
- department/module extensibility no longer depends on current four fixed department types.
- ProjectManager global read-only view implemented.
- BranchManager branch scope implemented.
- capacity tests reflect realistic concurrent-user counts.

## Gate R4 — Specialist/Field Expansion

Before large Municipality/Execution/Field rollout:

- Work Order remains one shared identity.
- specialist modules do not duplicate Master records.
- documents/evidence have intentional storage model.
- field/offline security and sync rules are approved before implementation.
- SEC real network/domain/firewall qualification remains mandatory.

---

# 10 — Release Readiness Plan

**Status:** Current approved gates  
**Last update:** 2026-08-20

## Gate 0 — Engineering Remediation Baseline — **PASS / CHECKPOINTED**

Evidence:

- current docs canonicalized;
- original audit Runtime remains traceable to `00503ab`;
- normal E2E safety net expanded;
- `LDR-002` fixed and contract-tested at `33e73c6`;
- clean Open/Real-User/Torture performance baseline established;
- later accepted checkpoints include `98d9aa3` initialization recovery and `0f6bd3b` financial sorting;
- current source ZIP contains those accepted runtime changes and no ManualPerformanceCapture remnants;
- SQL Integration / Full Browser / 10k Torture safety evidence was passed at the accepted checkpoints described in the Master.

Gate 0 PASS means the measurement foundation is trustworthy. It does **not** mean Work Orders UX performance is accepted: measured Sort/dirty bulk freezes remain open and Gate 1 still requires comfortable 10k use.

## Gate 0.5 — Work Orders Grid Engine Migration — **OPEN**

RevoGrid Community 4.25.2 is selected, but Lab qualification is not production qualification.

Required before `/work-orders` cutover:

- Gate 5A isolated Blazor + real employee/year data path passes;
- Gate 5B real Dirty/Delta Save + validation + RowVersion + custom-column/layout behavior passes;
- Gate 5C frozen visual parity + full regression + performance passes;
- exact RevoGrid 4.25.2 assets are pinned/self-hosted and MIT license retained;
- Tabulator remains available as rollback until the accepted cutover checkpoint;
- no production database is used for destructive qualification.

## Gate 1 — Stable Online Work Orders

Required:

- normal full Work Orders journeys pass;
- no unexpected browser console/page/failed-request errors;
- Save/initialization/recovery boundaries stable;
- narrow Save/Delta contract proven;
- concurrency/security P1s closed;
- 10k target measured comfortably;
- `GRID-001` closed by an accepted Work Orders grid solution; current planned closure path is RevoGrid Gate 5 + cutover rather than further Tabulator micro-patching;
- performance acceptance includes both engineering numbers and a smooth visible employee workflow in the primary Split Screen 100% case. A benchmark-only PASS is not sufficient.

## Gate 2 — Offline/Sync Engineering Qualification

Required:

- IndexedDB Draft/Outbox;
- Service Worker production Origin;
- all authorized Department years prepared/resumable;
- 5-hour Offline lease / 7-day Login trust;
- OperationId/receipts/idempotent retry;
- Preflight + partial Sync + conflicts;
- schema conflicts protect user data;
- multi-tab/multi-device behavior;
- extended normal tests + Offline/Sync Stress;
- no material Work Orders performance regression.

## Gate 3 — SEC Environment Qualification

Required on real environment:

- real SEC cable;
- Staging/Production domain;
- DNS + Proxy/PAC + firewall/category behavior;
- HTTPS 443/API;
- SEC network ↔ external Internet switching;
- real Origin Offline behavior;
- OTP mail route;
- actual shared-PC/browser-profile security reality.

## Gate 4 — Controlled Pilot

Required:

- limited users;
- required permissions/capabilities for Pilot;
- Audit Log for sensitive actions;
- Staging passed;
- CI release gate;
- backup + **real restore test**;
- production migration/restart safety;
- logging/error handling;
- performance/security/concurrency/recovery acceptance;
- support/user guidance.

## Gate 5 — Production / Commercial

Required:

- Deployment/Operations review complete;
- dependency/version/vulnerability/license review complete;
- host/reverse-proxy/TLS/secrets configuration reviewed;
- backup/restore cadence operational;
- monitoring/incident procedure;
- Pilot evidence accepted;
- no open P0/P1 blockers unless explicitly business-accepted.

## Hard release rule

Build PASS وحده لا يكفي. يجب نجاح:

1. normal full E2E;
2. authorization/security;
3. concurrency/recovery;
4. performance budgets;
5. Offline/Sync Stress when affected;
6. responsive matrix;
7. Staging;
8. SEC environment gate;
9. backup/restore before Production.
