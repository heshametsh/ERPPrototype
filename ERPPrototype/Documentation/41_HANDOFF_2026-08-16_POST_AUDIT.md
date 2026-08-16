# 41 — Handoff 2026-08-16 — Post-Audit / Pre-Remediation

**Purpose:** give the next chat/engineer a safe starting point without rereading the entire conversation.

## Exact baseline

- Repository/source baseline: `00503ab` — `Remove unused Work Orders JavaScript APIs`.
- Branch: `codespaces-sync-2026-08-08`.
- Original source archive SHA-256: `eaced3c330d33bf931d0d34feab63f770cc4627b0d304270e23de2aa02118e76`.
- SEC Codespaces Release Build: PASS.
- This handoff ZIP contains **documentation-only updates** on top of the source archive. Runtime source is not intentionally changed.

## Mandatory read order

1. `12_ENGINEERING_AUDIT_REPORT.md`
2. `ERP_AUDIT_PROTOCOL.md`
3. `00_DOCUMENTATION_INDEX.md`
4. `03_CURRENT_IMPLEMENTATION.md`
5. `06_REGRESSION_TEST_CHECKLIST.md`

## Where we are

- all planned independent engineering audits completed;
- final cross-audit synthesis completed;
- post-audit product decisions substantially completed;
- extensive real SEC-browser feasibility tests completed;
- no Runtime remediation implemented yet.

## First implementation work

**Do not start Offline first.**

Sequence:

`Test Foundation → LDR-002 → Clean Performance Baseline → Online Reliability → Narrow Save/Delta/Receipt Contract → Concurrency/Security/Localization → Offline/Sync`

## Non-negotiable product rules

- Work Orders visual sizes are frozen.
- Split Screen is primary real usage.
- performance is a hard acceptance gate.
- no fixed server polling.
- Save remains the user’s familiar explicit action.
- durable Draft/Outbox protects local work; Sync is automatic/background behavior.
- 5h continuous Offline edit limit; 7d trusted Login.
- cache all authorized Department years.
- server-approved sheet structure wins, but Offline user values are never silently destroyed.
- main Basket stays simple; Municipality/GIS/Execution/Extracts/Warehouse become specialist sub-workflows as implemented.
- manager permissions are operational capabilities/delegations within scope, not shared Admin access.

## SEC validation already proven

On a real SEC workstation:

- Codespaces works;
- IndexedDB persists across browser close and Power Off/On;
- Service Worker/Cache can reopen test page Offline after power cycle;
- 10k and 50k local IndexedDB scale tests succeeded;
- BroadcastChannel/Web Locks work;
- lock recovery after tab close works;
- Offline Outbox survives browser close;
- browser online/offline events work;
- IndexedDB schema migration preserves Pending data.

Still open:

- real SEC cable + real domain + Proxy/Firewall/443/API test;
- production-Origin Background Sync proof (optional feature, not correctness dependency).

## Important future product structure

One shared Work Order remains the core record.

- Main Work Orders employee owns the general/main Basket flow.
- Municipality: specialist lifecycle for permit/license/clearance; main employee sees only minimal indicator needed to act.
- GIS: specialist fields/statuses such as drawn / under approval / approved.
- Execution: specialist linked scope.
- Extracts/Invoices: reviews/corrects financial value; details later.
- Warehouse: detailed solution deferred; temporary KPI remains Issue/Return.

Do not design all specialist screens now. Only ensure the foundation does not block them.

## Next-chat instruction

Before changing Runtime code:

1. verify baseline/source;
2. read Master + Protocol;
3. inspect current tests/code independently for the Test Foundation task;
4. make the smallest justified change;
5. measure before/after;
6. keep documentation updated with every accepted decision.
