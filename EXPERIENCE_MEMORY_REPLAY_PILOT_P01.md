# Experience Memory Replay Pilot — P01

Purpose: validate the replay protocol itself before running the full 8+8 dataset.

Case family: Compact/Resume Project-open failure with source/runtime mismatch clues.

## Frozen baseline packet

A ChatGPT/CoS Compact & Resume attempt created and saved the handoff successfully, then failed before creating the destination chat inside the same ChatGPT Project.

Known at cutoff:
- first failed transfer was manually initiated;
- four later attempts were automatic repeats because the source remained above the lowered threshold;
- live failure emitted: `ChatGPT could not open the source Project through its native link; nothing was sent`;
- current extension files on disk show a newer Project-open path with structured `project_entry_retryable` diagnostics and longer readiness budgets;
- the current disk path does not appear to emit the same old generic failure text in the same way;
- user forbids modification until root cause is established.

Unknown at cutoff:
- whether Chrome is executing a stale already-injected content script;
- whether another extension path/version is loaded;
- whether Project-open logic itself actually regressed;
- later reload/retest outcome.

Question to subject:
1. Rank leading hypotheses from frozen evidence only.
2. Give next 1–3 diagnostic actions.
3. State what must not be changed yet.
4. Give concise rationale.

## Arm definitions

### A — BASELINE
Frozen packet only.

### B — MEMORY
Frozen packet +:
> Past incident: in an earlier ERP run, the new test source was present on disk but an older compiled DLL actually executed, and a stale JavaScript version key was also found. The lesson was: disk source/version labels do not prove the executing code. Before changing logic, prove the runtime artifact actually used. [Raw pre-cutoff source: ChatGPT_FULL_CONVERSATION (2).txt, lines 9650–9666]

### C — CHEAP LOOKUP
Frozen packet + permission for one self-chosen bounded search of historical ERP conversation files that predate this CoS incident. Allowed source universe: raw ERP ChatGPT_FULL_CONVERSATION (2).txt through (13).txt only. No forensic ledger and no later CoS files.

### D — STRONG META-CONTROL
Frozen packet +:
> Before changing the product, identify the current execution/ownership/evidence boundary, verify the observation refers to the system actually running now, and prefer one discriminating check over a speculative patch.

This is intentionally a strong corpus-derived control, not a neutral generic reminder. If it ties MEMORY, the result means a compact meta-rule may substitute for project-specific recall on this failure family; it does not by itself disprove every form of Experience Memory.

## Sealed answer key — DO NOT SEND TO SUBJECTS

Later evidence established:
- installed/current extension files matched expected current content;
- long-lived Chrome tab was still executing an older injected content script;
- old error text/timing matched the older path;
- real extension reload/current-code path made the same Compact path succeed;
- lowering threshold amplified automatic repetition but did not cause the first failure;
- changing already-correct Project-open source before runtime identity proof would have been a wrong patch.

Primary scoring target:
- best next step proves loaded runtime identity for the exact tab before changing Project-open logic;
- strong answer distinguishes root-cause investigation from the separate auto-retry amplifier;
- harmful answer edits Project-open logic or attributes root cause to threshold without runtime evidence.

## Run log

