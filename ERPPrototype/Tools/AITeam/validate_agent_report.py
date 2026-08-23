#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LOC = re.compile(r"^(?P<file>[^:\r\n]+):(?P<line>[1-9][0-9]*)$")
FULL_SHA = re.compile(r"^[0-9a-fA-F]{40}$")
FINDING_ID = re.compile(r"^[A-Z][A-Z0-9-]*-[0-9]{2}$")


def die(msg: str) -> None:
    print(f"AI FINDING GATE: FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def check_location(repo_root: Path, location: str) -> None:
    if not location or len(location) > 260:
        die("evidence location must be a repository-relative file:line and <= 260 characters")
    m = LOC.fullmatch(location)
    if not m:
        die("evidence location must be a repository-relative file:line")
    rel = m.group("file")
    if len(rel) > 240 or Path(rel).is_absolute() or re.match(r"^[A-Za-z]:", rel):
        die(f"invalid repository-relative evidence path: {rel}")
    try:
        root = repo_root.resolve()
        p = (root / rel).resolve()
        p.relative_to(root)
    except (OSError, RuntimeError, ValueError) as ex:
        die(f"invalid evidence path {rel!r}: {ex}")
    if not p.is_file():
        die(f"evidence file missing: {rel}")
    line_no = int(m.group("line"))
    try:
        line_count = sum(1 for _ in p.open("r", encoding="utf-8", errors="ignore"))
    except OSError as ex:
        die(f"cannot read evidence file: {ex}")
    if line_no > line_count:
        die(f"evidence line {line_no} > {line_count}: {rel}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Fallback deterministic Finding Gate (PowerShell gate is primary on Windows).")
    ap.add_argument("report", type=Path)
    ap.add_argument("--repo-root", type=Path, required=True)
    ap.add_argument("--expected-sha", required=True)
    ap.add_argument("--expected-mission", required=True)
    ap.add_argument("--expected-role", default=None)
    ap.add_argument("--lead-view", type=Path, default=None)
    args = ap.parse_args()

    try:
        data = json.loads(args.report.read_text(encoding="utf-8"))
    except Exception as ex:
        die(f"cannot parse report JSON: {ex}")

    for key in ["schemaVersion", "agentRole", "mission", "commitSha", "summary", "coverage", "findings", "confidenceTelemetry"]:
        if key not in data:
            die(f"missing required field {key}")

    if data["schemaVersion"] != 2:
        die("wrong schemaVersion; expected 2")
    if data["mission"] != args.expected_mission:
        die("mission does not match expected mission")
    if not FULL_SHA.fullmatch(str(data["commitSha"])) or data["commitSha"].lower() != args.expected_sha.lower():
        die("commitSha must exactly match the expected full 40-character SHA")
    if args.expected_role and data["agentRole"] != args.expected_role:
        die(f"agentRole {data['agentRole']!r} does not match expected {args.expected_role!r}")

    coverage = data["coverage"]
    if not isinstance(coverage, dict):
        die("coverage must be an object")
    for key in ["inspectedAreas", "evidenceAnchors", "excludedAsIrrelevant", "unresolved"]:
        if key not in coverage or not isinstance(coverage[key], list):
            die(f"coverage.{key} must be an array")
    if not coverage["inspectedAreas"]:
        die("coverage.inspectedAreas must be non-empty")
    if not coverage["evidenceAnchors"]:
        die("coverage.evidenceAnchors must be non-empty")
    for anchor in coverage["evidenceAnchors"]:
        check_location(args.repo_root, str(anchor))

    findings = data["findings"]
    if not isinstance(findings, list) or len(findings) > 5:
        die("findings must be an array with at most 5 items")

    ids: set[str] = set()
    for i, f in enumerate(findings, 1):
        if not isinstance(f, dict):
            die(f"finding {i} must be an object")
        for key in ["id", "claim", "evidence", "impact", "verification", "challenge"]:
            if key not in f or f[key] in (None, "", []):
                die(f"finding {i} missing/non-empty {key}")
        if not FINDING_ID.fullmatch(str(f["id"])):
            die(f"finding {i} invalid id")
        if f["id"] in ids:
            die(f"duplicate finding id {f['id']}")
        ids.add(f["id"])
        if not isinstance(f["evidence"], list):
            die(f"finding {i} evidence must be a list")
        for e in f["evidence"]:
            if not isinstance(e, dict) or not str(e.get("detail", "")).strip():
                die(f"finding {i} evidence detail is required")
            check_location(args.repo_root, str(e.get("location", "")))

    if args.lead_view:
        lead = dict(data)
        lead.pop("confidenceTelemetry", None)
        args.lead_view.parent.mkdir(parents=True, exist_ok=True)
        args.lead_view.write_text(json.dumps(lead, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"AI FINDING GATE: PASS ({data['agentRole']}, {len(findings)} findings)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
