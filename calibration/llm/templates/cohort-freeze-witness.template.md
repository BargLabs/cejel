# Free LLM cohort freeze witness

- Witness record ID: `replace-with-internal-record-id`
- Protocol: `cejel-llm-calibration-v1`
- Selection policy: `llm-selection-v1.1` (re-locked before detector results)
- Superseded policy: `llm-selection-v1`
- Golden candidate SHA-256: `9ded2ffcf9bb51c4f724c98148516b5db86f734d9f603f03deebd1db54a24800`
- Untouched candidate SHA-256: `51bde909ee76df88c32575fc1f4cd087e20a93144eb95449b9ae40ce8ca2347b`
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

Store the completed witness record in the approved internal governance system. Put only its opaque
`internal-witness:<record-id>` reference in the public immutable manifests; do not publish personal
signatures or private contact information.
