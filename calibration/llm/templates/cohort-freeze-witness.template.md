# Free LLM cohort freeze witness

- Witness record ID: `replace-with-internal-record-id`
- Protocol: `cejel-llm-calibration-v1`
- Selection policy: `llm-selection-v1.1` (re-locked before detector results)
- Superseded policy: `llm-selection-v1`
- Selection policy byte SHA-256: `706c0c47786b4e36da455c80e72e7d4d61212a64972d87e79488d9a7ac5277fc`
- Golden candidate byte SHA-256: `4612d3f2330ae0ba8a4416adf5723fdb69c00e4fefca703ef6b93afbec7c5014`
- Untouched candidate byte SHA-256: `1d27ab86c85980e8ee516c672dc37934ee1df9b13842200ad20f2f28d826eeb3`
- Reserve candidate byte SHA-256: `b8c84b333b8c5239782e0282a887961be53113094937db47a5829ceaa00425ae`
- Selection amendments byte SHA-256: `d72b42743f10eeb193c1d74a277aec1b58f01bdbd62b9bcbed123cf2a0254146`
- Detector results seen before review: `no`

## Independent review records

Each reviewer confirms that it reviewed `llm-selection-v1.1`, both 24-repository candidate lists,
the complete ordered reserve list, and all selection amendments in an isolated pass; found no
cohort overlap or detector-result-driven selection; and approved the metadata-only re-lock and
freeze before either cohort is scanned. Record reviewer kind honestly.

- Review method: `two_human | two_independent_ai`
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

Store the completed witness records in the approved internal governance system. Pass both files to
the freezer so their exact byte hashes are bound in `review_bindings`; the manifest also binds its
opaque `internal-witness:<record-id>` attestation. Do not publish personal signatures or private
contact information.
