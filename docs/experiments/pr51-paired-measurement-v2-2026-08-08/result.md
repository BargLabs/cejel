# PR #51 paired golden-cohort diagnostic v2 — result

Status: completed; locked disposition is to close #51 without merge.

**CONSTRAINTS-VERSION: 2026-08-01.3**

The v2 preregistration merged in #113 at `e3c1ba1db2cb9058098b278fa8dd30d303465b2f`.
The pre-result commitment is `50b8f21c57a2a88b3cf831dcf6f5f85ed499921f`. Baseline was
`e3c1ba1db2cb9058098b278fa8dd30d303465b2f`; the conflict-free, mechanically tree-verified
candidate was `c3d82a10b112d92a6d88915d2116d06a843edb3e`.

The detector-independent checkout utility's default clone could not read one frozen commit that was
no longer in the origin's advertised refs. The exact bound SHA remained directly fetchable. The
checkout was restarted from an empty root with an executor that explicitly fetched every manifest
SHA before the committed utility performed checkout and commit/tree verification. All 24 exact
checkouts completed. This changed no detector, input, label, or scoring procedure.

Both arms then ran in the preregistered order under the bound no-egress assets. The committed scorer
revalidated both clean detector roots, bundle bytes, pre-result ancestry, complete ordered arm
records, runtime, all 24 frozen source identities, and paired source digests.

| Arm | Findings | True positives | False positives | Abstentions | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 3 | 0 | 3 | 0 | 0 |
| Candidate | 3 | 0 | 3 | 0 | 0 |
| Delta | 0 | 0 | 0 | 0 | 0 |

The locked rule closes #51 when recall and false positives are unchanged. Therefore the disposition
is **close #51 without merge**.

This is a paired diagnostic on the retired v1.9 golden cohort. It is not a new calibration, release
claim, published-figure correction, or external claim. Raw arm artifacts remain private and outside
Git; `paired-result.json` contains only the aggregate and audit hashes emitted by the scorer.
