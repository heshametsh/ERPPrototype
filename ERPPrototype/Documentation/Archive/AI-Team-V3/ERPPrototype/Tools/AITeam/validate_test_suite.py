#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ID = re.compile(r"^AIT-[0-9]{2}$")


def fail(msg: str) -> None:
    print(f"AI TEST SUITE: FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as ex:
        fail(f"cannot parse {path}: {ex}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("suite", type=Path)
    ap.add_argument("--oracles", type=Path, required=True)
    args = ap.parse_args()

    data = load(args.suite)
    version = data.get("schemaVersion")
    if version not in (1, 2):
        fail("suite schemaVersion must be 1 or 2")
    missions = data.get("missions")
    if not isinstance(missions, list) or not missions:
        fail("missions must be a non-empty array")

    seen = set()
    for i, m in enumerate(missions, 1):
        mid = m.get("id")
        if not isinstance(mid, str) or not ID.fullmatch(mid):
            fail(f"mission {i} invalid id")
        if mid in seen:
            fail(f"duplicate mission id {mid}")
        seen.add(mid)
        for key in ["name", "purpose", "mode", "objective"]:
            if key not in m or m[key] in (None, "", []):
                fail(f"{mid} missing/non-empty {key}")
        if m["mode"] not in {"review", "product", "deterministic"}:
            fail(f"{mid} unsupported mode {m['mode']}")
        if any(k in m for k in ("routingHint", "successSignals", "failureSignals")):
            fail(f"{mid} leaks evaluation oracle into router-visible mission file")

    oracle_data = load(args.oracles)
    oracle_version = oracle_data.get("schemaVersion")
    if oracle_version not in (1, 2):
        fail("oracle schemaVersion must be 1 or 2")
    oracles = oracle_data.get("oracles")
    if not isinstance(oracles, list):
        fail("oracles must be an array")

    oracle_ids = set()
    for o in oracles:
        mid = o.get("id")
        if mid in oracle_ids:
            fail(f"duplicate oracle id {mid}")
        oracle_ids.add(mid)
        if mid not in seen:
            fail(f"oracle {mid} has no mission")
        if oracle_version == 1:
            if "routingExpectation" not in o or "successSignals" not in o:
                fail(f"oracle {mid} missing expectations")
        else:
            if not all(k in o for k in ("routing", "successSignals", "failureSignals")):
                fail(f"oracle {mid} missing V3 expectations")
            routing = o["routing"]
            if not all(k in routing for k in ("requiredRoles", "forbiddenRoles", "maxReviewers")):
                fail(f"oracle {mid} routing incomplete")

    if oracle_ids != seen:
        fail(f"missions missing oracles: {sorted(seen - oracle_ids)}")

    print(f"AI TEST SUITE: PASS ({len(missions)} missions, suite schema {version}, oracle schema {oracle_version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
