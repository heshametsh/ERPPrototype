# AI CURRENT STATE

Updated: 2026-09-07
Mission: CC-YEAR-001

## Current mission

Finish year-scoped Custom Columns on the accepted Revo Gate 5C-1 surface, then run a deliberately reviewed automated closure suite. Test hardening must not introduce new or parity behavior without a feature-specific reference pass and user approval.

## Authority

1. Current Git/worktree + current code + executed evidence.
2. Latest user-approved behavior.
3. This compact state.
4. Current canonical documentation.
5. `AI_WORK_LOG.md` chronology.
6. Historical handoffs.

## Approved behavior

- Every Work Year owns its own Custom Columns like an independent Excel sheet.
- Add/Rename/Delete affect the current year only.
- Moving a Work Order to another year preserves every non-empty custom value.
- Destination same name + same type: reuse it.
- Destination missing: create it automatically.
- Destination same name + different type: create one safe unique destination name and reuse it for the batch.
- Blank custom values do not create destination definitions.
- Cross-year Save keeps one user confirmation.
- Destination-definition creation, value remapping, and row movement succeed or roll back together.
- Width/visibility layout remains department-scoped by DepartmentId + FieldKey.

## Accepted foundation

Do not reopen without regression evidence:

- B11 snapshot-safe Save.
- B12 real DB Save.
- Selection Core V4R3.
- RowVersion optimistic concurrency rejection.
- Edit-while-Save preservation.
- Persisted Delete/re-add identity.
- Cross-year transactional Save.
- Gate 5C-1 visible aggregates.

## Current proven evidence

- Safe checkpoints: `07ea8d4` (year-scoped Custom Columns Phase 1) and `8693532` (project memory/workflow).
- Preserved Revo Custom Column persistence/history remains protected at `stash@{0}` and was reconnected with `stash apply`.
- SQL Core before reconnect closure: **32/32 PASS** plus populated legacy migration PASS.
- Revo Employee Real Workday baseline: scenarios **00-17 PASS**.
- Real local DB migration was protected by a verified backup, applied, and post-checked.
- User manual PASS after reconnect/fixes:
  - Add + value + Save + reload;
  - year isolation and A→B→A switching;
  - persisted valued-column Delete + Save without forced Refresh/false layout conflict;
  - cross-year custom-value movement;
  - auto-created destination Custom Columns no longer appear before the core columns and preserve sensible relative order.

## Open acceptance

- Automated closure is now **partially executed** after the latest reconnect/order fixes: test-hardening V2 applied cleanly, E2E + Integration builds PASS, and SQL Core is **34/34 PASS**. The first hardened real-browser run reached Gate 5C-1 correctly, passed runtime/surface/update checks, then stopped in the test harness before the Custom Column Save because the old test typed a Basket literal (`مراجعة`) that the current page correctly rejected as invalid.
- Rename remains an approved behavior requirement, but its current Revo user-facing parity has **not** been accepted in this cycle.
- A prior closure-hardening proposal attempted to add a Revo Rename command while reviewing tests. That candidate is **not accepted and must not be applied as product truth** until the feature-specific reference pass is completed and the user approves the recovered behavior.
- The next reference pass must inspect the existing Tabulator Custom Column commands/edge cases, current Revo Community mechanics/integration, and ERP ownership before any Rename or other column-menu parity change.

## Workflow correction — hard rule

The assistant incorrectly crossed from “review/strengthen tests” into “add employee-visible behavior” without first asking the user and without performing the specific Tabulator reference pass. This is a workflow failure, not an accepted product decision.

From now on:

1. test review may extend existing harnesses, diagnostics, and assertions;
2. when a missing UI capability is discovered, stop and classify it as a product/parity gap;
3. if that capability exists or may exist in Tabulator, inspect the exact Tabulator behavior first;
4. compare Revo Community mechanics/source/docs and current ERP ownership;
5. explain the recovered behavior to the user and get approval;
6. only then change runtime product code;
7. resume test hardening afterward.

## Runtime freshness

For user manual ERP runs after source changes: stop the listener, remove app `bin/obj`, build the real project, do not run after Build failure, run without `--no-build`, open a new tab, and verify the active JS module version when relevant.

## Current test-hardening review

The user explicitly asked to finish test review/hardening before returning to Tabulator/Revo feature-parity work. No Rename/product implementation is part of the current test candidate.

Reviewed gaps in the existing closure harness:

