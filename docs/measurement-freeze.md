# Measurement freeze guard

**CONSTRAINTS-VERSION: 2026-08-01.5**

`FREEZE.md` is a JSON declaration. The guard refuses any diff touching non-test source below `src/witan/`, including deletion and either side of a rename. Tests and fixture directories are exempt. Packaging, CI, changelogs and non-scoring CLI outside that directory remain editable.

A PR reads the declaration from base history, so editing, renaming or deleting the marker cannot clear it. Scheduled/manual sweeps recover the original declaration from reachable history, compare the entire tracked tree to its pin, and also detect marker tampering after a direct push. No marker anywhere in the inspected history means no freeze. Unreadable revisions, malformed declarations or an empty frozen inventory refuse explicitly. Full history is required; the workflow fetches it.

## Required operator commissioning

This PR proposes the status `measurement-freeze`. **It is not yet a required check.** The observed main protection requires only `cla` and `build-test`, with no required PR review. After reviewing and landing the workflow, preserve those checks and add `measurement-freeze` to main's required status checks. Verify the actual check-run context before saving. No branch-protection setting is mutated by this proposal.

A scheduled run detects a direct push after it happens; it does not prevent one. Configure branch/ruleset push restrictions separately if prevention is required. As with the existing disclosure-boundary workflow, the guard workflow/source itself requires review: a mutable PR workflow is not a tamper-proof trust root.

Closing conditions are words in the declaration, not a timer or automatic exemption. After the draw completes or a signed superseding decision exists, the operator must review a guard transition tied to that decision. Ordinary marker edits and deletion continue to refuse, including during closure; do not treat deletion as the closing event.

## Real-history verification — an expected pass in the request is contradicted

At `cfd9b16ffc94dfcb699ba433e16fa091d960906c`, there are 26 non-test files in scope; at the declared pin there are 25. There are four commits after original pin `2af3407`, and one after amended pin `85eab44`, not five after the amended pin.

Expected: #312 must name `repo-signals.ts`. Observed:

```
freeze REFUSED window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c frozenFiles=25 changedPaths=7
  src/witan/repo-signals.ts
Hold scoring changes. The window closes only when the cycle-13 draw completes or an operator-signed decision supersedes B10 Amendment 1; elapsed time and waiting PRs do not close it. Marker edits/deletion require operator review of the declaring authority and guard transition.
```

#314 is not tests-only: its real diff adds `rubric-fingerprint.ts` and modifies `schemas.ts` and `scoring.ts`. It adds a fingerprint to reports and changes the report format. The requested path policy cannot both freeze every non-test file and pass this diff. No ad-hoc exemption is introduced. Observed:

```
freeze REFUSED window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c frozenFiles=25 changedPaths=13
  src/witan/rubric-fingerprint.ts
  src/witan/schemas.ts
  src/witan/scoring.ts
Hold scoring changes. The window closes only when the cycle-13 draw completes or an operator-signed decision supersedes B10 Amendment 1; elapsed time and waiting PRs do not close it. Marker edits/deletion require operator review of the declaring authority and guard transition.
```

The full-tree sweep at the same main reports those same three paths. The operator must decide this discrepancy; the candidate pin has not been moved to make the check green.

Reproduce with:

```
node scripts/check-measurement-freeze.mjs --marker FREEZE.md --base 85eab44^ --head 85eab44
node scripts/check-measurement-freeze.mjs --marker FREEZE.md --base cfd9b16^ --head cfd9b16
node scripts/check-measurement-freeze.mjs --marker FREEZE.md --full-tree --head cfd9b16
```

`--marker` is only a local historical-audit aid when the historical trees predate the marker; workflows never accept an override. Once a marker exists in base history, that declaration takes precedence.

## Regression evidence

RED on baseline with only the new test file: 11 tests, 0 passed, 11 failed (`MODULE_NOT_FOUND`, no guard existed). GREEN with implementation: 11 tests, 11 passed, 0 failed. Cases cover source edits, tests/fixtures control, marker edit/deletion/rename in both PR and full-tree modes, no-marker control, source rename, full-tree drift, unreadable revisions, and shallow-history refusal. Build passed; full Vitest suite passed 87 files / 1,341 tests, including the structural offline-boundary check. No scoring source changed.
