# D-series D5 rule contract

Rule ID: `D5`

The D5 rule detects a high-confidence subset of self-referential verification:

- an equality assertion in a JavaScript or TypeScript test/spec file or `__tests__` directory;
- Node `assert.equal`, `assert.strictEqual`, `assert.deepEqual`, or `assert.deepStrictEqual`, or
  Jest/Vitest `expect(...).toBe`, `toEqual`, or `toStrictEqual`;
- a direct expected-value identifier imported from a first-party module, visibly named as an
  expectation (`EXPECTED...` or camel-case `expected...`); and
- the actual expression exercises a separate imported binding from that same module.

The rule cites the assertion line, not the subject module. It abstains on literals, locally defined
expectations, expected values imported from an independent oracle module, non-equality matchers,
computed or transformed expected expressions, test helpers outside recognizable test paths, and
imports not resolved inside the first-party TypeScript/JavaScript module graph.

This is a separate opt-in D-series pack entrypoint (`@cejel/cejel/d-series`). It does not feed the
A1-B6 Witan rubric, alter certificate scores, or change the published leaderboard. The historical
dual-control D5 seeds DC-04, DC-05, DC-07, and DC-10 remain semantic D5 examples rather than exact
acceptance proof; their frozen D5 result remains cited `0 / 4` and paired-clean findings `0 / 4`.
