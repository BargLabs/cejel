# Decision-contract conformance pack

Status: **experimental, opt-in, and non-scoring**

The decision-contract pack verifies a deliberately narrow assertion supplied by the repository:
a named premise in one local JavaScript or TypeScript function must have a supported dependency
path to a named property of that function's returned object. It reports an absent edge only when
the source shape is fully understood. Unsupported control flow, calls, mutable bindings, dynamic
property access, missing sources, and parse failures are explicit abstentions.

This is a conformance check, not an automatic semantic-defect classifier. It does not establish
recall for “decorative predicates,” does not run in the default Cejel scan, and cannot change an
A1–B6 score or public leaderboard row.

## Manifest

Place the exact manifest at `.cejel/decision-contracts.json`:

```json
{
  "schemaVersion": "cejel-decision-contracts-v1",
  "contracts": [
    {
      "id": "release-approval",
      "source": "src/release.mjs",
      "function": "observe",
      "decisionProperty": "released",
      "requiredPremises": ["approval.status", "approval.signed"]
    }
  ]
}
```

Each source path must remain inside the scanned repository. Contract IDs and required premises
must be unique. A required premise must be a direct immutable local binding or a statically named
property of an object-literal binding. The returned decision may depend on that premise through a
chain of direct immutable local expressions. Calls are not interpreted.

The package entrypoint is `@cejel/cejel/decision-contracts`. `scanDecisionContracts(repoRoot)`
uses only the fixed manifest path. `evaluateDecisionContracts(repoRoot, manifest)` accepts an
already parsed manifest for a sealed harness. Both return separate `findings` and `abstentions`.

## Claim boundary

A finding supports only this statement:

> For the named decision contract and supported local-function shape, Cejel found no dependency
> edge from the named premise to the named returned decision.

It does not prove that the decision is wrong, that every execution ignores the premise, or that
Cejel detects the surrounding semantic defect class without an authored contract.
