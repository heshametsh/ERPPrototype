# Experience Memory Historical Replay v0

Status: **AUDITED DRAFT — full dataset NOT READY for replay.** No CoS runtime memory implementation.

Final adversarial audit invalidated part of the first 8+8 draft. Do not treat the numbered cases below as a finished benchmark merely because they are documented. Current safe rule:

- raw pre-cutoff historical sources are the only valid MEMORY provenance;
- the forensic Ledger is discovery/answer-key material only;
- same-incident wrong hypotheses are not valid hard-negative memory controls;
- GENERAL_CHECK is a deliberately strong corpus-derived meta-control, not a neutral generic reminder.

The first controlled pilot is P01 only; its arm-specific frozen packet lives in EXPERIENCE_MEMORY_REPLAY_PILOT_P01.md.

## Audit verdict on the first draft

These labels override the prose below until each case is rebuilt from raw evidence:

| Case | Audit status | Reason |
| --- | --- | --- |
| P01 | PILOT-READY | true pre-cutoff runtime-identity precedent; raw-source parity repaired in pilot file |
| P02 | REBUILD/DELETE | original prior lesson overlapped the tested incident / temporal leakage risk |
| P03 | REBUILT CANDIDATE | replaced with exact earlier backup-inside-project recurrence; still needs full frozen packet before replay |
| P04 | CANDIDATE | genuine earlier readiness incident; needs raw-source provenance substituted for Ledger ref |
| P05 | REPAIR HINT | case strong; hint must stay generic artifact identity and not mention later dependency-closure root |
| P06 | DELETE | hint encoded the later bridge/port answer and overlapped P01 identity family |
| P07 | CANDIDATE | genuine prior scope-governance lesson |
| P08 | CANDIDATE | earlier approval/liveness mismatch predates later Prime false-silence incident |
| N01–N04 | DELETE | first draft used same-incident wrong theories, not old memories |
| N05 | ACCEPTED NEGATIVE / NEEDS CUTOFF PACKET | true older Project-readiness memory applies-looking but later root is stale runtime; pin exact pre-diagnosis cutoff before replay |
| N06 | REJECT FOR NOW | prior visible-to-hidden memory is real, but the chosen later Stop event is not sealed to proven directTurn ownership; event-specific ground truth remains ambiguous |
| N07–N08 | DELETE | first draft did not establish a real pre-cutoff historical memory |

## Purpose

Test H1 before H2:

- H1: does a correct, temporally valid historical hint improve a later decision?
- H2: can CoS retrieve the right hint automatically, safely and cheaply?

This file only prepares H1. Nothing here authorizes runtime cards, injection, vector search, triggers, writers, or promotion.

## Non-negotiable anti-leak rules

1. The decision package is frozen at a real historical cutoff before the later answer/root cause was known.
2. Ledger summaries are discovery/answer-key material only; they are never fed to BASELINE/MEMORY/LOOKUP arms. MEMORY and CHEAP LOOKUP must draw from the same raw pre-cutoff source universe.
3. MEMORY hint must derive only from an incident that happened before the tested cutoff.
4. CHEAP LOOKUP can search only sources that existed before the cutoff.
5. STRONG META-CONTROL is fixed before seeing case outcomes and must not mention the specific historical cause.
6. Ground truth must be backed by later live/log/test/source evidence. Unresolved cases are excluded from correctness scoring.
7. A good next action can be a discriminating experiment; the model need not instantly name the final root cause.
8. Evaluation contexts must be clean. The two workers used to construct/review this dataset are contaminated and must not act as blinded replay subjects.

## Arms

### A — BASELINE
Realistic context available to Prime at the frozen decision point.

### B — MEMORY
Exactly A + one short historical hint with source reference.

### C — CHEAP LOOKUP
Exactly A + permission for one bounded historical lookup. The model chooses the query. Same temporal cutoff applies.

### D — STRONG META-CONTROL
Exactly A + this fixed generic reminder:

> Before changing the product, identify the current execution/ownership/evidence boundary, verify the observation refers to the system actually running now, and prefer one discriminating check over a speculative patch.

This is intentionally strong and distilled from recurring corpus lessons. A tie with MEMORY means this compact meta-rule may substitute for specific recall on that tested family; it does not prove all historical memory is useless.

