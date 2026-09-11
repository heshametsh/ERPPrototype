# AI CURRENT STATE

Updated: 2026-09-11
Mission: MEMORY-SIMPLIFY-20260909
Mission status: **COMPLETE**

## Current mission

The project-memory simplification is now proven by the user's real Windows execution. V1 exposed an EOL bug in the memory checker and rolled back cleanly. V2 corrected the parser, added LF+CRLF self-checking, preserved the eight-file scope, passed `git diff --check`, and passed the simplified memory gate as `V8.1-SIMPLE`.

This mission changed memory/workflow documentation and the memory checker only. Product runtime, test runtime, migrations, Rename/parity, and employee-visible behavior were not changed.

## Authority

1. Live Git/worktree + current code + executed evidence.
2. Latest user-approved behavior/instruction.
3. This compact state for logical project state only.
4. Current canonical documentation.
5. `AI_WORK_LOG.md` chronology.

Git branch/HEAD/CLEAN-DIRTY are deliberately **not mirrored here**. Read them live from Git whenever they matter.

## Approved behavior that still matters

- Every Work Year owns an independent Custom Column catalogue inside the employee department.
- Add/Rename/Delete are scoped to the current Work Year.
- Cross-year movement preserves every non-empty custom value and resolves destination definitions transactionally.
- Width/visibility layout remains department-scoped by DepartmentId + FieldKey.
- Accepted Work Orders foundations remain protected: snapshot-safe Save, real SQL Save, Selection Core V4R3, RowVersion concurrency, edit-while-Save, persisted delete/re-add identity, cross-year transactional Save, and Gate 5C-1 visible aggregates.
- Test hardening may improve tests/diagnostics only. Missing user-visible behavior is a separate product/parity decision requiring the relevant reference pass and user approval.

## Current proven evidence

- Accepted technical product baseline remains the clean-machine recovery evidence: Build PASS, SQL Core 34/34 PASS, Phase 9.3D PASS, Gate5B12 FULL PASS, and Employee Real Workday FULL PASS.
- Memory checkpoint `140bdd4` is the accepted baseline before this simplification mission.
- Simplification V1: preflight PASS, payload copy PASS, `git diff --check` PASS, then memory-checker FAIL on CRLF structured-log parsing; automatic rollback returned the repository CLEAN.
- Simplification V2: user-executed preflight PASS, `git diff --check` PASS, and `AI memory consistency: PASS (V8.1-SIMPLE)`. The candidate touched exactly eight memory/workflow/checker files and left Product runtime, Test runtime, and Migrations unchanged.
- The V1 failure is classified **TOOLING / MEMORY-CHECKER EOL**, not a data-model failure and not product evidence.

## Open review findings

These are recorded findings only; no fix is authorized by this memory mission.

- `SEC-001`: forced temporary-password protection is not uniform across Admin mutation paths.
- Startup seeding can reactivate a disabled initial Admin, contrary to the recorded restart rule.
- The documented minimum-8-simple-character temporary-password rule is not explicitly encoded in Identity options.
- Later Revo Gate wrappers are inconsistent about route-level Employee authorization; server-side scope checks remain present, so this is defense-in-depth review rather than proven exposure.
- Revo uses Saudi UTC+3 for current business year while some legacy/service defaults use `DateTime.Now.Year`.
- Revo 4.25.2 still depends on jsDelivr CDN assets; production self-host/pin/license closure remains open.
- The year-scoped Custom Column migration is forward-only; rollback requires database backup/restore.
- Admin/Login/Security automated coverage is thinner than Work Orders SQL/browser coverage.

## Simplified memory model

- **Git tells Git:** branch, HEAD, status, diff, and stashes are read live; they are not copied into this file.
- **Current State tells current logic:** mission, approved behavior, evidence, open risks, protected boundaries, next action.
- **Work Log tells history:** append-only chronology; new entries use one structured `Meta:` line so later metrics can be derived instead of guessed.
- **Metrics tell learning:** failures are separated into Product, Test/Harness, Build/Stale, Tooling, and Environment categories; trends are judged only after several completed missions.
- **Memory Checker checks mechanics:** required files, compact-state shape, dates, decision IDs, UTF-8 integrity, structured latest log metadata, and completed-mission metrics. It does not duplicate product semantics or live Git state.

## Protected boundaries

- Do not reopen accepted Work Orders foundations without regression evidence.
- Rename/current column-menu parity remains deferred until its dedicated reference pass and user approval.
- Do not add more permanent memory/workflow rules from a single unusual event. Consolidate at root-cause level.
- Do not record a candidate as PASS or write completed-mission Metrics before the user-executed result actually exists.
- Do not redesign the memory system again before the planned multi-mission retrospective unless a concrete correctness defect is proven.

## Next action

Checkpoint the proven eight-file memory simplification. After that, use the simplified system during real project work and judge it only after several completed missions; do not keep tuning the memory system in isolation.

## Communication

Explain the program as cause and effect in natural Egyptian Arabic: what happened, why it matters, and what decision follows. Keep implementation detail in the background unless it changes the decision or the user asks for it.
