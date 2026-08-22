# ERP AI Team V2 test missions

This folder is a **test harness**, not Project Brain and not runtime product truth.

- `test-suite-v2.yaml` contains the mission inputs the Orchestrator may read before routing.
- `oracles-v2.yaml` contains test expectations. The Orchestrator and reviewers MUST NOT read it before reviewer selection/completion. It is evaluation-only.
- Both files are JSON-compatible YAML so deterministic Python checks can parse them without a YAML dependency.
- Test missions are review/design tests only. They do not authorize runtime code changes.
- Oracle expectations are test metadata, not permanent product dependencies and never become ChangeImpact for future missions.
- A prior mission result must not be supplied to later independent reviewers unless the test explicitly evaluates synthesis/repeatability.
- Product Partner tests are separate from engineering-review tests.
- Test outcomes may be retained as historical test evidence, but they never replace current-code discovery or normative Decisions.
