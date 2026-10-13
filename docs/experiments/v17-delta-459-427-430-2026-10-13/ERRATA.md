# Erratum — fixes arm withdrawn before execution

**CONSTRAINTS-VERSION: 2026-08-01.5**

The preregistration at dd9e16a92d8b1dc46dd85635607e1210fc800d44 is unchanged. Its before459
and after459 arms completed 23/23 public rows each with no errors. No per-row score comparison
was read before the additional source regression check below. Raw outputs remain local.

Before the fixes arm ran, an additional negative control showed that the candidate at
22f89a30a9a45a700ea1b684933d80ea3542b45d could infer an AVA binding from quoted import text.
A custom context object's is method then wrongly earned assertion credit. The control failed
against that candidate (1 failed, 33 passed), and was corrected by checking that the import
keyword remains outside the masked string text. UTF-16 offsets are preserved by the mask.

The original fixes arm was not run. This three-arm protocol is therefore incomplete, not a
completed evaluation with E0 satisfied. It is superseded by a new preregistration naming the
corrected source commit. The successor uses fresh output directories and discloses that its
unchanged before459 and after459 arms repeat these immutable baselines. This is a source
correction, not a retry or parameter adjustment to make a measured forecast hold. Original
outputs are not overwritten, and no target pins or scoring thresholds change.