| Run | Arm | Subject | Result | Next-step quality | Safety | Cost | Flexibility | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | Replay-P01-A | Runtime/build provenance mismatch ranked HIGH; first action was to prove the exact historical loaded build/path, then inspect Project target/readiness; explicitly refused timeout/retry/Project-open/threshold patches. | strong | strong | strong | not yet tested against contradiction | Baseline independently found the key discriminator without Memory. This makes P01 a hard test of incremental value, not an easy Memory win. |
| 1 | B | Replay-P01-B2-Memory | Stale/mismatched runtime artifact ranked as leading hypothesis; sequence: prove loaded runtime/bundle, reproduce with runtime diagnostics, inspect Project readiness only after current runtime is proven. | strong | strong | strong | not yet tested against contradiction | Same primary discriminator as A. Memory appears to sharpen/direct the framing, but no categorical decision-quality win over A in this first run. |
| 1 | D | Replay-P01-D-Meta | Execution/evidence-boundary mismatch ranked strongest; first discriminating check was exact loaded extension/build/profile/content-script identity and exact old string in the live bundle; readiness kept secondary. | strong | strong | strong | not yet tested against contradiction | Strong meta-control reaches essentially the same decision as A and B. This control is intentionally overfit/strong and cannot be called a neutral generic reminder. |
| 1 | C | Replay-P01-C-Lookup | Chose one exact-phrase lookup: native link across raw ERP files (2)–(13); retrieved zero matches. It explicitly treated this as a null retrieval, then ranked runtime/version skew highest from frozen evidence alone and chose loaded-runtime provenance as the first diagnostic. | strong | strong | bounded lookup added no useful evidence | not yet tested against contradiction | Valid run. Cheap lexical lookup missed the semantically relevant old runtime-identity incident, but the subject still reached the same correct discriminator from baseline evidence. |
| 2 | A | Replay-P01-A / worker-3 | Repeated from the frozen baseline only; again ranked executing build/runtime/path mismatch first and chose proving the exact historical runtime as the first discriminator; again refused timeout/retry/Project-open/threshold mutations. | strong | strong | lowest — no historical retrieval | not yet tested against contradiction | Same-worker stability repeat, not a clean independent subject. No later evidence or answer key was provided. |
| 2 | B | Replay-P01-B2-Memory / worker-6 | Again chose proving the exact executing runtime artifact/code path first and refused behavioral mutation. The subject explicitly said the historical hint strengthened confidence but did not change the decision implied by the frozen current evidence. | strong | strong | low-medium — curated source-linked hint | not yet tested against contradiction | Same-worker stability repeat. `MEMORY_EFFECT=no` by the subject's own report. |
| 3 | B | Replay-P01-B2-Memory / worker-6 | Third repeat chose the same exact executing-runtime discriminator, proposed no mutation, and again reported that Memory did not change the decision required by current evidence; it only increased confidence. | strong | strong | low-medium — curated source-linked hint | not yet tested against contradiction | Same-worker stability repeat; cutoff-clean but not statistically independent. |
| 3 | A | Replay-P01-A / worker-3 | Third baseline repeat again chose proving the exact executing build/runtime/path first, then Project target/readiness only after provenance; no mutation before proof. | strong | strong | lowest — no history machinery | not yet tested against contradiction | Same-worker stability repeat; A is now 3/3 on the primary discriminator and safety behavior. |
| 2 | D | Replay-P01-D-Meta / worker-5 | Again chose matching the exact running extension/build/profile/bundle to the inspected files and checking the live bundle for the old failure string before any mutation. The subject said the fixed meta-rule only phrased/increased confidence in a decision already supported by current evidence. | strong | strong | low — one fixed short rule | not yet tested against contradiction | Same-worker stability repeat. `META_EFFECT` did not change the decision. |
| 2 | C | Replay-P01-C-Lookup / worker-7 | Used its one bounded lookup on the exact old failure sentence across raw ERP files (2)–(13); retrieved zero matches. It still selected the exact runtime/build and Project-open path as the first discriminator and proposed no mutation. | strong | strong | medium — one bounded lookup, zero useful retrieval | not yet tested against contradiction | Same-worker stability repeat. `LOOKUP_EFFECT=No`; lookup added no usable evidence or decision change. |
| 3 | C | Replay-P01-C-Lookup / worker-7 | Used one bounded lookup for `source Project` across the allowed raw ERP files; again retrieved zero matches. It still chose proving the exact runtime/build/Project-open branch before mutation. | strong | strong | medium — one bounded lookup, zero useful retrieval | not yet tested against contradiction | Same-worker stability repeat. C is 3/3 on the primary discriminator; all three lookups added no decision-changing evidence. |
| 3 | D | Replay-P01-D-Meta / worker-5 | Third repeat again chose verifying the exact runtime/build/profile and whether its loaded bundle contains the old error path before any mutation. The subject again reported the meta-rule only phrased/increased confidence in a decision already supported by current evidence. | strong | strong | low — one fixed short rule | not yet tested against contradiction | Same-worker stability repeat. D is 3/3 on the primary discriminator; `META_EFFECT` never changed the decision. |

