ERP Prototype AI Team V2.1 stabilization patch

Scope: test harness only. No ERP runtime code, reviewer prompts, test missions, or oracle answers are changed.

Adds:
- Windows-native deterministic gate module and entry point.
- Fast deterministic runner for AIT-04 and AIT-10.
- Mandatory temp evidence pack and phase timing rules.
- Codex skill fast-dispatch so zero-Agent tests do not spend minutes reading project context.

After applying and restarting Codex, first smoke test:
  $erp-ai-team test AIT-04

Expected: no subagents, no Lead, deterministic rejection, complete evidence pack, materially faster than the V2 baseline.
