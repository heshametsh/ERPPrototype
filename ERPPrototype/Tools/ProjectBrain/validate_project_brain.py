#!/usr/bin/env python3
"""Deterministic Project Brain V1 structure validator.

V1 intentionally stores JSON-compatible YAML so this validator needs only the
Python standard library. It validates structure and references; it does not
judge decision meaning or implementation correctness.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

DECISION_ID = re.compile(r"^DEC-\d{3}$")
COMMIT_SHA = re.compile(r"^[0-9a-fA-F]{7,40}$")
ALLOWED_DECISION_STATUS = {"accepted", "approved", "superseded", "rejected"}
ALLOWED_IMPLEMENTATION_STATUS = {
    "implemented",
    "partial",
    "planned",
    "unverified",
    "not-applicable",
}
ALLOWED_ALIAS_STATUS = {"verified", "unverified", "stale"}
REQUIRED_ALIAS_LAYERS = {"csharp", "json", "javascript", "revogrid", "database"}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def load_json_yaml(path: Path, errors: list[str]) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(errors, f"Missing file: {path}")
        return {}
    except json.JSONDecodeError as exc:
        fail(errors, f"{path}: not valid JSON-compatible YAML: {exc}")
        return {}
    if not isinstance(value, dict):
        fail(errors, f"{path}: root must be an object")
        return {}
    return value


def validate_commit(value: object, label: str, errors: list[str], *, allow_null: bool = False) -> None:
    if value is None and allow_null:
        return
    if not isinstance(value, str) or not COMMIT_SHA.fullmatch(value):
        fail(errors, f"{label}: expected 7-40 hex Git SHA, got {value!r}")


def extract_decision_ids(decision_log: Path) -> set[str]:
    text = decision_log.read_text(encoding="utf-8")
    return set(re.findall(r"^##\s+(DEC-\d{3})\b", text, flags=re.MULTILINE))


def validate_decisions(brain_dir: Path, errors: list[str]) -> tuple[int, int]:
    index_path = brain_dir / "decisions-index.yaml"
    data = load_json_yaml(index_path, errors)
    if not data:
        return 0, 0

    if data.get("schemaVersion") != 1:
        fail(errors, f"{index_path}: schemaVersion must be 1")

    migration_status = data.get("migrationStatus")
    if migration_status not in {"partial", "complete"}:
        fail(errors, f"{index_path}: migrationStatus must be partial or complete")

    validate_commit(data.get("indexedAgainstCommit"), f"{index_path}: indexedAgainstCommit", errors)

    decisions = data.get("decisions")
    if not isinstance(decisions, dict):
        fail(errors, f"{index_path}: decisions must be an object")
        return 0, 0

    decision_log = brain_dir.parent / "08_DECISIONS_LOG.md"
    if not decision_log.exists():
        fail(errors, f"Missing Decisions Log: {decision_log}")
        return len(decisions), 0
    log_ids = extract_decision_ids(decision_log)

    for decision_id, record in decisions.items():
        prefix = f"{index_path}:{decision_id}"
        if not DECISION_ID.fullmatch(decision_id):
            fail(errors, f"{prefix}: invalid decision ID")
            continue
        if decision_id not in log_ids:
            fail(errors, f"{prefix}: no matching heading in 08_DECISIONS_LOG.md")
        if not isinstance(record, dict):
            fail(errors, f"{prefix}: record must be an object")
            continue

        status = record.get("decisionStatus")
        if status not in ALLOWED_DECISION_STATUS:
            fail(errors, f"{prefix}: unsupported decisionStatus {status!r}")
        if status == "superseded" and not record.get("supersededBy"):
            fail(errors, f"{prefix}: superseded decision requires supersededBy")

        validate_commit(record.get("recordedAtCommit"), f"{prefix}: recordedAtCommit", errors, allow_null=True)
        validate_commit(record.get("indexedAtCommit"), f"{prefix}: indexedAtCommit", errors)

        scope = record.get("decisionScope")
        if not isinstance(scope, dict):
            fail(errors, f"{prefix}: decisionScope must be an object")
        else:
            for key in ("areas", "components", "fields"):
                values = scope.get(key)
                if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                    fail(errors, f"{prefix}: decisionScope.{key} must be a string array")

        impl = record.get("lastKnownImplementation")
        if not isinstance(impl, dict):
            fail(errors, f"{prefix}: lastKnownImplementation must be an object")
        else:
            impl_status = impl.get("status")
            if impl_status not in ALLOWED_IMPLEMENTATION_STATUS:
                fail(errors, f"{prefix}: unsupported implementation status {impl_status!r}")
            context = impl.get("context")
            if not isinstance(context, str) or not context.strip():
                fail(errors, f"{prefix}: implementation context is required")
            verified = impl.get("verifiedAtCommit")
            if impl_status in {"implemented", "partial"}:
                validate_commit(verified, f"{prefix}: implementation verifiedAtCommit", errors)
            elif verified is not None:
                validate_commit(verified, f"{prefix}: implementation verifiedAtCommit", errors)

        doc = record.get("doc")
        heading = record.get("heading")
        if not isinstance(doc, str) or not doc.strip():
            fail(errors, f"{prefix}: doc is required")
        else:
            target = (brain_dir / doc).resolve()
            if not target.exists():
                fail(errors, f"{prefix}: doc target does not exist: {target}")
        if heading != decision_id:
            fail(errors, f"{prefix}: heading must equal the stable decision ID")

    if migration_status == "complete":
        missing = sorted(log_ids - set(decisions))
        if missing:
            fail(errors, f"{index_path}: complete migration is missing {', '.join(missing)}")

    return len(decisions), len(log_ids)


def validate_aliases(brain_dir: Path, errors: list[str]) -> int:
    aliases_path = brain_dir / "field-aliases.yaml"
    data = load_json_yaml(aliases_path, errors)
    if not data:
        return 0
    if data.get("schemaVersion") != 1:
        fail(errors, f"{aliases_path}: schemaVersion must be 1")

    fields = data.get("fields")
    if not isinstance(fields, dict) or not fields:
        fail(errors, f"{aliases_path}: fields must be a non-empty object")
        return 0

    for logical_field, record in fields.items():
        prefix = f"{aliases_path}:{logical_field}"
        if not isinstance(logical_field, str) or not logical_field.strip():
            fail(errors, f"{prefix}: logical field name is invalid")
            continue
        if not isinstance(record, dict):
            fail(errors, f"{prefix}: record must be an object")
            continue

        aliases = record.get("aliasesByLayer")
        if not isinstance(aliases, dict):
            fail(errors, f"{prefix}: aliasesByLayer must be an object")
        else:
            missing_layers = REQUIRED_ALIAS_LAYERS - set(aliases)
            if missing_layers:
                fail(errors, f"{prefix}: missing alias layers {sorted(missing_layers)}")
            for layer, values in aliases.items():
                if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                    fail(errors, f"{prefix}: aliasesByLayer.{layer} must be a string array")

        verification = record.get("lastVerification")
        if not isinstance(verification, dict):
            fail(errors, f"{prefix}: lastVerification must be an object")
        else:
            status = verification.get("status")
            if status not in ALLOWED_ALIAS_STATUS:
                fail(errors, f"{prefix}: unsupported alias verification status {status!r}")
            commit = verification.get("verifiedAtCommit")
            if status == "verified":
                validate_commit(commit, f"{prefix}: verifiedAtCommit", errors)
            elif commit is not None:
                validate_commit(commit, f"{prefix}: verifiedAtCommit", errors)

    return len(fields)


def detect_repo_root(script_path: Path) -> Path:
    return script_path.resolve().parents[3]


def git_head(repo_root: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--expect-head", action="store_true", help="Require index baseline to match current Git HEAD")
    args = parser.parse_args()

    repo_root = (args.repo_root or detect_repo_root(Path(__file__))).resolve()
    brain_dir = repo_root / "ERPPrototype" / "Documentation" / "brain"
    errors: list[str] = []

    indexed_count, log_count = validate_decisions(brain_dir, errors)
    alias_count = validate_aliases(brain_dir, errors)

    if args.expect_head:
        head = git_head(repo_root)
        if not head:
            fail(errors, "Unable to resolve Git HEAD while --expect-head is enabled")
        else:
            index = load_json_yaml(brain_dir / "decisions-index.yaml", errors)
            baseline = index.get("indexedAgainstCommit") if index else None
            # An index can be intentionally older than HEAD after the commit that
            # introduces it, so CI does not require equality by default. This flag
            # is only for explicit snapshot checks.
            if baseline and not head.lower().startswith(str(baseline).lower()):
                fail(errors, f"Project Brain baseline {baseline} does not match Git HEAD {head}")

    if errors:
        print("PROJECT BRAIN VALIDATION: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("PROJECT BRAIN VALIDATION: PASS")
    print(f"- indexed decisions: {indexed_count}/{log_count} (partial migration is allowed)")
    print(f"- field aliases: {alias_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