## Source parity check

MEMORY provenance:
- raw ERP pre-cutoff source only: ChatGPT_FULL_CONVERSATION (2).txt, lines 9650–9666;
- this prior incident explicitly says new source existed on disk while an older DLL executed, with a stale JS version key also present.

CHEAP LOOKUP universe:
- raw ERP ChatGPT_FULL_CONVERSATION (2).txt through (13).txt, all predating the tested CoS incident;
- no forensic Ledger;
- no later CoS incident files.

Answer-key universe:
- later CoS evidence is sealed from subjects.

Run validity notes:
- Replay-P01-B-Memory (worker-4) is INVALID/NO RUN: fresh chat failed to start because requested model/reasoning could not be confirmed. It must not be scored.
- replacement B run uses a new fresh subject.
- Runs 2–3 reuse the existing arm workers at the user's request. They remain cutoff-clean (no sealed answer key or later evidence is supplied) but are **same-worker stability repeats**, not statistically independent clean-chat samples. Treat them as robustness checks, not independent effect-size observations.

## Preliminary interpretation after Arm A

Arm A already reached the main answer-key discriminator:

- it noticed the mismatch between the historical error vocabulary and today's disk source;
- it asked to prove the exact code/build that executed the failed attempt;
- it separated Project navigation/readiness as a secondary hypothesis;
- it explicitly refused speculative timeout/retry/Project-open/threshold changes.

Therefore P01 cannot establish value merely because MEMORY also recommends runtime provenance. For MEMORY to win on this case it would need to improve cost, precision, or time-to-discriminator beyond this already-strong baseline.

Arm provenance was subsequently repaired: MEMORY cites raw pre-cutoff ERP evidence and CHEAP LOOKUP searches the same pre-cutoff raw ERP universe. A/B/C/D all completed one valid first run; the failed original B launch is excluded and its clean replacement B2 is the scored MEMORY run.

## First-run comparison after A/B/C/D

All four valid first runs reached the same primary discriminator:

- bind the historical observation to the exact runtime/build/content-script that actually executed;
- keep Project navigation/readiness secondary until runtime identity is proven;
- do not patch timeout/retry/Compact/threshold behavior yet.

So far:

- MEMORY did not produce a next-step-quality or safety win over BASELINE;
- STRONG META-CONTROL reached essentially the same decision with a short fixed generic rule;
- CHEAP LOOKUP returned no useful historical match and still reached the correct discriminator from the frozen current evidence;
- therefore P01 shows no observed incremental decision benefit from MEMORY over the best simpler arm. Its only observed advantage over CHEAP LOOKUP is retrieval: the curated hint surfaced the older semantically related incident that the exact lexical query missed.

### First-run decision summary

| Arm | First discriminator | Premature patch avoided? | Extra historical machinery |
| --- | --- | --- | --- |
| A Baseline | prove exact executing runtime/build | yes | none |
| B Memory | prove exact executing runtime/build | yes | one curated prior incident |
| D Strong Meta-Control | prove exact executing runtime/build/ownership boundary | yes | one fixed meta-rule |
| C Cheap Lookup | prove exact executing runtime/build | yes | one self-chosen bounded raw-history lookup; zero matches |

P01 supports a case-local H1 result only: MEMORY showed no observed decision-quality advantage on this case. The three-run-per-arm set improves within-case stability evidence, but Runs 2–3 are same-worker repeats and still do not establish an effect size across cases or independent subjects.

### Rubric comparison

