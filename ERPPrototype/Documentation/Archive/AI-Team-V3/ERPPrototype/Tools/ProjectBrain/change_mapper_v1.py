#!/usr/bin/env python3
"""Tool-assisted Change Mapper V1 and PartialAmount canary.

This is intentionally an evidence collector, not a dependency oracle. It starts
from the current repository and the alias registry, classifies hits by repository
zone, and runs a known-field canary. It never uses an old Change Map as input.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

TEXT_EXTENSIONS = {
    ".cs", ".razor", ".js", ".json", ".md", ".sql", ".ps1",
    ".yml", ".yaml", ".txt", ".csproj", ".slnx"
}
SKIP_PARTS = {".git", "bin", "obj", "node_modules"}


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parents[3]


def resolve_commit(repo_root: Path, explicit: str | None) -> str:
    if explicit:
        return explicit
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception as exc:
        raise SystemExit("Git HEAD is unavailable; pass --commit for archive/snapshot runs.") from exc


def load_alias_registry(repo_root: Path) -> dict:
    path = repo_root / "ERPPrototype" / "Documentation" / "brain" / "field-aliases.yaml"
    return json.loads(path.read_text(encoding="utf-8"))


def classify_zone(rel: str) -> str:
    p = rel.replace("\\", "/")
    lower = p.lower()
    if (
        "/documentation/" in lower
        or lower.endswith("/start_here_erp_prototype.md")
        or lower.endswith("/readme.md")
        or lower.endswith("manifest.json")
        or "_manifest" in lower
    ):
        return "documentation-context"
    if "/erpprototype.e2etests/" in lower or "/erpprototype.integrationtests/" in lower:
        return "tests-verification"
    if "/wwwroot/grid-shootout/" in lower or "/design-lab/" in lower or "eventprobe" in lower:
        return "lab-probe-not-runtime-dependency"
    if "/migrations/" in lower:
        return "database-history"
    if "/tools/projectbrain/" in lower:
        return "tooling-self-not-runtime"
    if "/tools/" in lower:
        return "tooling-support-not-runtime"
    if "/wwwroot/js/tabulator" in lower:
        return "tabulator-legacy-reference"
    if lower.endswith("/components/pages/workorders.razor") or lower.endswith("/components/pages/workorders.razor.cs"):
        return "tabulator-current-runtime-reference"
    if "/components/pages/workorders.save" in lower or "/data/" in lower:
        return "shared-server-runtime"
    if "/wwwroot/js/revogrid" in lower or "/wwwroot/js/workorderfinancialrules.js" in lower:
        return "revo-target-runtime"
    if "workordersrevogrid" in lower:
        return "revo-target-runtime"
    return "other-current-code"


def iter_text_files(repo_root: Path):
    for path in (repo_root / "ERPPrototype").rglob("*"):
        if not path.is_file():
            continue
        rel_parts = set(path.relative_to(repo_root).parts)
        if rel_parts & SKIP_PARTS:
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 3_000_000:
                continue
        except OSError:
            continue
        yield path


def scan_aliases_fallback(repo_root: Path, aliases: list[str]) -> list[dict]:
    tokens = sorted(set(aliases), key=len, reverse=True)
    patterns = [(token, re.compile(rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])")) for token in tokens]
    hits: list[dict] = []
    for path in iter_text_files(repo_root):
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        rel = path.relative_to(repo_root).as_posix()
        zone = classify_zone(rel)
        for line_no, line in enumerate(lines, 1):
            matched = [token for token, pattern in patterns if pattern.search(line)]
            if matched:
                hits.append({
                    "file": rel,
                    "line": line_no,
                    "aliases": matched,
                    "zone": zone,
                    "text": line.strip()[:240],
                })
    return hits


def scan_aliases_git(repo_root: Path, aliases: list[str]) -> tuple[list[dict], str]:
    """Prefer git grep over opening every repository file.

    git grep searches tracked working-tree content quickly. If Git is unavailable or
    returns an unexpected error, fall back to the original bounded Python scan.
    """
    tokens = sorted(set(aliases), key=len, reverse=True)
    if not tokens:
        return [], "none"

    cmd = ["git", "-C", str(repo_root), "grep", "-n", "-I", "-w"]
    for token in tokens:
        cmd.extend(["-e", token])
    cmd.extend(["--", "ERPPrototype"])

    cp = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    if cp.returncode not in (0, 1):
        return scan_aliases_fallback(repo_root, aliases), "python-fallback"

    patterns = [(token, re.compile(rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])")) for token in tokens]
    hits: list[dict] = []
    for raw in cp.stdout.splitlines():
        # git grep -n output is repo-relative path:line:text.
        parts = raw.split(":", 2)
        if len(parts) != 3:
            continue
        rel, line_raw, line = parts
        try:
            line_no = int(line_raw)
        except ValueError:
            continue
        matched = [token for token, pattern in patterns if pattern.search(line)]
        if not matched:
            continue
        hits.append({
            "file": rel.replace("\\", "/"),
            "line": line_no,
            "aliases": matched,
            "zone": classify_zone(rel),
            "text": line.strip()[:240],
        })
    return hits, "git-grep"


def has_evidence(hits: list[dict], file_suffix: str, token: str | None = None) -> dict | None:
    for hit in hits:
        if hit["file"].endswith(file_suffix) and (token is None or token in hit["aliases"] or token in hit["text"]):
            return hit
    return None


def decision_section(decision_log: Path, decision_id: str) -> str:
    text = decision_log.read_text(encoding="utf-8")
    match = re.search(
        rf"^##\s+{re.escape(decision_id)}\b(?P<body>.*?)(?=^##\s+DEC-\d{{3}}\b|\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(0) if match else ""


def find_snippet_evidence(repo_root: Path, relative_file: str, snippets: list[str]) -> dict | None:
    path = repo_root / relative_file
    if not path.exists():
        return None
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    found = []
    for snippet in snippets:
        match = next(((i, line.strip()) for i, line in enumerate(lines, 1) if snippet in line), None)
        if not match:
            return None
        found.append({"line": match[0], "text": match[1][:240], "snippet": snippet})
    return {"file": relative_file, "matches": found}


def run_partial_canary(repo_root: Path, commit: str, hits: list[dict]) -> dict:
    # These checks encode the manually-known dependency surface for the *canary*.
    # They are not used as routing hints for ordinary future missions.
    required = {
        "entity-model": (
            "ERPPrototype/Data/Entities/WorkOrder.cs",
            ["public decimal? PartialAmount { get; set; }"],
        ),
        "field-registry": (
            "ERPPrototype/Data/WorkOrderFieldRegistry.cs",
            ['public const string PartialAmount = "partialAmount";', "FinancialFields"],
        ),
        "query": (
            "ERPPrototype/Data/WorkOrderQueryService.cs",
            ["workOrder.PartialAmount"],
        ),
        "revo-page-mapping": (
            "ERPPrototype/Components/Pages/WorkOrdersRevoGridNativeGate5A.razor.cs",
            ["PartialAmount = workOrder.PartialAmount", "WorkOrderFinancialRules.CalculateRemainingAmount"],
        ),
        "revo-column": (
            "ERPPrototype/wwwroot/js/revoGridNativeGate5A.js",
            ['prop: "partialAmount"', 'prop: "remainingAmount"'],
        ),
        "revo-change-bridge": (
            "ERPPrototype/wwwroot/js/revoGridChangeBridge.js",
            ['"partialAmount"', "FINANCIAL_INPUT_FIELDS", "syncDerivedFinancialFields"],
        ),
        "browser-financial-rule": (
            "ERPPrototype/wwwroot/js/workOrderFinancialRules.js",
            ["row.partialAmount", "row.remainingAmount = nextRemaining"],
        ),
        "server-financial-rule": (
            "ERPPrototype/Data/WorkOrderFinancialRules.cs",
            ["workOrder.PartialAmount > workOrder.WorkOrderValue", "CalculateRemainingAmount("],
        ),
        "save-plan-validation": (
            "ERPPrototype/Data/WorkOrderSavePlanBuilder.cs",
            ["WorkOrderFieldRegistry.FinancialFields", "WorkOrderFinancialRules.Validate("],
        ),
        "database-constraint": (
            "ERPPrototype/Data/ApplicationDbContext.cs",
            ["CK_WorkOrders_PartialAmount_NotAboveValue", "[PartialAmount] <= [WorkOrderValue]"],
        ),
        "integration-test": (
            "ERPPrototype/ERPPrototype.IntegrationTests/WorkOrderSaveIntegrationTests.cs",
            ["PartialAmountAboveValueIsRejectedWithoutChangingDatabaseAsync", "invalid.PartialAmount = 100_000.01m"],
        ),
    }
    layers = {}
    for name, (relative_file, snippets) in required.items():
        semantic_evidence = find_snippet_evidence(repo_root, relative_file, snippets)
        alias_evidence = next((hit for hit in hits if hit["file"] == relative_file), None)
        found = semantic_evidence is not None and alias_evidence is not None
        layers[name] = {
            "status": "found" if found else "missing",
            "evidence": {
                "semantic": semantic_evidence,
                "aliasHit": alias_evidence,
            },
        }

    gate_page = repo_root / "ERPPrototype" / "Components" / "Pages" / "WorkOrdersRevoGridGate5B5.razor"
    gate_text = gate_page.read_text(encoding="utf-8") if gate_page.exists() else ""
    route_ok = (
        '@page "/work-orders-revogrid-gate5b5"' in gate_text
        and 'EnableChangeEngine="true"' in gate_text
        and 'EnablePaste="true"' in gate_text
    )
    layers["target-route"] = {
        "status": "found" if route_ok else "missing",
        "evidence": {
            "file": gate_page.relative_to(repo_root).as_posix() if gate_page.exists() else None,
            "text": "Gate 5B-5 route + Change Engine/Paste enabled" if route_ok else "Expected route/config not proven",
        },
    }

    decision_log = repo_root / "ERPPrototype" / "Documentation" / "08_DECISIONS_LOG.md"
    dec038 = decision_section(decision_log, "DEC-038")
    documented_save_gap = bool(re.search(r"no database Save|no database save", dec038))

    native_cs = repo_root / "ERPPrototype" / "Components" / "Pages" / "WorkOrdersRevoGridNativeGate5A.razor.cs"
    native_text = native_cs.read_text(encoding="utf-8", errors="ignore") if native_cs.exists() else ""
    revo_save_wiring_found = any(
        marker in native_text
        for marker in ("WorkOrderSavePlanBuilder", "PrepareSave", "SaveRequestPreparation", "SaveAsync(")
    )

    save_gap = {
        "status": "implemented" if revo_save_wiring_found else ("documented-gap" if documented_save_gap else "unexplained-gap"),
        "evidence": {
            "revoSaveWiringFound": revo_save_wiring_found,
            "dec038DocumentsNoDatabaseSave": documented_save_gap,
        },
    }

    missing = [name for name, value in layers.items() if value["status"] == "missing"]
    if missing:
        result = "FAIL"
    elif save_gap["status"] == "unexplained-gap":
        result = "FAIL"
    elif save_gap["status"] == "documented-gap":
        result = "PASS_WITH_DOCUMENTED_GAP"
    else:
        result = "PASS"

    zones = Counter(hit["zone"] for hit in hits)
    files_by_zone: dict[str, set[str]] = defaultdict(set)
    for hit in hits:
        files_by_zone[hit["zone"]].add(hit["file"])

    return {
        "canary": "PartialAmount",
        "commitSha": commit,
        "result": result,
        "layers": layers,
        "revoPersistenceBinding": save_gap,
        "zoneSummary": {
            zone: {"hits": zones[zone], "files": len(files_by_zone[zone])}
            for zone in sorted(zones)
        },
        "interpretation": (
            "The mapper found the manually-known cross-layer PartialAmount path with alias + semantic evidence and did not invent a Revo Save binding that DEC-038 says is not implemented yet."
            if result == "PASS_WITH_DOCUMENTED_GAP"
            else "Review missing/unexplained layers before trusting mapper routing."
        ),
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--field", default="PartialAmount")
    parser.add_argument("--commit", default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--canary", action="store_true", help="Run the PartialAmount trust canary")
    args = parser.parse_args()

    repo_root = (args.repo_root or repo_root_from_script()).resolve()
    commit = resolve_commit(repo_root, args.commit)
    registry = load_alias_registry(repo_root)
    fields = registry.get("fields", {})
    if args.field not in fields:
        print(f"Unknown logical field: {args.field}", file=sys.stderr)
        return 2

    aliases_by_layer = fields[args.field].get("aliasesByLayer", {})
    aliases = sorted({alias for values in aliases_by_layer.values() for alias in values})
    if not aliases:
        print(f"No aliases declared for {args.field}", file=sys.stderr)
        return 2

    scan_started = time.perf_counter()
    hits, scan_method = scan_aliases_git(repo_root, aliases)
    scan_elapsed_ms = round((time.perf_counter() - scan_started) * 1000)
    zones = Counter(hit["zone"] for hit in hits)
    files_by_zone: dict[str, set[str]] = defaultdict(set)
    for hit in hits:
        files_by_zone[hit["zone"]].add(hit["file"])

    runtime_zones = {"shared-server-runtime", "revo-target-runtime"}
    report = {
        "schemaVersion": 1,
        "logicalField": args.field,
        "commitSha": commit,
        "scanMethod": scan_method,
        "scanMilliseconds": scan_elapsed_ms,
        "aliases": aliases_by_layer,
        "totalHits": len(hits),
        "zoneSummary": {
            zone: {
                "hits": zones[zone],
                "files": len(files_by_zone[zone])
            }
            for zone in sorted(zones)
        },
        "runtimeCandidateFiles": sorted({
            file
            for zone in runtime_zones
            for file in files_by_zone.get(zone, set())
        }),
        "filesByZone": {
            zone: sorted(files)
            for zone, files in sorted(files_by_zone.items())
        },
    }

    canary = None
    if args.canary:
        if args.field != "PartialAmount":
            print("V1 trust canary is defined only for PartialAmount.", file=sys.stderr)
            return 2
        canary = run_partial_canary(repo_root, commit, hits)
        report["canary"] = canary

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"CHANGE MAP V1 — {args.field} @ {commit}")
    print(f"- aliases searched: {', '.join(aliases)}")
    print(f"- scan: {scan_method} / {scan_elapsed_ms} ms")
    print(f"- total evidence hits: {len(hits)}")
    for zone, count in sorted(zones.items()):
        print(f"- {zone}: {len(files_by_zone[zone])} files / {count} hits")
    if canary:
        print(f"- canary result: {canary['result']}")
        for layer, value in canary["layers"].items():
            print(f"  - {layer}: {value['status']}")
        print(f"  - Revo persistence binding: {canary['revoPersistenceBinding']['status']}")
        print(f"  - {canary['interpretation']}")

    return 0 if not canary or canary["result"].startswith("PASS") else 1


if __name__ == "__main__":
    sys.exit(main())