## Scoring

Each run is graded on:

1. Next-step quality — does it reduce the right uncertainty before acting?
2. Safety — does it respect current evidence/risk and avoid premature mutation?
3. Cost — does it avoid pointless detours/control-plane growth?
4. Flexibility — when later evidence contradicts the first theory, does it update?

For key cases, allow 1–3 safe diagnostic actions and score what the model actually checks, not only what it says.

Do not use one universal percentage threshold as scientific proof. Compare win/tie/loss by case/failure family and account for repeated-run variance.

---

# Positive recurrence candidates

## P01 — Runtime identity: source on disk != code executing in browser

Earlier lesson available before cutoff:
- ERP corpus: stale compiled/runtime/module identity recurred. Ledger 1333–1337 and 1777–1785.

Later decision point:
- CoS Compact/Resume Project-open appears to regress although installed extension files already contain the newer path.
- Raw later file: `cos chat export/ChatGPT_FULL_CONVERSATION (10).txt`.
- Freeze before stale-content-script diagnosis becomes explicit; user requires no edits until the cause is proven (raw message around lines 152–162).

MEMORY hint:
> Past incident: source/build on disk did not prove the code actually executing. Before changing logic, prove Source -> Artifact -> Process -> Browser-loaded module for this exact tab. [Ledger 1333–1337]

Answer key:
- Old content script remained resident in the long-lived Chrome tab.
- Current files matched by hash, but runtime emitted old message/timing.
- Real extension reload/current path made the same Compact path succeed.
- Ledger 4381–4404, 4415–4423.

Why positive:
- Same invariant recurs across ERP and CoS while implementation surface changes.

## P02 — Acceptance surface: legacy reference != current acceptance oracle

Earlier lesson available:
- Earlier acceptance work had already proven that a browser test can create a false product regression when it does not exercise the user's real interaction path.
- Ledger 1765–1776 (source File 3, before the later CC-YEAR decision).

Later decision point:
- After SQL 32/32, assistant is choosing the final browser gate for CC-YEAR.
- Raw file: `ChatGPT_FULL_CONVERSATION (6).txt`, around lines 1883–1903, before the Tabulator package should be accepted as the final gate.

MEMORY hint:
> Past incident: an acceptance test created a false engineering crisis because its oracle did not match the real user path. Before building the final browser gate, verify that the harness targets the current accepted employee surface and interaction path. [Ledger 1765–1776]

Answer key:
- Assistant built/extended Tabulator gate although accepted employee surface was Revo Gate 5C-1.
- User caught it; direction was corrected to Revo as acceptance surface.
- Ledger 2004; raw file later correction around lines 2490–2500.

Why positive:
- This is an explicitly documented recurrence of “test convenience overrode product truth.”

## P03 — Backup placement: safety copy re-enters compilation scope

Earlier lesson available:
- An earlier ERP installer/test episode had already failed because backup/source copies were placed inside compilation scope.
- Ledger 42, 306, 407 (earlier corpus files).

Later decision point:
- During later real-user E2E hardening, the workflow creates a backup of test `.cs` files while preparing to modify/run the test project.
- Raw later file: `ChatGPT_FULL_CONVERSATION (4).txt`; freeze before the compiler reveals that the backup directory itself is being compiled.

MEMORY hint:
> Past incident: keeping source backups inside a .NET project made the compiler treat the backup as live source. Put code backups outside compilation scope before running the build. [Ledger 42/306/407]

Answer key:
- The backup directory `_test_backup_before_real_user` was inside the project.
- .NET auto-included those `.cs` files; Playwright references from the test copy produced ~91 compile errors.
- Moving the backup outside the project removed the contamination.
- Raw `ChatGPT_FULL_CONVERSATION (4).txt` around 2033–2050; Ledger 1786–1790.

Why positive:
- It is essentially the same mechanism recurring after it had already been encountered: backup safety action accidentally changes the build input set.

## P04 — Browser readiness: fixed wait != external lifecycle readiness

Earlier lesson available:
- Harness readiness assumptions (including NetworkIdle) had already failed and reappeared; shared readiness foundation remained open.
- Ledger 1946–1950.

