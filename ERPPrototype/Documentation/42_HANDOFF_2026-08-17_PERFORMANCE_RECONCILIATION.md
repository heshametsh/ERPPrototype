# 42 — Handoff 2026-08-17 — Cross-Chat Reconciliation / ArrowDown

## Source hierarchy

1. Current source code in `ERPPrototype_Current_2026-08-17.zip` for what is actually implemented.
2. `12_ENGINEERING_AUDIT_REPORT.md` after this reconciliation for current engineering decisions/status.
3. `ERP_AUDIT_PROTOCOL.md` for future independent audits.
4. Performance handoff + baseline/deep JSON as measured evidence.
5. Older handoffs/change summaries are historical when they conflict with the above.

## Current accepted runtime state

- Audit baseline: `00503ab`.
- Test Foundation + `LDR-002`: completed (`33e73c6`).
- Performance/torture baseline: completed (`3dc88ff`).
- Initialization recovery: completed (`98d9aa3`).
- Financial sort optimization: completed and accepted (`0f6bd3b`).
- Failed Save/year experiment: rolled back; not current.
- ManualPerformanceCapture experiment: removed; not current.
- Current ZIP contains the accepted sort optimization and initialization recovery and no ManualPerformanceCapture remnants.

## Current measured problem

Real sheet (~4,947 rows):
- ArrowDown baseline P95: 214.7 ms.
- Wheel: ~17–18 ms typical.
- Deep ArrowDown P95: 188.5 ms.
- Tabulator onkeydown contributes meaningful repeated work.
- RangeChanged activity is high.
- No JS heap leak demonstrated.
- Virtual DOM row count remains bounded.

This reopens the old `GRID-001` issue because its own reopen condition was met: real complaint + repeatable regression.

## Current task

Trace from current code only:

`ArrowDown → Tabulator range/navigation → range-changed callbacks → automatic vertical scroll → virtual render/layout/paint`

Do not assume:
- duplicate Range events are the root cause;
- Virtual DOM is defective;
- `range.navigate` is dominant;
- any one JS module is guilty.

No patch before the cause is identified.

## Acceptance

- Excel-like navigation unchanged.
- frozen UI sizes unchanged.
- Undo/Redo and data correctness unchanged.
- accepted financial-sort optimization preserved.
- safety suites pass.
- manual Split Screen 100% feels materially better.
- compare multiple `?perf=baseline` runs by median.
- use `?perf=deep` only for focused confirmation.
- destructive tests remain isolated from the real database.

## After ArrowDown

Resume:
`Online Reliability → Narrow Save/Delta/receipt → Concurrency/Security/Localization → Offline/Sync`.
