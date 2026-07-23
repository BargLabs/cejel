# PR 23 AI review pass A — execution and security

- Reviewer: `codex-ai-review-a`
- Reviewed commit: `24bb80f321aa17e4534335a314708b2f1377b42c`
- Review type: isolated AI code review; not human review
- Cohort scans performed: no
- Result: `REQUEST_CHANGES`

## Verification performed

- Read the exact committed workflow, runner, detector-freeze, GitHub proof, evidence-bundle,
  no-egress, free-core parity, and public-claim paths.
- Ran the 40 calibration tests, 371 product tests, TypeScript checking, production build,
  calibration validator, distribution validator, workflow lint, and a real pack scan under the
  runtime deny hook.
- Confirmed the downloaded evidence archive is checked against GitHub's digest and its canonical
  receipt/report bindings are checked against the measurement input.

## Findings

1. **P1 — Free-core parity is not part of either trusted workflow artifact.** The new helper can
   execute two binaries, but the measurement still accepts its embedded payload without proving
   that the successful GitHub run generated it. The baseline commit is also not frozen in the
   pre-result commitment, so an arbitrary alternate commit/build can be presented as baseline.
2. **P1 — External public-surface claims are not live verified.** A claim-audit payload may contain
   safe text under an HTTPS URL while the actual npm, MCP, Smithery, GitHub, or cejel.dev surface
   contains different text. Hashing the supplied text does not authenticate the remote content.
3. **P2 — The runtime no-egress hook omits explicit UDP and TLS entry-point denial.** The committed
   test proves three paths, but `node:dgram` and direct `node:tls.connect` should be denied and
   probed before treating the runtime path as the pack's enforced no-egress path.

This revision is not approved. Preserve this review and re-review the exact corrective commit.
