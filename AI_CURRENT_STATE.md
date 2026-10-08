# AI CURRENT STATE

Updated: 2026-10-06
Mission: REVO-COLUMN-WIDTH-RECOVERY-20260917
Mission status: **OPEN**
Stage: native LTR Width ACCEPTED manually; W05/W06, mojibake, Width persistence, 4 cleanup items, Find (DEC-072) and Open KPI (DEC-073) are AUTOMATION_GREEN / MANUAL_PENDING. All uncommitted.

Kept short on purpose (2026-10-06). Full pre-compaction detail: AI_WORK_LOG.md "2026-10-06 - Current State compacted". Read the Work Log only when a task needs it.

## Workflow guard

- One General Modification Gate (Documentation/AI_WORK_CYCLE.md) before Product edits: freeze Expected, same independent oracle RED -> GREEN.
- Visible interactions: real browser input + rendered DOM/geometry; store state is supplementary only.
- Classify every RED: PRODUCT, TEST/HARNESS, BUILD/STALE, TOOLING, ENVIRONMENT. `UNCLASSIFIED` blocks Product edits; two failed corrections on one interaction force forensics first.
- States: `GATE_RED` -> `AUTOMATION_GREEN` -> `MANUAL_PENDING` -> `ACCEPTED`.
- No commit or push without user authorization.

## Live state

- Accepted baseline commit: `2101f41`. Width checkpoint `7b62e58` is superseded (was RTL, manual RED). Uncommitted work backed up on local branch `wip/backup-20261005`.
- Sheet is fixed LTR, surrounding UI Arabic (DEC-071). Width persists per department, with Dirty + one History action (Tabulator parity).
- Not covered yet: Width Auto Fit; stale width RowVersion conflict; Escape mid-drag (tool cannot hold the mouse).
- Integration 37 cannot run on this machine alongside E2E (single-file LocalDB, ENVIRONMENT).

## Next action

1. MANUAL (user): `ERPPrototype/Documentation/MANUAL_TEST_BATCH_2026-10-06.md` - 37 checks (G = Find, H = Open KPI need launch config `erp-find-3years`; recreate with `--find-seed-manual` if data changed).
2. User decision: keep or delete untracked `Components/Pages/WorkOrdersRevoGridLiveResizeLab.razor` (it blocks the full regression preflight). Then run the full regression script.
3. User authorization for 3 separate checkpoint commits: LTR Width; the four cleanup items; Parity A+B (Find + KPI).
4. NEXT = Parity C, Selection summary bar, through the gate, per DEC-074 (row-based, reserved bottom slot with hint under 2 orders, half-screen readable). Reference: tabulatorAggregates.js renderSelectionAggregate. Reuse the 3-year findScenario seed and revoGridVisibleAggregates.js as the single totals owner. Then D = Basket panel per DEC-074 (side panel like Tabulator, show/hide button, workflow order).
5. Then cleanup priority: self-host/pin Revo + security headers/CDN trust; Revo long-session/performance gate; architecture cleanup last.

Machine: run from PowerShell; `ERP_TEST_SQLSERVER_CONNECTION` with `AttachDbFilename=%USERPROFILE%\LocalDBData\<name>.mdf`; `ERP_E2E_BROWSER_CHANNEL=chrome`; `dotnet` not on PATH (`C:\Program Files\dotnet`); stop the manual app (port 5265) before building.

## Current mission

Native LTR Width accepted; everything else AUTOMATION_GREEN / MANUAL_PENDING and uncommitted. Next: user manual batch, Live Resize Lab decision, checkpoint commits, then Parity C (Selection summary).