- Gate5B12 still opened historical Gate 5B-12 instead of the accepted Gate 5C-1 employee surface.
- Gate5B12 imported a hard-coded older Revo module URL, so a green test could inspect a different JavaScript module instance from the page actually under test.
- The browser suite did not directly cover the manual failures that escaped earlier green runs: two-valued-column delete in one Save, cross-year missing/reuse/type-conflict/blank remap, destination visual order, year-scoped Custom Column Filter/Sort state, and structural Custom Column concurrency.
- SQL integration covered single year-scoped delete but did not directly assert the server contract required by delete-reconcile: deleting two valued columns must return the implicitly affected Work Order with the authoritative new RowVersion.

The **test-only V2 candidate** addresses those gaps without changing product runtime code. It applied cleanly; both test projects build; SQL Integration executed **34/34 PASS**.

First hardened browser execution evidence:

- `[00-runtime-module]` PASS — the browser and diagnostics used the same accepted `cc-delete-reconcile-2` module.
- `[00a-active-surface]` PASS — the journey ran on Gate 5C-1 with visible aggregates active.
- `[01-update]` PASS — a real cell edit saved to SQL and returned Clean.
- The next Custom Column Save did **not** reach the server. The existing E2E step hard-coded Basket value `مراجعة`; Gate 5C-1 flagged one validation error and disabled Save. Trace diagnostics recorded no page error, no HTTP 5xx, no console error, and no failed request.
- Classification: **TEST HARNESS CONTRACT FAIL**, not product/runtime failure. The page correctly blocked invalid input.
- Test-only correction: derive a different Basket value from `ERPPrototype.Data.WorkOrderBuskets.All` and use the original valid Basket value for the post-Save Undo/Redo step; do not change product runtime.

Deliberate non-claim: Rename/current column-menu parity remains deferred by user instruction. Width/visibility ownership remains covered at the integration layer; no new browser UI claim is added without an explicit current user flow/reference review.

## Test-hardening package status

- V1 is **not applied**. Forensic SHA256 comparison proved all three current test files are byte-for-byte identical to the backup taken before V1.
- V1 failed in tooling, not product/test behavior: PowerShell alias collision on `H`, then a malformed `CRCRLF` line ending in the test payload caused `git diff --check` to reject the copied candidate and the installer restored the backup.
- The corrected V2 applied successfully: 3 test files changed, documentation synchronized, payload/BOM/newline preflight PASS, post-apply SHA256 PASS, and `git diff --check` PASS. No product runtime or Rename/parity implementation was touched.
- E2E and Integration projects both build successfully after V2.
- SQL Core after hardening: **34/34 PASS**; Phase 9.3D legacy-column removal gate remains PASS.
- New SQL hardening assertions now proven include the two-valued Custom Column delete/authoritative RowVersion contract and moved Custom Column relative-order preservation when destination position is occupied.

## Latest hardened browser rerun

- The test-only Basket-contract correction applied cleanly: product runtime unchanged, one E2E source changed, documentation synchronized, post-apply SHA256 PASS, and `git diff --check` PASS.
- E2E rebuild after that correction: **PASS**.
- The rerun again passed `[00-runtime-module]`, `[00a-active-surface]`, and `[01-update]`, so it progressed beyond the earlier invalid-Basket blocker.
- It then stopped inside the E2E SQL verification helper `GetDbCustomColumnAsync`, not inside product runtime: SQL returned `CustomColumnDefinitions.DataType` as its real integer enum storage, while the helper called `SqlDataReader.GetString(3)`. This produced `InvalidCastException: System.Int32 -> System.String` before any product assertion could run.
- Source/schema contract confirms the product enum is `CustomColumnDataType` (`Text=1`, `Money=2`, `Date=3`, `Number=4`), and the E2E fixture itself inserts numeric `1` for Text.
- Classification: **TEST HARNESS DB-CONTRACT FAIL**, not product/runtime failure. No product fix is authorized by this evidence.
- Corrective scope: test-only reader correction — read DB `DataType` as `Int32`, cast to the product-owned enum, and compare its name (`Text`, `Money`, etc.) as the existing assertions already expect.

## Latest hardened browser rerun — virtualization/scroll harness gap

