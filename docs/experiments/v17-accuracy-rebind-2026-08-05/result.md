# v17 accuracy re-bind — result

**CONSTRAINTS-VERSION: 2026-08-01.3**

Detector: `BargLabs/cejel@d53066e0073de66d32b7e4aa58286c7c7354fedb`.
Preregistration merge: `4ca24bbf53e6f465984831f2dc2645d3cf0bd32c`.
Corpus manifest SHA-256: `b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3`.

The run completed all 200 pinned repositories in one ordered invocation. The run metadata, append-only
log, manifest, raw index, and 200 full per-repository reports are in `run/`. The detector checkout was
asserted as `d53066e` before execution. Every scoring child ran after its Git remote was removed and
under `sandbox-exec` with `deny network*`; repository code was not executed.

## Outcome

Finding recall over the answered denominator: **not comparable**. Finding precision and FPR are also
not comparable. Criterion applicability exact, state exact, within-one-state, and two-or-more error
are not comparable over either the answered or 2,200-row denominator.

This is not a favorable-subset result. The stored labels bind the baseline emitted finding and criterion
surfaces. The current reports retain the baseline verdict for all 200 repositories, but their criterion
surface differs in 24 repositories and their finding surface differs in seven. Using the old labels as
though those new surfaces had been reviewed would manufacture an accuracy comparison. No labels were
changed, no repository was substituted, and no re-run was performed.

## Abstention

Against the 195 decisive sealed abstention labels, d530 abstained on 37 and scored 158: **18.97%**.
That is identical to the baseline 18.97%; inappropriate scoring and inappropriate abstention are both
0%. The preregistered prediction that abstentions would rise therefore **failed**.

## Skip accounting

| Reason | Count |
|---|---:|
| Unreadable | 0 |
| Too large | 35 |
| Excluded extension | 47,495 |
| Denied path | 1,708 |
| Non-regular | 137 |

The unreadable zero means no unreadable-file rule matched; it does not mean the corpus was clean.
The other four categories are non-zero, as predicted.

No leaderboard artifact was read or written, so no published leaderboard score moved. No detector,
rubric, threshold, score derivation, stored label, or GO record changed.
