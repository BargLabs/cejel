# Free LLM cohort freeze — owner-delegated AI review pass 1

- Reviewer identity: `codex-owner-review-pass-1`
- Reviewer kind: AI, sequential pass by the same Codex task that performs pass 2
- Review lens: selection eligibility, cohort composition, exclusions, and content bindings
- Verdict: `APPROVE`
- Review date: `2026-07-23`
- Detector implementation inspected: no
- Detector output inspected: no
- Repository source or opportunity labels inspected: no

## Exact inputs

- Selection policy byte SHA-256:
  `ea366427612ed0fe867c83eae341e1edd30a21f64faa47c7307d4189ae9d1354`
- Golden candidates byte SHA-256:
  `065f7394f3d9281c8034853ea501f5ff69519fb3b5c815393b25f864d660bed5`
- Untouched candidates byte SHA-256:
  `483e634d8f7536605bd8508e02857819fd8660702ac8b61bf1c6684323852085`
- Reserve candidates byte SHA-256:
  `116e9ca1b4dbfdd28cfd8ec92c7e2ecc88f00f8839df4647baee6c0c512dfc6a`
- Selection amendments byte SHA-256:
  `541990b6592191c3928b7483ad5e27ddb79995f85a2a9e33cbe687baa4afbde1`
- Replacement selection byte SHA-256:
  `b758cbfd75f7cd9aad839d5f75882c3f86ee34c59c49ee55df25193e8b5cf848`
- Blinding incident byte SHA-256:
  `9447c2dcb1eeab948ac35af43eb90110bc302e219ef537f88dea47b7b75c1cdb`

## Findings

The pass verified 24 golden and 24 replacement untouched candidates, case-insensitive uniqueness,
and zero overlap. It independently recomputed the selected surface and provider strata. The
untouched cohort contains the locked `1/3/3/4/6/7` gateway/chat/local/RAG/agent/evaluation surface
counts and includes Anthropic, OpenAI, multi-provider, and local/open-model repositories.

Metadata-only resolution succeeded for all 48 candidates at full 40-character commits and Git root
trees. No candidate was archived, forked, unavailable, or over the declared size ceiling, so no
post-review replacement was needed. The original untouched v1.1 cohort is excluded from current
measurement, and the v1.2 replacement is disjoint from the complete 53-identity exclusion set.

The replacement record binds both metadata-only proposals, the selector, incident record,
exclusion set, candidate document, deterministic order, and its own canonical hash. The amendment
history preserves the earlier reserve changes and the later blinding recovery without claiming
that detector results informed selection.

This is one of two sequential reviews by the same AI task. It is not an independent human or an
independent second model.
