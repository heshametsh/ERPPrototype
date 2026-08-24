#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def run_git(repo: Path, *args: str, binary: bool = False):
    cp = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if cp.returncode != 0:
        err = cp.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {err}")
    return cp.stdout if binary else cp.stdout.decode("utf-8", errors="replace")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def capture(repo: Path) -> dict:
    repo = repo.resolve()
    head = run_git(repo, "rev-parse", "HEAD").strip()
    branch = run_git(repo, "branch", "--show-current").strip()
    status_bytes = run_git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all", binary=True)
    tracked_diff = run_git(repo, "diff", "--binary", "HEAD", "--", ".", binary=True)

    raw_untracked = run_git(repo, "ls-files", "--others", "--exclude-standard", "-z", binary=True)
    untracked = []
    for raw in raw_untracked.split(b"\0"):
        if not raw:
            continue
        rel = raw.decode("utf-8", errors="surrogateescape")
        p = repo / rel
        if p.is_file():
            try:
                digest = sha256_bytes(p.read_bytes())
                size = p.stat().st_size
            except OSError:
                digest = "UNREADABLE"
                size = -1
            untracked.append({"path": rel, "sha256": digest, "size": size})
        else:
            untracked.append({"path": rel, "sha256": "NON_FILE", "size": -1})

    untracked.sort(key=lambda x: x["path"])
    fingerprint_payload = {
        "head": head,
        "statusSha256": sha256_bytes(status_bytes),
        "trackedDiffSha256": sha256_bytes(tracked_diff),
        "untracked": untracked,
    }
    fingerprint = sha256_bytes(json.dumps(fingerprint_payload, sort_keys=True, ensure_ascii=False).encode("utf-8"))

    return {
        "schemaVersion": 1,
        "repoRoot": str(repo),
        "head": head,
        "branch": branch,
        "isClean": len(status_bytes) == 0,
        "fingerprint": fingerprint,
        "statusSha256": fingerprint_payload["statusSha256"],
        "trackedDiffSha256": fingerprint_payload["trackedDiffSha256"],
        "untracked": untracked,
    }


def cmd_capture(args) -> int:
    state = capture(args.repo_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"AI CLEANLINESS GATE: BASELINE {state['fingerprint']} @ {state['head'][:12]}")
    return 0


def cmd_compare(args) -> int:
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    current = capture(args.repo_root)
    if baseline.get("fingerprint") == current.get("fingerprint"):
        print(f"AI CLEANLINESS GATE: PASS {current['fingerprint']} @ {current['head'][:12]}")
        return 0

    print("AI CLEANLINESS GATE: FAIL: repository state changed during review", file=sys.stderr)
    if baseline.get("head") != current.get("head"):
        print(f"  HEAD: {baseline.get('head')} -> {current.get('head')}", file=sys.stderr)
    if baseline.get("trackedDiffSha256") != current.get("trackedDiffSha256"):
        print("  Tracked working-tree/staged diff changed.", file=sys.stderr)
    if baseline.get("untracked") != current.get("untracked"):
        old = {x['path']: x for x in baseline.get('untracked', [])}
        new = {x['path']: x for x in current.get('untracked', [])}
        added = sorted(set(new) - set(old))
        removed = sorted(set(old) - set(new))
        changed = sorted(k for k in set(old) & set(new) if old[k] != new[k])
        if added:
            print("  Untracked added: " + ", ".join(added[:20]), file=sys.stderr)
        if removed:
            print("  Untracked removed: " + ", ".join(removed[:20]), file=sys.stderr)
        if changed:
            print("  Untracked changed: " + ", ".join(changed[:20]), file=sys.stderr)
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic repo-state guard for read-only AI review missions.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    cap = sub.add_parser("capture")
    cap.add_argument("--repo-root", type=Path, required=True)
    cap.add_argument("--output", type=Path, required=True)
    cap.set_defaults(func=cmd_capture)

    cmp = sub.add_parser("compare")
    cmp.add_argument("--repo-root", type=Path, required=True)
    cmp.add_argument("--baseline", type=Path, required=True)
    cmp.set_defaults(func=cmd_compare)

    args = ap.parse_args()
    try:
        return args.func(args)
    except Exception as ex:
        print(f"AI CLEANLINESS GATE: ERROR: {ex}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
