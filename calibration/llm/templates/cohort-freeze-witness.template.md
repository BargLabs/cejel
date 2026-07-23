# Free LLM cohort freeze witness

- Witness record ID: `replace-with-internal-record-id`
- Protocol: `cejel-llm-calibration-v1`
- Selection policy: `llm-selection-v1.2` (re-locked before detector results)
- Superseded policy: `llm-selection-v1.1`
- Selection policy byte SHA-256: `ea366427612ed0fe867c83eae341e1edd30a21f64faa47c7307d4189ae9d1354`
- Golden candidate byte SHA-256: `065f7394f3d9281c8034853ea501f5ff69519fb3b5c815393b25f864d660bed5`
- Untouched candidate byte SHA-256: `483e634d8f7536605bd8508e02857819fd8660702ac8b61bf1c6684323852085`
- Reserve candidate byte SHA-256: `116e9ca1b4dbfdd28cfd8ec92c7e2ecc88f00f8839df4647baee6c0c512dfc6a`
- Selection amendments byte SHA-256: `541990b6592191c3928b7483ad5e27ddb79995f85a2a9e33cbe687baa4afbde1`
- Detector results seen before review: `no`

## Independent review records

Each reviewer confirms that it reviewed `llm-selection-v1.2`, both 24-repository candidate lists,
the complete ordered reserve list, and all selection amendments in an isolated pass; found no
cohort overlap or detector-result-driven selection; and approved the metadata-only re-lock and
freeze before either cohort is scanned. Record reviewer kind honestly.

- Review method: `two_human | two_independent_ai | two_sequential_ai_passes`
- Reviewer 1 stable identity: `replace`
- Reviewer 1 kind: `human | ai`
- Reviewer 1 confirmation/date: `replace`
- Reviewer 1 review-record SHA-256: `replace`
- Reviewer 2 stable identity: `replace`
- Reviewer 2 kind: `human | ai`
- Reviewer 2 confirmation/date: `replace`
- Reviewer 2 review-record SHA-256: `replace`

## Amendments reviewed

- Six selected-candidate canonical renames and two reserve canonical renames preserve repository
  identity; the amendment log names each old and current identity.
- Four archived selected repositories are replaced without detector output: `gpt-engineer` by
  `OpenBMB/XAgent`, `AgentGPT` by `e2b-dev/fragments`, `TaskWeaver` by
  `browser-use/browser-use`, and `h2ogpt` by `mem0ai/mem0`.
- Archived reserve `NVIDIA/ChatRTX` is recorded as ineligible.
- Because metadata resolution exhausted the original `agent_tools` reserves, the policy was
  versioned from `llm-selection-v1` to `llm-selection-v1.1`, given an explicit exhausted-reserve
  extension rule, and re-locked before results. `browser-use/browser-use` was appended at reserve
  order 9 under that re-locked policy before any detector execution; thresholds and rules did not
  change.
- A later cross-review status message disclosed original untouched first-pass labels to the
  rule-authoring orchestrator before formal detector freeze. The original cohort is retired; no
  detector had run and no detector rule changed in response.
- Policy `llm-selection-v1.2` binds a completely disjoint replacement selected by the deterministic
  metadata-only record at byte SHA-256
  `b758cbfd75f7cd9aad839d5f75882c3f86ee34c59c49ee55df25193e8b5cf848`.
  Two independent AI reviews approved its exact bytes and are not represented as human review.

Store the completed witness records in the approved internal governance system. Pass both files to
the freezer so their exact byte hashes are bound in `review_bindings`; the manifest also binds its
opaque `internal-witness:<record-id>` attestation. Do not publish personal signatures or private
contact information.
