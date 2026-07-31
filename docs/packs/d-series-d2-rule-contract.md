# D-series D2 rule contract

Rule ID: `D2`

This rule detects a high-confidence subset of swallowed errors in first-party JavaScript and
TypeScript:

- a `try` block contains an awaited operation and ends by returning an object with literal
  `ok: true` and a non-empty static `message`;
- the corresponding `catch` binds the thrown value to a simple identifier;
- the catch body consists only of a return of an object with literal `ok: false` and a non-empty
  static `message`; and
- the bound value is not referenced by that return.

This exact shape proves that the catch neither rethrows nor logs the bound error and that the
message surfaced to the caller cannot incorporate it. The finding cites the binding line.

The detector abstains from multi-statement catches, dynamic messages, alternative result shapes,
synchronous operations, catches without a binding, and any catch that rethrows, logs, or references
the bound value. These abstentions bound coverage: the rule does not claim to detect all swallowed
errors, including static replacement exceptions or swallowed errors surfaced through other APIs.

This is a separate opt-in D-series pack entrypoint (`@cejel/cejel/d-series`). It does not feed the
A1-B6 Witan rubric, alter certificate scores, or change the published leaderboard. The frozen
16-case dual-control suite contains no D2 seed (`n = 0`), so historical D2 recall was not measured.
The additional exact-signature acceptance case is reported separately and is not a frozen seed.
