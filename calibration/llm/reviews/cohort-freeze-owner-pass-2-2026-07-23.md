# Free LLM cohort freeze — owner-delegated AI review pass 2

- Reviewer identity: `codex-owner-review-pass-2`
- Reviewer kind: AI, sequential pass by the same Codex task that performed pass 1
- Review lens: fail-closed tooling, reproducibility, blinding chronology, and governance truth
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

The pass traced the versioned v1.2 paths through cohort freezing, calibration validation, detector
freezing, frozen-cohort execution, metric computation, schemas, tests, and operator documentation.
The current tools name `untouched-candidates-v1.2.json`,
`replacement-selection-v1.2.json`, `golden-manifest-v1.2.json`, and
`untouched-manifest-v1.2.json` explicitly; the retired v1.1 untouched files cannot silently satisfy
the v1.2 measurement contract.

Manifests bind the policy, both candidate lists, reserve list, amendment log, replacement-selection
record, and these two exact review-record byte hashes. Metric validation independently verifies the
replacement record's protocol, policy, incident, no-detector/no-source assertions, two proposal
identities, candidate canonical hash, record self-hash, selected size, and selected order.

This pass found and corrected one governance-description defect before approval: sequential
self-review had previously been representable only as `two_independent_ai`. The manifest contract
now records `two_sequential_ai_passes` with `internal_ai_two_pass_review`, so it does not overstate
reviewer independence. The calibration suite passes 48/48 and the contract validator reports 24
golden, 24 untouched, zero overlap, locked thresholds, and a pending immutable freeze.

No detector was run. No source opportunity or label from the fresh untouched cohort was shown to
the rule-authoring orchestrator. This is the second of two sequential reviews by the same AI task,
not an independent human or independent second model.
