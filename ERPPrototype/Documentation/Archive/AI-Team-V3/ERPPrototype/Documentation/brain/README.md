# Project Brain V1

This directory contains the small machine-readable part of the ERP Prototype Project Brain.
It is intentionally not a second documentation system.

## Files

- `decisions-index.yaml` — pointer/index only. It does not repeat decision text.
- `field-aliases.yaml` — logical field identity across C#, JSON/JS, RevoGrid, and database naming.

V1 uses **JSON-compatible YAML**. JSON is a valid YAML 1.2 subset, which lets the repository use one human-readable file without adding a YAML parser dependency.

## Truth boundaries

- `08_DECISIONS_LOG.md` says **what should happen**. Decisions remain normative until explicitly superseded.
- Current code/tests at the checked-out commit say **what is actually implemented now**.
- `field-aliases.yaml` is last-known routing help, not authority over current code. A mission must re-verify aliases it depends on.
- Historical Change Maps/ChangeImpact are evidence from their commit only. They must never seed a new Change Map as a shortcut.

## Partial migration rule

`decisions-index.yaml` starts with `migrationStatus: partial`.
While it is partial, a missing index entry does **not** mean no decision exists. Agents must fall back to `08_DECISIONS_LOG.md` for areas not yet migrated.

## Alias failure rule

An alias mismatch is interpreted against the current Mission Packet required behaviors:

- if the missing alias prevents proving a path required by the mission, stop that engineering path and resolve the mapping first;
- if the required path is already proven and the mismatch is outside it, report a warning.

The Mission Packet is temporary mission context. It references decisions; it never becomes a source of product truth.

## Implementation status rule

`lastKnownImplementation` is intentionally historical wording. It is the last verified state at a commit, not a permanent fact.
A new mission touching the same area must verify current code again.

## Validation

`Tools/ProjectBrain/validate_project_brain.py` is the deterministic structure check.
CI must run it when the Decisions Log or `Documentation/brain/` changes.

The validator checks shape, references, IDs, and required commit metadata. It does not decide whether a decision is good or whether an Agent's interpretation is correct.
