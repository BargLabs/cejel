# D-series D4 rule contract

Rule ID: `D4`

This rule detects one high-confidence subset of pass-by-absence in first-party JavaScript and
TypeScript. Every part of the following static signature must be present:

- a named first-party function has only statically shaped object returns relevant to the matcher;
- those returns include literal `ok: false` with a non-empty static `error`, literal `ok: true`
  with an empty array, and literal `ok: true` with a populated array under the same collection key;
- a caller consists of exactly three statements: bind a direct invocation of that function, bind
  `result.ok ? result.<collection> : []`, then return exactly `{ ok: true, <collection> }` using the
  fallback binding; and
- the finding cites the result binding in the caller, where the failure signal first becomes an
  empty collection.

This shape proves a narrow conflation: callee failure and successful emptiness produce the same
successful caller result. The detector does not infer that an empty value is wrong. It abstains
from indirect, awaited, method, callback, and dynamically resolved calls; non-literal result
shapes; callees without all three return variants; callers with any additional statement; and
callers that preserve or inspect failure. It makes no claim about the general D4 form, which is not
statically decidable.

The rule is exported only from the opt-in `@cejel/cejel/d-series` entrypoint. It does not feed the
A1-B6 Witan rubric, alter certificate scores, or change the published leaderboard. The additional
oracle-backed acceptance pair is outside the frozen historical denominator. DC-02, DC-06, DC-12,
and DC-14 remain semantic D4 examples rather than exact proof for this matcher; none is claimed as
caught. Their frozen result remains cited `0 / 4` and paired-clean findings `0 / 4`.

The detector was frozen before public-cohort observation and produced zero findings across all 23
public leaderboard repositories at their pinned revisions (`0 / 23`). The leaderboard tree was
byte-identical before and after the run. The machine-readable result is
`docs/experiments/d4-precision-gate-2026-07-31.json`.
