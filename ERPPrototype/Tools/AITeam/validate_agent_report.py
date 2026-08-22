#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-fA-F]{7,40}$")
LOC = re.compile(r"^(?P<file>.+):(?P<line>[1-9][0-9]*)$")


def die(msg: str) -> None:
    print(f"AI FINDING GATE: FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("report", type=Path)
    ap.add_argument("--repo-root", type=Path, required=True)
    ap.add_argument("--expected-sha", required=True)
    ap.add_argument("--expected-mission", default="PartialAmount-AI-Team-Canary")
    ap.add_argument("--lead-view", type=Path, default=None)
    args = ap.parse_args()

    data = json.loads(args.report.read_text(encoding="utf-8"))
    required = ["schemaVersion", "agentRole", "mission", "commitSha", "summary", "findings", "confidenceTelemetry"]
    for key in required:
        if key not in data:
            die(f"missing required field {key}")
    if data["schemaVersion"] != 1:
        die("wrong schemaVersion")
    if str(data["mission"]) != args.expected_mission:
        die(f"mission {data['mission']!r} does not match expected {args.expected_mission!r}")
    got = str(data["commitSha"])
    exp = args.expected_sha
    if not SHA.fullmatch(got) or not (got.lower().startswith(exp.lower()) or exp.lower().startswith(got.lower())):
        die(f"commitSha {got!r} does not match expected {exp!r}")
    if not isinstance(data["findings"], list) or len(data["findings"]) > 5:
        die("findings must be an array of at most 5 items")

    for i, f in enumerate(data["findings"], 1):
        for key in ["id", "claim", "evidence", "impact", "verification"]:
            if key not in f or f[key] in (None, "", []):
                die(f"finding {i} missing/non-empty {key}")
        if not isinstance(f["evidence"], list):
            die(f"finding {i} evidence must be a list")
        for e in f["evidence"]:
            m = LOC.fullmatch(str(e.get("location", "")))
            if not m:
                die(f"finding {i} evidence location must be file:line")
            p = (args.repo_root / m.group("file")).resolve()
            try:
                p.relative_to(args.repo_root.resolve())
            except ValueError:
                die(f"finding {i} evidence escapes repo: {p}")
            if not p.is_file():
                die(f"finding {i} evidence file missing: {m.group('file')}")
            line_no = int(m.group("line"))
            try:
                line_count = sum(1 for _ in p.open("r", encoding="utf-8", errors="ignore"))
            except OSError as ex:
                die(f"cannot read evidence file: {ex}")
            if line_no > line_count:
                die(f"finding {i} evidence line {line_no} > {line_count}: {m.group('file')}")

    if args.lead_view:
        lead = dict(data)
        lead.pop("confidenceTelemetry", None)
        args.lead_view.parent.mkdir(parents=True, exist_ok=True)
        args.lead_view.write_text(json.dumps(lead, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"AI FINDING GATE: PASS ({data['agentRole']}, {len(data['findings'])} findings)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
