# D-series D3 rule contract

Rule ID: `D3`

This rule detects one high-confidence JavaScript/TypeScript subset of unasserted set transforms:

- a function has a simple identifier parameter naming the input collection;
- a direct call to that parameter's `.filter(...)` is assigned to a const-bound output;
- a distinct const-bound explanation ledger is initialized to an empty array; and
- a three-property object containing literal `ok: true` plus shorthand properties for the output
  and explanation ledger is returned directly from the same function.

This exact shape surfaces success while statically guaranteeing that any removed input is absent
from the returned explanation ledger. The finding cites the filter call. The paired repair records
the excluded entries and fails loud unless input cardinality equals output plus explained
cardinality.

The detector abstains from generic filters and maps, transforms outside a function, non-parameter
sources, populated or dynamically created explanation collections, non-literal success states,
renamed return properties, and returned objects with any additional properties. These abstentions
bound coverage: the rule does not claim to detect unasserted transforms generally.

This is a separate opt-in D-series pack entrypoint (`@cejel/cejel/d-series`). It does not feed the
A1-B6 Witan rubric, alter certificate scores, or change the published leaderboard. The historical
dual-control D3 seeds DC-08, DC-09, DC-13, DC-14, and DC-15 remain semantic D3 examples rather than
exact acceptance proof; their frozen D3 result remains cited `0 / 5` and paired-clean findings
`0 / 5`. The additional exact-signature specimen is reported separately and is not a frozen seed.

D6 remains outside this source-rule stream; this rule makes no reasoning-defect claim.