- The test-only DB-reader correction applied cleanly and the E2E rebuild passed.
- The next Gate5B12 run progressed materially further: `[00-runtime-module]`, `[00a-active-surface]`, `[01-update]`, `[01b-custom-columns]`, and `[01c-custom-multi-delete]` all passed. This proves the earlier Basket and SQL DataType harness blockers are closed and the new two-valued-column delete browser assertion is green.
- The run then stopped in the new cross-year mapping test before editing row index 30. Trace evidence shows `getVisibleSource('rgRow')[30]` and `[31]` returned real rows, while the DOM viewport was still rendering only the upper rows; `WaitForRenderedCellAsync` merely waited for `[data-rgRow="30"]` and never performed the real mouse-wheel scroll required by Revo virtualization.
- Browser diagnostics again recorded no page errors, HTTP 5xx responses, console errors, or failed requests.
- Classification: **TEST HARNESS VIRTUALIZATION/SCROLL FAIL**, not product/runtime failure. The requested row existed in the visible dataset but was not rendered because the new scenario skipped the harness's existing `ScrollToRowAsync` step.
- Corrective scope is test-only and local to the new cross-year mapping scenario: explicitly scroll to its non-zero target rows (20, 25, 30, 31, 35) before real cell/move interaction. Do not change Revo/product runtime code.
- First Virtual-Scroll Fix V1 apply attempt was **TOOLING BLOCKED** after payload copy because `AI_WORK_LOG.md` contained a blank line at EOF; `git diff --check` rejected it and the installer restored every reviewed file. No product/test source change from that failed attempt remained.
- Virtual-Scroll Fix V2 keeps the same test-only behavior change and adds a payload EOF guard before apply.

## Latest hardened browser rerun — year-switch render barrier gap

- Virtual-Scroll Fix V2 applied cleanly; the E2E rebuild passed and product runtime remained unchanged.
- The next Gate5B12 run again passed `[00-runtime-module]`, `[00a-active-surface]`, `[01-update]`, `[01b-custom-columns]`, and `[01c-custom-multi-delete]`.
- The cross-year mapping flow progressed beyond the earlier row-30 virtualization blocker, completed the two-row move/Save path, and selected Work Year 2025 successfully. Trace evidence shows the year selector became `2025`, the status reached `Dataset 2025`, and the page remained Clean.
- The harness then timed out only because `WaitForYearAsync` required DOM cell row 0 / column 0 to be visible. Revo correctly preserved the vertical viewport near row 35 across the year switch, so row 0 was not rendered even though the destination dataset was already loaded.
- Browser diagnostics recorded no page errors, HTTP 5xx responses, console errors, or failed requests.
- Classification: **TEST HARNESS YEAR-SWITCH/RENDER-BARRIER FAIL**, not product/runtime failure. Preserving viewport position is compatible with the real grid; the harness must not use row 0 visibility as proof that a year finished loading.
- Corrective scope: test-only. Keep the existing selector/loading/status checks, then wait for **any rendered data cell** instead of forcing row 0 to be visible. Do not change Revo/product runtime behavior.

## Latest hardened browser rerun — whole-test viewport navigation gap

- The year-switch render-barrier correction applied cleanly; E2E rebuild passed and product runtime remained unchanged.
- The next hardened Gate5B12 journey progressed further and `[01d-custom-cross-year]` passed completely. This closes the missing/reuse/type-conflict/blank-value/destination-order browser path under the hardened suite.
- The next scenario, `[01e-custom-year-view]`, created `B12 Year View State`, edited its real cell, saved successfully, and returned Clean. Trace evidence resolved that Custom Column to visual grid column index `3`.
- The harness then waited for the Custom Column Sort button and timed out. The column still existed, but the Revo viewport/header was horizontally positioned elsewhere, so the virtualized header control for visual column 3 was not rendered. Browser diagnostics recorded no page error, HTTP 5xx response, console error, or failed request.
- Whole-test review found this is broader than one missing Scroll call: `WaitForRenderedCellAsync` only waited and never navigated; `ScrollToRowAsync` incorrectly used column 0 as proof that a row was rendered, which breaks when horizontal virtualization moves column 0 off-screen; and Sort/Filter header interactions had no horizontal navigation contract at all.
- Classification: **TEST HARNESS 2D VIEWPORT-NAVIGATION FAIL**, not product/runtime failure. The real Revo grid virtualizes both rows and columns, so the browser harness must actively navigate to the requested row/column before interacting.
- User explicitly requested fixing the test as a whole rather than adding another one-off row workaround. The approved corrective scope remains test-only: centralize real mouse-wheel vertical + horizontal navigation, make row detection independent of column 0, make cell waits navigate both axes, and make Sort/Filter controls scroll their owning column into view before click/assertion. No product runtime, Rename, or parity behavior is authorized by this failure.

## Latest hardened browser rerun — viewport selector/readiness audit

