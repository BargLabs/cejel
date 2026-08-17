# D-series D6 proposal contract

Rule ID: `D6`

## Claim boundary

D6 is an uncalibrated proposal for two exact signatures in `.sh` and `.bash` files only:

- a first-token, self-announcing control name (`guard`, `check`, `verify`, `validate`, `audit`,
  `integrity`, or `test`) whose status is neutralised or ignored immediately before a success
  report; and
- a removal/deployment operation followed by an unconditional success report and `return 0`,
  including the exact `git -C ... worktree remove` shape with one intervening best-effort command.

The second signature includes the motivating first-party exemplar at commit `f21fdaf9`,
`scripts/goal_stream_lifecycle.sh` lines 282–285. The acceptance fixture reproduces its command
shape without importing third-party material.

A finding says only that the observed operation result cannot affect the named report or outcome.
It does not say that the control did not run, that its subject is false, or that all unobserved
controls are absent. A zero-finding result means no exact signature matched.

## Abstention and coverage output

The full inspection output records each input file as one of:

- `examined-finding`;
- `examined-clean`;
- `abstained-ambiguous`, when an explicit `advisory`, `best effort`, `non-blocking`, or `optional`
  marker makes the control deliberately non-gating; or
- `abstained-non-coverage`, including every non-`.sh`/`.bash` file.

These states are machine-visible in `D6Inspection.files`, with detailed reasons in
`D6Inspection.abstentions`. The `detectUnobservedControls` helper is a finding-only projection and
must never be interpreted as a coverage result. `D6Inspection.certificateWording` carries the same
boundary: it reports examined and abstained counts and expressly refuses the general absence claim.

## Registration and release status

Registration is export-only from `@cejel/cejel/d-series`. D6 is not wired into `cejel scan`, does not
appear in a released certificate, does not feed the A1–B6 Witan rubric, and does not change scoring or
the leaderboard. Release notes and certificate copy must not imply otherwise.

## Precision gate

The 23-repository pinned public-cohort gate first runs the seeded reaper-shaped positive control and
requires exactly one finding. Only after that control passes may zero findings on the unseeded cohort
count as evidence about false positives rather than detector silence. No third-party scan output is
committed by the gate.
