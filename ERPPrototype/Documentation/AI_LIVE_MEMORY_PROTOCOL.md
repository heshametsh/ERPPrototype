# AI Live Memory Protocol — ERP Prototype

Purpose: keep project continuity accurate while keeping Git, product truth, chronology, and learning separate.

## Four sources, four jobs

1. **Live Git/code/tests** — implemented reality and repository state.
2. **AI_CURRENT_STATE.md** — compact logical state: mission, approved behavior, evidence, open risks, protected boundaries, next action.
3. **AI_WORK_LOG.md** — append-only chronology of material events.
4. **AI_WORK_METRICS.csv** — factual per-mission learning data.

Canonical business/decision/test/Grid documents remain owners of their own truths. Do not duplicate those truths everywhere unless the current state needs a compact pointer.

## Before material work

- follow `AI_CONTROL_CENTER.md`;
- read Current State and latest relevant Work Log receipts;
- read live Git when branch/HEAD/status/diff/stashes matter;
- recover missing facts from current code/test evidence instead of guessing.

Never mirror live Git HEAD or CLEAN/DIRTY inside Current State. A tracked state file cannot reliably describe the commit that contains itself.

## After a material event

Material events include user-run command/test/package output, behavior decisions, code/test changes, rollbacks, blockers, scope corrections, and checkpoints.

1. Classify the event.
2. Update Current State only if current logical truth changed.
3. Append one Work Log receipt.
4. Update a canonical owner only if that owner's truth changed.

### Structured Work Log metadata

From the `STRUCTURED-LOG-V1` marker onward, every new Work Log entry must put one line immediately after its dated heading:

`Meta: Mission=<id>; Class=<class>; Outcome=<outcome>; Stage=<stage>; Scope=<scope>`

Use stable classes where applicable: `PRODUCT`, `TEST/HARNESS`, `BUILD/STALE`, `TOOLING`, `ENVIRONMENT`, `WORKFLOW`, `DOCS`.

The prose below the line explains cause/effect. The metadata exists so later Metrics can be derived rather than reconstructed from memory.

## Failure/package rule

Before another modifying candidate, re-anchor from the user's actual result and current Git. After two consecutive Tooling/Package failures on the same blocker, require fresh exact-state status/diff/snapshot before a third candidate.

## Closure

At a major evidence milestone, handoff, checkpoint, or mission closure:

1. prune Current State to current truth;
2. preserve chronology in Work Log;
3. synchronize only affected canonical owners;
4. append/update one factual Metrics row for a completed mission;
5. run `ERPPrototype/Tools/AI/Test-AIMemoryConsistency.ps1`;
6. stop on `FAIL`.

The checker validates memory mechanics, not product semantics. Semantic correctness still comes from current code, executed evidence, canonical owners, and engineering review.

## Metrics rules

- Record failure classes separately: Product, Test/Harness, Build/Stale, Tooling, Environment.
- Count package iterations explicitly when packages are part of the mission.
- Do not guess missing historical counts.
- Do not claim improvement from one mission row.
- Evaluate reopenings retrospectively; do not predict `ReopenedWithin3Missions` at closure.

## External local changes

The assistant cannot see edits made on the user's machine unless current Git/status/diff or a fresh package is available. Refresh reality whenever local code changed outside the assistant-visible snapshot.
