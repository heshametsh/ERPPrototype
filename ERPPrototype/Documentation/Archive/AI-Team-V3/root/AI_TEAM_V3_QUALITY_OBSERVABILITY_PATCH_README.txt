ERP Prototype AI Team V3 — Quality + Observability Upgrade
Date: 2026-08-22
Baseline reviewed: a58497c9b7ecc5c34471b5ec4145e78834ce8c45

Scope
-----
This patch changes AI-team tooling, prompts, schemas, qualification files and documentation only.
It does NOT modify ERP runtime C#/Razor/JS/CSS/database code.

What improves
-------------
1. Known evidence location: %LOCALAPPDATA%\ERPPrototype\AI-Team\Runs\...
2. latest.json + runs-index.jsonl + trace.jsonl for live and historical tracking.
3. Harness manifest hashes the active Skill/config/prompts/schemas/scripts for every run.
4. Fast deterministic tests bypass project/document search and spawn zero model reviewers.
5. Reviewer reports must prove coverage, real file:line evidence, concrete verification, and a disconfirming challenge.
6. Zero findings are allowed; filler findings are not required.
7. Lead is schema-gated and must reopen current evidence for material agreed facts; it does not decide by vote.
8. Product & ERP Partner has a separate structured product-design contract and may recommend not building a weak feature.
9. Routing qualification uses required/forbidden/max reviewers instead of brittle exact-team matching.
10. Qualification starts from a clean worktree; normal reviews can intentionally start dirty but are fingerprint-anchored.
11. Current Change Maps are always rediscovered from current code; old ChangeImpact never seeds a new map.
12. Change Mapper uses git grep first, with the previous broad scan only as fallback.
13. Confidence is telemetry only and is removed before Lead context.
14. Ordinary prompt/config/script tuning is read fresh each run; a Codex restart should not be required for those changes.

One-time restart note
---------------------
This patch DOES change the Skill contract itself, so after applying/committing it, close/reopen Codex (or start a fresh Codex thread) once.
After V3 is loaded, normal prompt/config/harness tuning should not require repeated Codex restarts unless SKILL.md itself changes again.

Validation performed before packaging
------------------------------------
- V3 test suite/oracle deterministic validation: PASS (10 missions).
- JSON Schema Draft 2020-12 validation: PASS for reviewer/lead/product/mission schemas.
- Synthetic valid reviewer Finding Gate: PASS, including evidence anchor + challenge + confidence stripping.
- Python syntax compilation: PASS.
- PowerShell files received static structural checks (balanced delimiters) in the packaging environment.
- PowerShell execution was NOT available in the packaging environment, so the first Windows/Codex run is still required before V3 is considered proven.

First qualification runs after install
--------------------------------------
1. AIT-04 — prove the new persistent run tracking/fast path and compare against the 1.412s V2.1 baseline.
2. AIT-10 — prove missing-reviewer blocking under V3.
3. AIT-02 — first hard reviewer-quality benchmark (Multi-cell Delete).

Do not call V3 trusted before these runs and later qualification missions are inspected.
