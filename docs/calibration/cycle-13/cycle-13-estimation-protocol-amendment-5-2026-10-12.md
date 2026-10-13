> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol, amendment 5: the estimator's carried seal fields, mapped to cycle 13 before any label is scored

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Written after both label sets were
sealed and before any label is joined to a unit, any withheld-evidence label is derived, or any
figure is computed.

## 1. Why, and why now

`docs/calibration/untouched-estimator-spec-v4.json` carries three fields from v3 verbatim (`completedLabelSeal`, `implementationSeal`,
`crossWaveAggregation`) and says they "bind cycle 13 as written; the packet and seal card satisfies
them or a signed amendment changes them before any label". Neither happened. The first two name
cycle 12's file layout (`sealed/labels-sha256.json`, `sealed/completed-review.csv`, a cohort
`hashes.json` used by scanning and scoring), which cycle 13 does not have, and no record mapped
them before the operator labelled.

**Disclosed:** this amendment is signed after labelling (first pass sealed 2026-10-05, re-label
sealed 2026-10-12), not before it as the spec required. It changes no label, unit, weight, class,
estimator rule, threshold or figure definition, and it is signed before any label is scored, so
it cannot be chosen in light of a result.

## 2. `completedLabelSeal`, as it applies to cycle 13

The label seal for cycle 13 is the pair of seal files written by
(private record), each recorded by a signed record before scoring:

| Set | Seal file sha256 | Label file sha256 | Case list sha256 | Record |
|---|---|---|---|---|
| Operator, first pass (177) | `a88f5afe873759b7f4d5065b4f7ad68f1ca204269cef7c54c2f306fc5c00756a` | `71edbf19f4790b90bbe394496d1e934def1d95be9a827ea30a02528c159351e8` | `8c44d5a79906e4ec3069cdf8c24b00128cd685a3367519093ae5ba2a52584d2e` | `docs/calibration/cycle-13-operator-label-seal-2026-10-05.md` |
| Operator, re-label (40) | `842b6677d3dfe9c41422b9157cfc2dd5d851d2582be7f302302ae37275597391` | `d554abc8012ebf49e6d6dfe70050c26ef6877f7d9ce94356aa709a50a8661309` | `da939f1895845f6f3166a5cc1ae0151dedbae90c727c7b521a55a048fd8a8e65` | `docs/calibration/cycle-13-operator-relabel-seal-2026-10-12.md` |

- The scoring run refuses unless both seal files and both label files hash to these values,
  before it opens the sealed key for the join.
- Cycle 13 has no external negative-control artifacts. Its controls are the shared,
  arm-independent labels (protocol §2).
- The sealed key was read before scoring only by the re-label list step, which refuses until the
  operator's first set is sealed and still matches its seal.

## 3. `implementationSeal`, as it applies to cycle 13

- **Scanning.** Cycle 13 was not scanned by the alfred tree. Both arms were scored by the published
  `@cejel/cejel@0.4.11` (gitHead `d30ac4ba`), whose registry tarball integrity `sha512-eY0qu+jmO4bPY…`
  is recorded in (private record). That pin is the scanning side of this field.
- **Scoring, as written.** Before the one scoring run, a `hashes.json` is written in custody binding
  every tracked regular file (no symlink, canonical path inside the checkout) under
  (private record), plus the root and
  workspace package manifests, the lockfile and the TypeScript configuration, at the commit the run
  uses. Its sha256 is recorded out of band in an operator-signed pre-run record. The run requires
  that sha256, recomputes it, records it in its output, and fails closed on any mismatch.
- **Also required:** the blob of (private record) at the run commit
  equals its pin in the live producer-blob closure.

## 4. `crossWaveAggregation`

Cycle 13 has one scan, so the field pools a single wave. No change.

## 5. What this does not change

The estimand, cohort, draw, unit classes, case weights, labels, ruling W, estimator v4 and its
configuration, the validity rules, P1 and P2, and amendment 4's within-rater statistic. The
estimate uses the first-pass labels only.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-12T21:12:04Z`
- Signature: Houman Azimi-Nejadi — cycle 13's label and implementation seals mapped, before any label is scored
