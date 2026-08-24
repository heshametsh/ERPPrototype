# ERP AI Team qualification missions

- `test-suite-v2.yaml` / `oracles-v2.yaml` are preserved historical qualification inputs used for the original V2/V2.1 baseline.
- `test-suite-v3.yaml` / `oracles-v3.yaml` are the current default inputs used by `.ai/team-config.json`.

Rules:
- Mission files are router-visible.
- Oracle files are evaluation-only and must not enter model context before reviewer completion.
- V3 routing oracles use `requiredRoles`, `forbiddenRoles`, and `maxReviewers` rather than requiring one brittle exact role set in every case.
- Qualification tests run one at a time while the team is being tuned.
- No qualification mission authorizes runtime code changes.