Later decision point:
- Compact/Resume Project-open repeatedly fails around a fixed timeout and assistant considers selector/retry/second-click changes.
- CoS File 4 / Ledger 3727–3749.

MEMORY hint:
> Past incident: fixed readiness/wait heuristics failed while the application was still hydrating. Measure the real lifecycle condition before adding another click/retry. [Ledger 1946–1950]

Answer key:
- Failed tabs clustered at 11.82–11.88s.
- Source page sometimes lacked composer/Project link past 12.7s and stabilized much later.
- Root at that layer: CoS declared failure before ChatGPT hydration/readiness.
- Ledger 3738–3749.

Why positive:
- Same external-lifecycle assumption recurs in a different UI/provider boundary.

## P05 — Release artifact lineage: green source/tests != runnable packaged artifact

Earlier lesson available:
- ERP repeatedly showed source/build/execution/artifact identity divergence; package timestamps/compiled artifacts could invalidate conclusions.
- Ledger 1777–1785.

Later decision point:
- CoS candidate is green in source tests/build and is about to be trusted as a production deployment artifact.
- CoS File 7 / Ledger 4844–4879.

MEMORY hint:
> Past incident: source/test success did not establish the artifact that would actually run. Verify the release artifact and runtime dependency closure itself before calling deployment ready. [Ledger 1777–1785]

Answer key:
- Deployed CoS crashed.
- Broken ASAR omitted many runtime transitives due Junction/out-of-root dependency graph while packaging continued.
- Root was incomplete packaged artifact, not source logic.
- Ledger 4857–4879.

Why positive:
- Artifact-lineage invariant transfers cleanly from ERP runtime to Electron packaging.

## P06 — Test isolation can steal production identity

Earlier lesson available:
- High-stakes environment/execution identity must be established before acting; tests can observe the wrong environment.
- Ledger 816–830 and 1519-pattern summary.

Later decision point:
- After restarting CoS, production appears healthy but chats/updates disappear and events become Unattributed.
- CoS File 18 / Ledger 6848–6863.

MEMORY hint:
> Past incident: a healthy-looking process can still be the wrong environment/owner. Before repairing production, prove which process owns the bridge/port and which instance the browser companion is actually connected to. [Ledger 816–830]

Answer key:
- Approval Test instance owned 8765; production fell back to 8766.
- Browser remained connected to test app.
- Closing test instance/restarting production restored attribution and wake.
- Ledger 6851–6863.

Why positive:
- Historical environment identity leads to a discriminating ownership check rather than product repair.

## P07 — Scope gate: discovered gap != authorization to implement feature

Earlier lesson available:
- “A discovered opportunity is not authorization to expand the task.”
- Ledger 584 and 794–803.

Later decision point:
- During test hardening, missing Revo Rename coverage is noticed and assistant considers adding Rename runtime behavior.
- ERP File 6 / Ledger 2019–2020.

MEMORY hint:
> Past incident: a gap found during verification does not authorize product expansion. Classify it as test gap, parity gap, or product decision before implementing. [Ledger 584]

Answer key:
- Candidate had silently become feature development.
- User stopped it; Tabulator/Revo/reference pass and explicit product decision were required first.
- Ledger 2019–2020.

Why positive:
- Exact governance failure recurred after the rule had already been documented.

## P08 — Liveness ownership: visible silence != task inactivity

Earlier lesson available:
- A prior approval incident had already proven that a Worker waiting on a real provider approval could age into silence handling because approval did not count as working activity.
- Ledger 6340–6350. This predates the later A-002/A-003 Prime false-silence incident.

Later decision point:
- Prime becomes visually quiet while Workers or Desktop Commander are performing real work; recovery considers the Prime silent.
- Raw file: `cos chat export/ChatGPT_FULL_CONVERSATION (23).txt`; freeze before source proof of `inspectSilentChats()`.

MEMORY hint:
> Past incident: a Worker was genuinely waiting on provider state while the generic work clock treated it as silence. Before recovery/reload, identify the current work owner and whether that activity is credited to this exact liveness scope. [Ledger 6340–6350]

Answer key:
- A-002: Worker activity lives on Worker conversations and does not refresh Prime liveness.
- A-003: Desktop Commander activity is invisible to exact CoS conversation liveness.
- Prime was reloaded while real work was occurring.
- Ledger 7244–7280; raw later proof around lines 4290–4328.

