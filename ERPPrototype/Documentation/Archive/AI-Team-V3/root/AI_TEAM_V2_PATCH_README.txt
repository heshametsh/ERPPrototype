ERP Prototype AI Team V2 Test Harness

Purpose: local Codex qualification only. No runtime ERP files are changed by this patch.

Adds/updates:
- ERP AI Team Codex skill V2
- generic specialist role prompts
- generic reviewer/Lead schemas
- deterministic repo cleanliness guard
- deterministic reviewer completion gate
- generic Finding Gate mission support
- 10 isolated qualification missions + post-run oracles
- V2 qualification plan documentation

Important:
- Qualification missions are review/design only.
- Run one test at a time, e.g. $erp-ai-team test AIT-01
- Do not use previous mission reports as current-code evidence.
