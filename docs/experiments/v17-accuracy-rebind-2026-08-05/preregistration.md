# v17 accuracy re-bind — preregistration

Status: preregistered before any re-bind scan or current-detector execution against the cohort.

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Decision and scope

This is a re-bind of Cejel's published free-core v17 figures to the current Cejel detector. It is
not a new calibration study, relabeling exercise, detector-improvement effort, or leaderboard
refresh. It uses the recovered frozen corpus and labels exactly as they were sealed. No detector,
rubric weight, threshold, criterion, score derivation, label, original preregistration, or original
GO record may be changed during this experiment.

The result may establish only whether the named current detector produces estimates comparable to
the published v17 estimates under the frozen evidence and label sets. It does not change the
original 2026-07-25 decision or its claim boundary.

## Immutable provenance

| Role | Binding |
|---|---|
| Current detector under test | `BargLabs/cejel@d53066e0073de66d32b7e4aa58286c7c7354fedb` (`main` when this protocol was written) |
| Historical baseline detector | `BargLabs/alfred@8eff810a44014d06e257faa06cc2286e8ce639ae` |
| Original v50 preregistration closure | `BargLabs/alfred@465d9427f352522830090420d52ebebee50d041b` |
| Frozen 200-repository manifest | `BargLabs/alfred@7354b40`, `docs/calibration/free-core-untouched-holdout-v50-2026-07-24/manifest-wave-1.json`, SHA-256 `b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3` |
| Sealed original result | `BargLabs/alfred@7354b40`, `wave-1/sealed/results-v2.json`, SHA-256 `249284f7093e5e3c6cc48f9ed82c62f5cdc2a31c069b5e7ce7ebc443862d1037` |

The manifest contains exactly 200 selected repositories and binds each to its frozen Git revision.
It is the only permissible corpus; unavailable, unreadable, oversized, excluded, denied-path, or
non-regular inputs are accounted for rather than replaced. Alfred is a read-only source of the
frozen artifacts and is not modified by this experiment.

The sealed labels remain the ground truth: 1,005 finding-review rows, 2,200 criterion-review rows,
and 200 abstention-review rows. Their completed-review SHA-256 values are respectively
`b09758b9b7800bcc0834ca3ba2fd5dbbe5c7602b1db9bdedbe479c5bf4078487`,
`e2b633b339f99a59844ec697477e3a97d6bb59d1073c6355106b86c571b10feb`, and
`da5980c229a0b1c990bcd1d35bdf23ab5a72f27633f80ece2c500352fd7ec131`.

The baseline provenance has a publication defect: Cejel's published GO record identifies its
baseline detector revision by a bare commit SHA that resolves only in a private repository. An
external evaluator auditing Cejel's published accuracy figure from the public repository cannot
resolve it. The figure is not independently checkable at its own provenance. This experiment does
not edit that immutable GO record. After this re-bind is reported, that defect is raised as a
separate visible correction.

## Execution boundary

The re-bind runs the unmodified detector named above against only the frozen repository revisions.
It must verify the Cejel `HEAD` before the first corpus operation and again before the result commit.
Any mismatch is a protocol failure, not a reason to substitute a newer revision. Repository code,
tests, hooks, builds, imports, binaries, notebooks, and generated programs are never executed.

There is one ordered execution. A checkpoint resume may continue incomplete frozen positions but
may not rescan completed positions, replace an unavailable position, or change the corpus. A
detector bug found during execution is recorded; the run finishes and reports it. No repair or
second run is permitted under this preregistration.

If any published leaderboard score moves, execution stops before any other repository or artifact
is changed. That movement is reported as a dated downstream consequence, not folded into this
result.

## Primary metrics and fixed comparison rule

The implementation reuses the frozen estimator definitions, clustered-bootstrap method, and
interval construction from the sealed v50 result. The primary metrics, published point estimates,
and original 95% intervals are:

| Metric | Published estimate | Original 95% interval |
|---|---:|---:|
| Finding precision | 96.43% | 94.16%–98.40% |
| Finding worst-case recall | 95.64% | 92.23%–98.67% |
| Finding worst-case FPR | 0.66% | 0.29%–1.10% |
| Criterion applicability exact | 100.00% | 100.00%–100.00% |
| Criterion state exact | 91.77% | 89.73%–93.65% |

For each metric, **reproduced** means the current point estimate is inside its corresponding
published interval and the estimator denominator is comparable. **Drift** means the point estimate
is outside the interval in either direction; an improvement is drift and receives the same
explanation requirement as a regression. **Not comparable** is the only permitted result when a
denominator or estimator cannot support a sound comparison; it must say why rather than display a
misleading number.

The report also preserves the original study's reported abstention outcomes—0.00% inappropriate
scoring and 0.00% inappropriate abstention, each with a 0.00%–0.00% interval—as separate selective
risk outputs. They do not replace any primary metric.

## Abstention and denominators

An abstention where a sealed label exists is a declared non-answer, not a false negative. Treating
it as a miss would punish the current detector for the conservative abstention invariant introduced
in `d53066e`; it would also falsely convert missing evidence into a measured negative. An abstention
can never increase a composite score.

For every metric requiring a detector state, the primary current estimate uses the **answered
denominator**: the relevant sealed-label cases for which the current detector produced a state.
The report prints numerator and answered denominator next to each estimate and interval. The
abstention rate is reported separately as `abstained / relevant sealed-label cases`, alongside the
baseline abstention result and its direction of movement.

The report also prints a full 2,200-row criterion accounting table: sealed label class, current
answered count, current abstained count, state-comparable count, exact-state count, and not-exact
count. The original state-exact estimate's actual decisive-label denominator was 925, not 2,200:
the remaining sealed rows are `insufficient_context` and have no ground-truth state. Accordingly,
the report will not mislabel a 925-row state comparison as a 2,200-denominator accuracy estimate.
Instead, the 2,200-row table exposes complete coverage and abstention accounting; any attempt to
collapse it into state accuracy is reported as not comparable.

For finding precision, worst-case recall, and FPR, the report preserves the original candidate and
control estimator populations and weights. It reports answered, abstained, and insufficient counts
for those populations without silently moving an abstention into a false-positive or false-negative
cell. For criterion applicability and state, it reports the corresponding sealed review counts,
including the 925 decisive state labels and all 2,200 stored rows.

## Predictions recorded before execution

1. Abstentions will rise relative to the frozen detector because `d53066e` deliberately makes
   content-read failure conservative. A fall is anomalous and must be explained before publication.
2. Skip counts will become non-zero where the frozen harness reported zero, because current
   production size gates and read guards account for unreadable, too-large, excluded-extension,
   denied-path, and non-regular inputs. A zero means no rule matched that skip class, never that
   the corpus was clean.
3. Finding precision will be roughly stable. The post-decision changes harden reading and
   abstention rather than changing `rubric.ts` weights; Phase 0 found no post-decision change to
   that file. Any material movement is reported as drift under the fixed rule above.

## Required result artifacts

Before reporting, persist and authenticate:

- the verified detector commit, corpus-manifest hash, source-label hashes, and frozen estimator
  source hashes;
- one row for each of the 200 manifest positions, including completion status and no substitutions;
- full skip accounting by unreadable, too-large, excluded extension, denied path, and non-regular
  reason, plus filesystem errno classes where available;
- each primary metric with point estimate, interval, numerator, answered denominator, original
  comparison, and reproduced/drift/not-comparable disposition;
- abstention rate and direction relative to baseline, plus the complete 2,200-row criterion
  accounting table; and
- any published leaderboard-score movement before any follow-on modification.

This preregistration is immutable once committed. Any correction, code change, or additional run
requires a separate, later protocol and must cite this one.
