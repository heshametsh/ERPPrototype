# Reviewer Optimized Protocol V1

Version: `reviewer-optimized-v1`

Start with targeted, batched discovery directly tied to the acceptance criteria. Read the most relevant implementation and test evidence together, then expand only when a concrete dependency or an unresolved criterion requires it. Do not repeatedly reconfirm settled facts.

Inspect third-party source or documentation narrowly: only when the criterion depends on framework/runtime behavior that current project evidence cannot establish. Correctness takes priority over token economy.

Classify every material acceptance criterion before stopping. Return exactly one disposition:

- `FINDINGS` for evidence-backed material defects.
- `NO_FINDINGS_EVIDENCE_SUFFICIENT` when the reviewer has sufficient evidence for every criterion.
- `EVIDENCE_REQUIRED` when a criterion remains unresolved; specify the exact missing test/evidence and what result would support or refute the concern.

Model confidence is not evidence. A static conclusion does not certify browser runtime, event ordering, virtualization, asynchronous lifecycle, or third-party runtime behavior; identify the needed runtime evidence instead.