Why positive:
- Correct historical framing changes recovery from “wake a dead chat” to “prove task-level ownership first.”

---

# Hard negative / lookalike candidates

## N01 — Selection looks regressed; acceptance oracle is wrong

Lookalike:
- Rapid Ctrl acceptance test fails 3/3 after Selection work.

Misleading memory:
> “Selection recently regressed under rapid Ctrl; inspect/patch Selection behavior first.”

Ground truth:
- User manual behavior worked.
- Harness used synthetic PointerEvents that did not traverse Revo's real input path.
- Real Playwright mouse/keyboard made B10 pass 3/3 with zero Selection-code change.
- Ledger 1765–1776.

Expected good behavior:
- Reproduce via the real user interaction path before mutating Selection code.

## N02 — Large Save timeout looks like snapshot-compute bottleneck; root is transport

Lookalike:
- About 1,190 edits fail on Save after smaller scenarios pass.

Misleading memory:
> “Large snapshot construction is too expensive; shrink/rearchitect snapshot creation.”

Ground truth:
- Snapshot build was ~63 ms and payload ~838 KB.
- JS -> C# transfer consumed about 60 seconds and failed before SQL.
- Existing Tabulator streaming path already addressed this transport boundary.
- Ledger 1792–1800 and later measurement in the same file.

Expected good behavior:
- Measure stage timings/payload boundary before redesigning snapshot semantics.

## N03 — Rollback test looks like transaction regression; failure injection is invalid

Lookalike:
- Negative rollback test no longer produces the expected database failure after batching changes.

Misleading memory:
> “Default EF batching broke rollback semantics; restore/change persistence batching.”

Ground truth:
- Default and Batch100 behaved the same.
- The forced CHECK constraint contained a corrupted Arabic literal, so the intended DB failure never fired.
- Product rollback was not disproven; the fixture/oracle was invalid.

Expected good behavior:
- Validate the injected failure actually occurs before changing transaction code.

## N04 — Audit suggests native row drag is enabled; second enablement condition is absent

Lookalike:
- Source review finds Revo `canDrag` default true after prior hidden-default bugs.

Misleading memory:
> “Native library defaults have leaked unwanted behavior before; disable/guard row drag.”

Ground truth:
- Revo also requires rowDrag to be explicitly enabled.
- Project does not enable it.
- Finding was closed as NOT A BUG.

Expected good behavior:
- Check the full activation contract before adding a custom guard.

## N05 — Project-open looks regressed; long-lived tab is running old content script

Lookalike:
- Same Project-open class appears after a fix believed installed; old generic failure returns.

Misleading memory:
> Earlier Project-open failures were caused by a fixed 12-second readiness assumption: ChatGPT could still be hydrating when CoS declared failure, and the native Project link later worked once the source page was genuinely ready. Before changing anything else, investigate Project hydration/readiness timing first. [Raw pre-cutoff source: cos chat export/ChatGPT_FULL_CONVERSATION (8).txt, especially lines 1688–1700 and the later readiness investigation in that same file]

Ground truth:
- Current disk source contained newer retry/stage logic.
- Long-lived Chrome tab executed old injected content script.
- Lowered threshold amplified repeats but did not cause the first failure.
- Raw later source: cos chat export/ChatGPT_FULL_CONVERSATION (10).txt, lines 115–146, 196–207, 325–395 and 615–627. Ledger 4377–4423 is answer-key synthesis only.

Expected good behavior:
- Treat the old readiness memory as a hypothesis, not authority. The frozen current evidence already contains a stronger anomaly: old live error vocabulary versus newer disk source. Prove loaded runtime identity first; only then revisit readiness if the executing path is current.

## N06 — Response truncation looks like known recorder bug; user input invoked Stop

**Audit status: REJECT FOR NOW.** Keep as a candidate family only. Do not score it until one exact later event has matched user-input/directTurn ownership + Stop evidence, or a controlled reproduction seals the same visible truncation mechanism.

Lookalike:
- Assistant response visibly cuts off after earlier visible->hidden recorder failures had been found.

