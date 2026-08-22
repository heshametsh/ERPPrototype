ERP AI Team V3.4 - Hybrid Local Router
======================================

Purpose
-------
Stop spending a model call on routine routing. Clear missions are routed by a deterministic PowerShell rule engine. Codex Mission Router is fallback-only for genuinely ambiguous missions.

Key changes
-----------
- New .ai/routing-rules.json: auditable/tunable English + Arabic routing signals.
- New AITeamLocalRouter.psm1: zero-model local routing engine.
- run_ai_test.ps1: local route first; AI router only if local decision is ambiguous.
- smoke-router: now LOCAL ONLY. It never logs in to Codex and never launches a model.
- Runtime compatibility: routes all 8 non-deterministic V3 qualification missions locally and checks the hidden oracle only after each route is produced.
- Doctor reports local-router rule health and strategy.
- mission-router.md is explicitly fallback-only.

Expected AIT-02 local smoke
---------------------------
selected: regression, change-mapper, revo (order may reflect score)
AI fallback recommended: False
routing oracle match: True
Codex attempts: 0
completed model calls: 0
tokens: 0

Safety / scope
--------------
No ERP runtime C#/Razor/JS/CSS/database code is changed.
No SKILL.md change is included; no Codex restart is required.
Qualification oracles are never read by the runtime local router. They are test-only assertions after routing.