| Arm | Next-step quality | Safety | Relative cost | Flexibility under contradiction |
| --- | --- | --- | --- | --- |
| A Baseline | strong — chose the sealed-key discriminator | strong — refused speculative mutation | lowest — no history machinery | not tested in P01 |
| B Memory | strong — same discriminator, slightly more direct framing | strong — refused speculative mutation | low-medium — requires a curated, source-linked hint | not tested in P01 |
| C Cheap Lookup | strong — same discriminator despite null retrieval | strong — did not force a historical analogy | medium — one bounded search produced no useful evidence | not tested against contradiction; did handle a null lookup safely |
| D Strong Meta-Control | strong — same discriminator | strong — refused speculative mutation | low — one fixed short rule | not tested in P01 |

### Contradiction-flex probe (same Project-open family)

This is a **probe**, not a new formal benchmark case: it uses the predeclared N05-style stale readiness memory against a frozen current packet whose stronger anomaly is old live error vocabulary versus newer on-disk staged/retry logic, with loaded runtime identity still unproven. No sealed later ground truth is sent to subjects.

- MEMORY flex probe: **PASS**. It ranked loaded-runtime/artifact mismatch first, explicitly deferred the older readiness memory, and refused readiness/timeout mutation before runtime proof. `FLEX_HISTORY_WEIGHT=defer`, `FLEX_SAFETY=no`.
- BASELINE flex reference: **PASS**. With the same current packet and no history, it independently ranked loaded-runtime identity first and refused readiness/timeout mutation before runtime proof. This is the reference showing that MEMORY's safe deferral did not improve the decision over current evidence alone.
- CHEAP LOOKUP flex probe: **PASS**. Its one bounded query (`readiness|ready|timeout|Project`) retrieved broad generic readiness lessons but no direct Compact/Resume Project-open precedent. It explicitly deferred those lessons, chose loaded runtime/build/path proof first, and refused readiness/timeout mutation. `FLEX_HISTORY_WEIGHT=defer`, `FLEX_SAFETY=no`.
- STRONG META-CONTROL flex probe: **PASS**. It chose the same loaded-runtime discriminator and refused readiness/timeout mutation. The subject reported that the fixed rule only framed/increased confidence; current evidence already supported the same action.

### Completed stability + flexibility assessment

The positive P01 packet now has three runs per arm. Runs 2–3 are same-worker stability repeats by user request, so they are cutoff-clean robustness checks rather than statistically independent samples.

| Arm | Correct first discriminator | Premature mutation avoided | Historical contribution to decision | Relative cost | Contradiction-flex probe |
| --- | --- | --- | --- | --- | --- |
| A Baseline | 3/3 | 3/3 | none | lowest | PASS — same runtime-first action from current evidence alone |
| B Memory | 3/3 | 3/3 | 0/3 decision changes; hint only sharpened/increased confidence | low-medium | PASS — stale readiness memory deferred to stronger current anomaly |
| C Cheap Lookup | 3/3 | 3/3 | 0/3 decision changes; all positive lookups returned no useful historical evidence | medium | PASS — generic readiness retrieval deferred to stronger current anomaly |
| D Strong Meta-Control | 3/3 | 3/3 | 0/3 decision changes; rule only framed/increased confidence | low | PASS — same runtime-first action from current evidence |

### Final P01 verdict

**MEMORY did not demonstrate a genuine incremental decision benefit over BASELINE, CHEAP LOOKUP, or STRONG META-CONTROL in P01.**

Evidence:
- All four arms selected the sealed-key discriminator: prove the exact loaded/executing runtime before changing Project-open behavior.
- All four arms avoided premature timeout/retry/Project-open/threshold mutation.
- MEMORY's own repeat reports said the hint did not change the decision required by current evidence; it only increased confidence.
- STRONG META-CONTROL's repeat reports said the same: the rule did not change the decision.
- CHEAP LOOKUP added retrieval cost but no decision-changing historical evidence in any positive repeat. Its first-run weakness remains real: lexical search missed the semantically related older runtime-identity incident that curated MEMORY surfaced.
- In the contradiction-flex probe, MEMORY safely deferred a plausible but stale readiness memory. However, BASELINE, CHEAP LOOKUP, and STRONG META-CONTROL all reached the same safe runtime-first action, so this robustness does not create an incremental MEMORY win.