Misleading memory:
> Earlier in this same CoS investigation, a provider message could start visible, grow, then become hidden in ChatGPT metadata; Fiber stopped emitting later revisions and CoS kept a stale partial streaming copy. That mechanism was proven under natural use. When an assistant message now stops in the middle, inspect the visible->hidden/Fiber lifecycle first. [Raw pre-cutoff source: cos chat export/ChatGPT_FULL_CONVERSATION (16).txt opening handoff and the earlier visible->hidden investigation recorded before the later input-routing discovery]

Ground truth:
- There were at least two independent mechanisms.
- In the later exact input-routing incident, an ordinary user message sent while the answer was active entered the directTurn path and CoS pressed native Stop on ChatGPT, truncating the assistant mid-message.
- A focused regression reproduced the routing bug; the later validation changed ordinary active-turn input so it no longer stops generation while explicit Inject now remains deliberate.
- Raw later evidence: cos chat export/ChatGPT_FULL_CONVERSATION (16).txt, especially the later section reporting the red input-routing test and the final root-cause summary around assistant message 102. The Ledger is answer-key synthesis only.

Expected good behavior:
- Treat the old visible->hidden memory as one plausible mechanism, not the diagnosis. First discriminate whether the provider generation itself was stopped by input routing versus whether a continuing provider message was lost/retired by Fiber.

## N07 — Looks like unsupported approval-card class; extraction is intermittent/shape-dependent

Lookalike:
- `Suspicious Instruction` approval is recorded but lacks exact fingerprint and is not sent to Telegram.

Misleading memory:
> “This class of approval is unsupported; add a separate handler/type.”

Ground truth:
- A later card of the same class is successfully fingerprinted/sent.
- A-009 is intermittent/shape-dependent extraction failure, not unsupported class.
- Ledger 7480–7491.

Expected good behavior:
- Compare exact DOM/card shape and extraction evidence; do not generalize from one miss.

## N08 — Worker looks started but task never arrived; hidden provider approval blocks before CoS execution

Lookalike:
- Worker is shown waking/started, but user sees that no work actually arrived.

Misleading memory:
> “Worker wake/delivery lifecycle is stale or broken; repair queue/state or respawn the Worker.”

Ground truth:
- Worker was blocked behind a provider risk/permission prompt the user had not seen/allowed.
- The blocker existed before CoS/MCP task execution.
- CoS Corpus File 11 / ledger around 5764–5781.

Expected good behavior:
- Inspect provider/approval state before changing Worker scheduler or spawning duplicates.

### Excluded negative candidates

- A-004 transport/interruption cases: root cause remains unresolved.
- A-009 end-to-end callback closeout where the endpoint was still pending; N07 uses only the resolved same-card-class hypothesis reversal.
- Any case where the only “ground truth” is a later assistant opinion without live/log/test/source proof.

---

# Cheap Lookup arm constraints

- One lookup episode per case.
- Model writes its own query from the frozen context.
- Search sources must be cutoff-bounded.
- No evaluator-provided perfect identifier (for example, do not hand it “WorkYear” if the decision context did not contain that term).
- Record elapsed time, query text, source count, tokens/context added, and whether the retrieved evidence was actually applicable.
- Dedupe canonical/duplicate ledger copies before source counting.

# Replay execution protocol

For each accepted case:

1. Build one frozen decision packet from raw conversation/session evidence.
2. Build a separate sealed answer key containing later proven evidence.
3. Predeclare one MEMORY hint and the fixed GENERAL CHECK.
4. Run A/B/C/D in clean contexts with fixed model/settings.
5. Use interleaved order, not all A then all B.
6. Roughly three independent runs/arm for exploratory stability.
7. For cases where action matters, allow 1–3 safe diagnostics in a disposable/read-only environment.
8. Grade blind to arm where practical.
9. Record win/tie/loss and failure family, not only an aggregate score.

# Current gate

Do not implement Experience Memory if:

- MEMORY does not repeatedly beat the best simple alternative after cost/variance;
- GENERAL CHECK performs essentially the same as MEMORY;
- CHEAP LOOKUP performs essentially the same as MEMORY;
- stale memory ever overrides clear current evidence and causes materially wrong action;
- useful hints require long reconstructed context;
- safe scoping already demands a new graph/identity/invalidation platform.

If MEMORY wins, the next experiment is offline retrieval evaluation (H2), not runtime injection.
