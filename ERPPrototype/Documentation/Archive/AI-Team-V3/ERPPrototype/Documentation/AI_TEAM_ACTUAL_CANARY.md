# AI Team Actual Canary — PartialAmount

This is the first real multi-agent workflow test. It is intentionally manual (`workflow_dispatch`) and read-only.

Flow:
1. Deterministic Project Brain + PartialAmount canary must pass.
2. Three Codex reviewer jobs run independently on the same Git commit: Change Mapper, Architecture, Regression.
3. Each report must pass a deterministic Finding Gate. Evidence must point to an existing repository `file:line`; missing evidence rejects the report before the Lead sees it.
4. Confidence is recorded only as hidden telemetry and is stripped from the Lead input.
5. Lead Integrator sees only the three validated compact reports and produces one final canary verdict. It does not implement code.

This workflow is a canary of the AI-team design, not approval to implement DEC-040.

Required GitHub secret: `OPENAI_API_KEY`. The workflow is manual to avoid accidental API spend.