- Whole-test viewport-navigation V1 applied cleanly and kept product runtime untouched, but its first E2E rerun stopped **before `[00-runtime-module]`**.
- Failure cause is test-only and proven by the trace: the new helper required `revogr-viewport-scroll.rgCol.scroll-rgCol`, while the real initial Revo DOM was `revogr-viewport-scroll.rgCol.hydrated`. `scroll-rgCol` is conditional and cannot be used as viewport identity.
- Whole-runner review found the custom mouse-wheel implementation is unnecessarily brittle: it duplicates Revo navigation, adds RTL/distance heuristics, couples readiness to navigation, and leaves redundant scenario-level scroll calls.
- Existing accepted project harnesses already use Revo's public `scrollToRow` API, and the Community API also exposes `scrollToColumnIndex` / `scrollToColumnProp`. Corrective design is to use those APIs only to position the virtual viewport, then keep the actual edit/click/keyboard actions as real Playwright interactions.
- Startup/reload/year readiness must wait for **any rendered data cell** without moving the sheet to row 0 / column 0.
- Centralized cell/row/header helpers must own positioning; redundant scenario-specific scroll calls should be removed. The Revo editor locator should target the actual `revogr-edit input` rather than any last input inside the host.
- Classification: **TEST HARNESS VIEWPORT-SELECTOR / NAVIGATION-DESIGN FAIL**, not product/runtime failure. No Product, Rename, or parity behavior is authorized by this evidence.
- Follow-up risk outside the current Gate5B12 patch: `EmployeeRealWorkdayRunner` still has a mouse-wheel row helper that uses column 0 as render proof. Record it for the later Employee Real Workday closure rather than expanding this patch.

## Next action

1. Apply one **test-only consolidated Gate5B12 navigation V2** based on the exact current snapshot: Revo public row/column scroll APIs, any-cell readiness, centralized navigation, redundant-scroll cleanup, and precise editor targeting.
2. Rebuild E2E only and rerun the same hardened Gate5B12 real-browser journey from the beginning.
3. If another failure appears, classify it from trace/runtime evidence before changing anything; do not infer a product bug from a harness exception.
4. If Gate5B12 passes, run Employee Real Workday 00-17 and review its remaining column-0/mouse-wheel harness risk before treating that closure as final.
5. Continue stress/concurrency closure as applicable, then memory consistency/final diff/metrics/checkpoint.
6. Return to deferred Rename/column-menu parity only after this test-hardening cycle is complete and its required reference/user-approval gate is performed.

## Communication

Explain program behavior and cause/effect first in concise Egyptian Arabic. Avoid low-level implementation detail unless it changes a concrete decision or risk.
## 2026-09-09 — Gate5B12 `[01e]` trace correction: capability-contract mismatch, not viewport failure

- New-machine recovery baseline is proven: Build PASS and SQL Core **34/34 PASS** with Phase 9.3D PASS.
- Gate5B12 rerun with viewport-navigation V2 passed `[00]` through `[01d-custom-cross-year]`.
- The `[01e-custom-year-view]` timeout is now reclassified from 2D viewport navigation to **TEST HARNESS CAPABILITY-CONTRACT FAIL**.
- Trace proves `B12 Year View State` was created as Custom **Text**, resolved to visual column 3, its body cell was already visible, and its header rendered the Excel Filter button. The expected `.erp-revo-sort-button` did not exist because the accepted runtime contract exposes Sort only on Money columns; non-Money custom columns are Filter-only.
- Corrective scope remains test-only: use one Custom Text column to verify Work-Year Filter isolation/restoration and one Custom Money column to verify Work-Year Sort isolation/restoration. Product runtime remains unchanged.
- Viewport-navigation V2 remains retained because it fixes genuine row/column virtualization fragility elsewhere; this failure is not evidence that V2 navigation is broken.
- Closure remains open until the corrected Gate5B12 journey is rebuilt and rerun from the beginning.

## RECOVERY-CLOSURE-20260909 — authoritative recovery closure

- Recovery branch: recovery-last-known-20260908.
- Trusted base: GitHub checkpoint 2c5d0b6.
- Reviewed recovery restored 37 intended source/documentation files only.
- Build: PASS.
- SQL Integration: 34/34 PASS.
- Phase 9.3D legacy-column removal gate: PASS.
- Gate 5C-1 / B12 Real DB browser journey: FULL PASS through [00]-[07].
- [01e-custom-year-view] PASS after correcting the test capability contract: Text owns Filter; Money owns Sort. Product runtime was not changed for this correction.
- Browser evidence: ERP_REVO_GATE5B12_TRACE_20260909-215933.zip.
- Clean E2E rebuild was required once because recovered source timestamps caused stale build output to be reused.
- Rename/current column-menu parity remains deferred pending its dedicated reference pass and user approval.
- Employee Real Workday 00-17 has not yet been rerun on the rebuilt machine.

This section supersedes earlier browser-closure entries that describe Gate5B12 as open.
