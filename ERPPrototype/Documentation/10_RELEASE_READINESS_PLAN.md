# 10 — Release Readiness Plan

**Status:** Current approved gates  
**Last update:** 2026-08-16

## Gate 0 — Engineering Remediation Baseline — **PASS / CHECKPOINTED**

Evidence:

- current docs canonicalized;
- original audit Runtime remains traceable to `00503ab`;
- normal E2E safety net expanded;
- `LDR-002` fixed and contract-tested at `33e73c6`;
- clean Open/Real-User/Torture performance baseline established;
- current checkpoint `3dc88ff`;
- SQL Integration 25/25 PASS; Full Browser 46/46 PASS; 10k Torture PASS.

Gate 0 PASS means the measurement foundation is trustworthy. It does **not** mean Work Orders UX performance is accepted: measured Sort/dirty bulk freezes remain open and Gate 1 still requires comfortable 10k use.

## Gate 1 — Stable Online Work Orders

Required:

- normal full Work Orders journeys pass;
- no unexpected browser console/page/failed-request errors;
- Save/initialization/recovery boundaries stable;
- narrow Save/Delta contract proven;
- concurrency/security P1s closed;
- 10k target measured comfortably;
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
