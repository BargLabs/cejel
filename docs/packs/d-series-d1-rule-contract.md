# D-series D1 rule contract

Rule ID: `D1`

The first D-series rule detects a high-confidence subset of declared-but-unread configuration:

- an exported JavaScript/TypeScript object whose identifier or file identifies it as config or a
  schema;
- a binding boolean key (`require*`, `enforce*`, `fail*`, `must*`, `allow*`, `enable*`, or
  `disable*`) declared as a boolean literal, a boolean schema descriptor, or a `.boolean()` schema
  member;
- at least one sibling key is read through the resolved first-party TypeScript module graph; and
- the candidate object never escapes into a spread, destructure, computed access, call argument,
  return, assignment, or other use that could read keys dynamically.

For Markdown frontmatter, the same binding-boolean restriction applies. At least one sibling key
must be read by a non-escaping function parameter named `frontmatter`. The rule cites the line that
declares the unread key.

The detector abstains when it cannot prove the negative. It does not claim coverage for arbitrary
key names, nested/dynamic schema construction, YAML anchors, framework-consumed conventional
config, reflection, or code outside the resolved local JavaScript/TypeScript graph.

This is a separate opt-in D-series pack entrypoint (`@cejel/cejel/d-series`). It does not feed the
A1-B6 Witan rubric, alter certificate scores, or change the published leaderboard. The historical
dual-control D1 seeds DC-01, DC-03, and DC-11 remain semantic D1 examples rather than exact
acceptance proof; their frozen D1 result remains cited `0 / 3` and paired-clean findings `0 / 3`.
