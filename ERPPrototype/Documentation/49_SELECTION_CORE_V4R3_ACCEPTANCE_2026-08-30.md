# Selection Core V4R3 Acceptance — 2026-08-30

**Status:** Accepted

**Code checkpoint:** `0e7a6be512f92fe076f21261b86da5079897d48e`

**Route:** `/work-orders-revogrid-gate5b11`

## What changed

Selection remains attached to the same Work Order or column identity when its visible position changes.

Example:

1. The employee selects WO-100.
2. Insert Above moves WO-100 down one visible position.
3. WO-100 remains selected.
4. Revo native range moves to WO-100's new position.

The same principle applies when filtering changes the visible position of a selected Work Order without removing it from the current result.

Rapid Ctrl interaction also resolves to the newest user selection instead of allowing an older asynchronous native-range operation to overwrite it.

## Architecture

ERP semantic selection:

- rows: `ClientKey`
- columns: `prop`
- state: Selected + Anchor + Primary

Revo remains responsible for:

- native focus/range
- keyboard/editing
- editor lifecycle
- virtualization/rendering

V4R3 does not introduce:

- a second cell-selection engine
- DOM selection painting
- Revo source modification
- a new Save architecture

## Performance

Small selections use the simple direct lookup path.

Large selections use a temporary `ClientKey -> position` lookup map to avoid repeated scans through the source.

This optimization only changes how selected positions are located. It does not reload or rewrite the complete Work Order dataset.

## Acceptance

- Build PASS.
- Gate 5B-10 real-browser Selection journey PASS.
- Filter movement synchronization PASS.
- Insert/Structure movement synchronization PASS.
- rapid Ctrl protection PASS.
- Gate 5B-11 real-browser Save journey PASS.
- Full B9 -> B11 regression PASS.
- manual browser verification PASS.

## Next boundary

Selection Core V4R3 is closed.

The next bounded mission is Real DB Save using Gate 5B-11's accepted snapshot generation and accept/reject contract.