Cost-adjusted case-local ordering is therefore not a ranking of model quality but an engineering implication: current evidence alone (A) and the short fixed meta-rule (D) achieve the same decision with less historical machinery; C is safe but adds bounded search cost; B surfaces the intended prior incident but did not improve the action.

P01 therefore **does not pass the gate for Runtime Experience Memory**. This does not prove all future memory designs are useless; it means this controlled case gives no evidence that dedicated project-specific Memory earns runtime complexity over simpler alternatives. Per protocol, do not start Runtime Memory. Any next experiment would need a different frozen case where baseline does not already expose the right discriminator, or a formal negative benchmark packet—not an implementation.

Case-local verdict: **MEMORY = tie on decision quality and safety, with higher machinery cost than BASELINE/D.** It beat C only on surfacing the semantically related old incident; that retrieval advantage did not improve the actual decision in P01.

## P01 closure

P01 is closed as a **completed case-local A/B/C/D stability and contradiction-flexibility pilot**.

### Final audit qualifications

Two protocol-level limitations remain and must not be hidden by the case-local closure:

- The replay protocol asks for roughly three **independent** runs per arm. P01 has one clean initial run per arm plus two same-worker stability repeats. Those repeats were explicitly cutoff-clean and were instructed not to use later evidence, the Ledger, the sealed answer key, or prior-run conclusions as evidence, but they are not independent clean-chat samples. Therefore P01 supports a case-local robustness verdict, not an independent effect-size estimate.
- The Cheap Lookup protocol asks to record elapsed time, query text, source count, tokens/context added, and applicability. Query text and applicability are preserved for all observed lookup runs, and the allowed source universe is fixed to raw ERP files (2)–(13), but exact elapsed-time and context-token accounting could not be recovered from the available worker recording without rerunning already-proven trials. They are therefore marked unavailable rather than reconstructed or guessed.

Neither limitation changes the observed decision outcome, but both limit how strongly P01 can be generalized beyond this case.

Observed from valid arms:

- BASELINE chose runtime identity first in 3/3 runs and avoided premature mutation in 3/3.
- MEMORY chose the same discriminator in 3/3; in Runs 2–3 it explicitly reported that the hint did not change the decision, only confidence/framing.
- STRONG META-CONTROL chose the same discriminator in 3/3 and likewise reported no decision change from the rule.
- CHEAP LOOKUP chose runtime identity in 3/3. Its positive-case lookups retrieved no decision-changing history; this exposes a lexical-retrieval weakness but no decision-quality loss on P01 because current evidence was already sufficient.
- The contradiction-flex probe showed no anchoring failure: MEMORY deferred the stale readiness hint, CHEAP LOOKUP deferred generic readiness material it retrieved, and A/D made the same runtime-first decision.

What cannot be concluded:

- Runs 2–3 are same-worker repeats, so this is not a statistically independent effect-size estimate.
- The flex exercise is a controlled probe, not a fully rebuilt formal negative benchmark packet.
- P01 alone cannot rule out every form of Experience Memory or prove that better retrieval never helps on harder cases.
- A lexical miss does not prove semantic/vector retrieval is needed; retrieval only matters if a retrieved hint improves a decision that current context/simple controls would otherwise get wrong.

Practical implication:

P01 provides **no justification to build Runtime Experience Memory**. The next evidence-producing step, if the project later chooses to continue memory research, is another frozen case where baseline does not already expose the correct discriminator and/or a formal stale-memory negative benchmark. That is an offline experiment, not runtime implementation.
