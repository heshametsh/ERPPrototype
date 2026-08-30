# Gate 5B-11 Acceptance

Date: 2026-08-30

## Status

Gate 5B-11 is accepted.

This gate establishes the snapshot-safe Save handshake for RevoGrid Work Order rows.
It does not yet write the snapshot to the production database.

## Accepted behavior

- An active Revo editor is committed through the normal editor lifecycle before the Save snapshot is captured.
- A Save snapshot represents the exact browser generation sent for persistence.
- A newer edit made while Save is active remains Dirty after the earlier snapshot is accepted.
- A second Save is blocked while a snapshot is active.
- Dataset/year switching is blocked while Save is active.
- Rejecting a snapshot does not falsely mark browser work Clean.
- Undo/Redo after an accepted Save derives Dirty state from the accepted Baseline.
- Filtering after Save starts does not remove a row from the already captured snapshot.
- Persisted Delete snapshots preserve Id and RowVersion identity.
- Save acceptance does not require replacing the complete RevoGrid source.

## Architecture

RevoGrid owns editing and editor lifecycle.

The Change Engine owns browser change history, Baseline, Dirty state and Save generations.

The Save orchestration captures one generation and accepts or rejects that exact generation only.

The accepted flow is:

Revo edit lifecycle
-> Change Engine
-> Save snapshot
-> persistence boundary
-> accept/reject exact snapshot

No parallel selection engine, DOM editor scraping, private Revo store manipulation, or full-grid reload is introduced by this gate.

## Regression evidence

Gate 5B-11 real-browser journey passed:

01 editor commit before snapshot
02 generation-safe acceptance
03 active Save protection
04 newer edit remains Dirty
05 later generation can be saved
06 reject safety
07 History after Save
08 Filter independence
09 persisted Delete identity

Combined B9 through B11 regression also passed.

Manual browser regression was completed successfully before acceptance.

## Scope boundary

Gate 5B-11 validates the Save contract only.

Production database persistence is the next gate and should reuse this handshake rather than introduce a second Save architecture.

Code checkpoint:

2a9c4099c5f9a401d962f0a420aa397583b61239
