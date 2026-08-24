#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic completion gate for selected AI reviewers.")
    ap.add_argument("--required", nargs="+", required=True)
    ap.add_argument("--passed", nargs="*", default=[])
    args = ap.parse_args()

    required = list(dict.fromkeys(args.required))
    passed = set(args.passed)
    missing = [r for r in required if r not in passed]
    if missing:
        print("AI REVIEWER COMPLETION GATE: FAIL: missing required reviewer(s): " + ", ".join(missing), file=sys.stderr)
        return 1
    print("AI REVIEWER COMPLETION GATE: PASS: " + ", ".join(required))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
