# Measurement-freeze supersession evidence — 2026-09-16

**CONSTRAINTS-VERSION: 2026-08-01.5**


## Currency re-derived before implementation

- `origin/main`: `cd75fc435d33bccc84293c8d1ce1a5a99685d6c0` (fetched).
- `FREEZE.md` pin: `85eab44b61fa31be00191d8bd5c262e281e8d65c`.
- Marker SHA-256: `dd7aa25fc1f0efe44f36a22e737edfb710e7ed628b96f215ce2a9735f80cad06`.
- Required contexts: `cla`, `build-test`, `calibration-signature`, `measurement-freeze`.
- Open PR members returned by GitHub:
  - #324 `docs(release): reconcile 0.4.9 rubric, changelog and currency evidence`
  - #323 `maeve: stage two lessons from the 0.4.9 release`
  - #322 `chore: track the pre-commit hook, ignore goal-stream logs`
  - #321 `maeve: record two untested-defence gaps in the measurement-freeze guard`
  - #307 `fix(a2): classify secret-shaped values by content context, not by path (prospective v24)` — held, untouched.

## RED before GREEN

Command for both runs:

```sh
node --test --test-reporter=tap scripts/check-measurement-freeze.node-test.mjs scripts/check-calibration-signatures.node-test.mjs
```

RED uses the new tests against the two guard scripts extracted byte-for-byte from
`origin/main` at the SHA above in a temporary directory. GREEN uses the implemented
scripts. The result lines below are copied from TAP; timing blocks and assertion
stack traces are omitted. Exit status was captured before formatting.

The request's claim that *every* case should fail on today's main cannot honestly
hold: deletion/source refusal and the two existing defences already work. Those
controls remain green on baseline. New transition/diagnostic cases are baseline
RED; targeted mutations prove sensitivity of the two previously untested defences.
The `%G?=E` fixture feeds Git an OpenPGP NO_PUBKEY verifier response and asserts
Git actually returns E before asserting the freeze refusal. Accepted transitions
use actual ephemeral SSH keys and actual signed commits, not a mocked verdict.


### Baseline RED

```text
exit=1
ok 1 - docs/calibration is guarded and neighbouring doc paths are not
not ok 2 - root FREEZE.md is guarded without prefix-matching neighbouring files
ok 3 - a comments-only allowed-signers file names no signer, so the guard cannot pass on it
not ok 4 - a malformed signer line is not counted as a key
ok 5 - E is not a pass: a signature from an unlisted key fails exactly like an unsigned commit
ok 6 - an empty range reports the count it examined, so a vacuous pass is legible
ok 7 - the documented invocation refuses instead of exiting 0 in silence
ok 8 - verification is pinned to the repository allowed-signers, not to ambient config
ok 9 - the pinned file is the one the guard reports its signer count from
ok 10 - marker + scoring source change refuses with actionable provenance
ok 11 - tests and fixtures remain editable while frozen
ok 12 - marker deleted refuses, including full-tree direct-push audit
ok 13 - marker edited refuses, including full-tree direct-push audit
ok 14 - marker renamed refuses, including full-tree direct-push audit
ok 15 - no marker in history + scoring source change passes explicitly
ok 16 - full-tree sweep reports scoring drift and counts examined source
ok 17 - full-tree unchanged source passes with a nonzero inventory
ok 18 - rename out of scoring scope and deletion cannot clear the guard
ok 19 - invalid revision is unreadable, never no freeze
ok 20 - a shallow checkout cannot turn missing declaration history into no freeze
ok 21 - PR diff uses merge-base so newer base changes are not attributed to the PR
not ok 22 - signed chained supersession moves the pin and governs subsequent full-tree sweeps
not ok 23 - signed supersession with absent chain refuses with chain diagnosis
not ok 24 - signed supersession with hash chain refuses with chain diagnosis
not ok 25 - signed supersession with pin chain refuses with chain diagnosis
not ok 26 - signed supersession with malformed chain refuses with chain diagnosis
not ok 27 - unsigned supersession names the missing signature even with a valid chain
not ok 28 - unsigned unchained edit names both missing requirements
not ok 29 - unverifiable E signature refuses a valid supersession like unsigned N
not ok 30 - unlisted fixture key is refused despite a valid chain
ok 31 - signed marker deletion still refuses
not ok 32 - missing allowed-signers refuses a chained transition as unreadable
not ok 33 - key-less allowed-signers refuses a chained transition as unreadable
ok 34 - empty frozen inventory is unreadable, never a successful empty sweep
ok 35 - __tests__/helpers.ts is excluded by its path part alone
not ok 36 - a second signed transition must supersede the currently effective marker
not ok 37 - an unsigned intermediate edit cannot be laundered by restoring the marker
not ok 38 - merge preserves the signed transition without requiring a signature on an unchanged merge
not ok 39 - competing signed successors are a fork even if a merge picks one marker
not ok 40 - a transition cannot authorize itself by replacing allowed-signers in the same commit
not ok 41 - signed transition passes PR mode but subsequent scoring source still refuses
not ok 42 - a merged side branch cannot hide an unsigned edit followed by restoration
# tests 42
# pass 22
# fail 20
# cancelled 0
# skipped 0
```


### Implementation GREEN

```text
exit=0
ok 1 - docs/calibration is guarded and neighbouring doc paths are not
ok 2 - root FREEZE.md is guarded without prefix-matching neighbouring files
ok 3 - a comments-only allowed-signers file names no signer, so the guard cannot pass on it
ok 4 - a malformed signer line is not counted as a key
ok 5 - E is not a pass: a signature from an unlisted key fails exactly like an unsigned commit
ok 6 - an empty range reports the count it examined, so a vacuous pass is legible
ok 7 - the documented invocation refuses instead of exiting 0 in silence
ok 8 - verification is pinned to the repository allowed-signers, not to ambient config
ok 9 - the pinned file is the one the guard reports its signer count from
ok 10 - marker + scoring source change refuses with actionable provenance
ok 11 - tests and fixtures remain editable while frozen
ok 12 - marker deleted refuses, including full-tree direct-push audit
ok 13 - marker edited refuses, including full-tree direct-push audit
ok 14 - marker renamed refuses, including full-tree direct-push audit
ok 15 - no marker in history + scoring source change passes explicitly
ok 16 - full-tree sweep reports scoring drift and counts examined source
ok 17 - full-tree unchanged source passes with a nonzero inventory
ok 18 - rename out of scoring scope and deletion cannot clear the guard
ok 19 - invalid revision is unreadable, never no freeze
ok 20 - a shallow checkout cannot turn missing declaration history into no freeze
ok 21 - PR diff uses merge-base so newer base changes are not attributed to the PR
ok 22 - signed chained supersession moves the pin and governs subsequent full-tree sweeps
ok 23 - signed supersession with absent chain refuses with chain diagnosis
ok 24 - signed supersession with hash chain refuses with chain diagnosis
ok 25 - signed supersession with pin chain refuses with chain diagnosis
ok 26 - signed supersession with malformed chain refuses with chain diagnosis
ok 27 - unsigned supersession names the missing signature even with a valid chain
ok 28 - unsigned unchained edit names both missing requirements
ok 29 - unverifiable E signature refuses a valid supersession like unsigned N
ok 30 - unlisted fixture key is refused despite a valid chain
ok 31 - signed marker deletion still refuses
ok 32 - missing allowed-signers refuses a chained transition as unreadable
ok 33 - key-less allowed-signers refuses a chained transition as unreadable
ok 34 - empty frozen inventory is unreadable, never a successful empty sweep
ok 35 - __tests__/helpers.ts is excluded by its path part alone
ok 36 - a second signed transition must supersede the currently effective marker
ok 37 - an unsigned intermediate edit cannot be laundered by restoring the marker
ok 38 - merge preserves the signed transition without requiring a signature on an unchanged merge
ok 39 - competing signed successors are a fork even if a merge picks one marker
ok 40 - a transition cannot authorize itself by replacing allowed-signers in the same commit
ok 41 - signed transition passes PR mode but subsequent scoring source still refuses
ok 42 - a merged side branch cannot hide an unsigned edit followed by restoration
# tests 42
# pass 42
# fail 0
# cancelled 0
# skipped 0
```


## Defence-removal evidence

Each mutation runs only its independent control in a temporary copy. It must exit
1; neither mutation touches the implementation in this proposal.

- Delete the `if (!inventory.length) throw ...` line; run with
  `--test-name-pattern='empty frozen inventory'`.
- Remove only `'__tests__'` from the path-part exclusion list; run with
  `--test-name-pattern='__tests__/helpers'`.


```text
zero-inventory exit=1
not ok 1 - empty frozen inventory is unreadable, never a successful empty sweep
# tests 1
# pass 0
# fail 1
```


```text
tests-path exit=1
not ok 1 - __tests__/helpers.ts is excluded by its path part alone
# tests 1
# pass 0
# fail 1
```


## Real history, exact emitted paths

```sh
node scripts/verify-measurement-freeze-history.mjs cd75fc435d33bccc84293c8d1ce1a5a99685d6c0
```

The script asserts status, nonzero inventory, verdict text, and the exact emitted
path list. For the last case it makes a temporary local clone of this real history,
adds an ephemeral fixture key, then signs a chained marker transition in that clone.
Only fixture authority is established; the real marker and allowlist are untouched.
The historical authority pointer is retained in that fixture, not represented as a
verification of the external amendment. Expected inventory: 25 at the old pin and
26 at the new pin. Expected offending members under the old pin are listed before
each run. Under the new pin the expected empty offending list is asserted together
with the nonzero source inventory.

```text
#312 (85eab44): expected REFUSED: src/witan/repo-signals.ts
exit=1
freeze REFUSED window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c pin=85eab44b61fa31be00191d8bd5c262e281e8d65c frozenFiles=25 changedPaths=7
  src/witan/repo-signals.ts
Hold scoring changes. The window closes only when the cycle-13 draw completes or an operator-signed decision supersedes B10 Amendment 1; elapsed time and waiting PRs do not close it. Marker changes require a matching supersedes chain and operator signature; deletion is forbidden.

#314 (cfd9b16): expected REFUSED: src/witan/rubric-fingerprint.ts, src/witan/schemas.ts, src/witan/scoring.ts
exit=1
freeze REFUSED window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c pin=85eab44b61fa31be00191d8bd5c262e281e8d65c frozenFiles=25 changedPaths=13
  src/witan/rubric-fingerprint.ts
  src/witan/schemas.ts
  src/witan/scoring.ts
Hold scoring changes. The window closes only when the cycle-13 draw completes or an operator-signed decision supersedes B10 Amendment 1; elapsed time and waiting PRs do not close it. Marker changes require a matching supersedes chain and operator signature; deletion is forbidden.

#315 (209a058): expected PASS with nonzero frozen inventory
exit=0
freeze PASS window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c pin=85eab44b61fa31be00191d8bd5c262e281e8d65c frozenFiles=25 changedPaths=13

Current main cd75fc435d33bccc84293c8d1ce1a5a99685d6c0, original pin: expected REFUSED: src/witan/rubric-fingerprint.ts, src/witan/schemas.ts, src/witan/scoring.ts
exit=1
freeze REFUSED window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c pin=85eab44b61fa31be00191d8bd5c262e281e8d65c frozenFiles=25 changedPaths=40
  src/witan/rubric-fingerprint.ts
  src/witan/schemas.ts
  src/witan/scoring.ts
Hold scoring changes. The window closes only when the cycle-13 draw completes or an operator-signed decision supersedes B10 Amendment 1; elapsed time and waiting PRs do not close it. Marker changes require a matching supersedes chain and operator signature; deletion is forbidden.

Current main cd75fc435d33bccc84293c8d1ce1a5a99685d6c0 plus fixture-only signed transition to cfd9b16ffc94dfcb699ba433e16fa091d960906c: expected PASS with nonzero frozen inventory
exit=0
freeze PASS window=cycle-13-v23-vs-v17 record=BargLabs/alfred:docs/calibration/cycle-13-carried-requirements.md@da1e6477b46f585ded85a8296704b756ccb11d2c pin=cfd9b16ffc94dfcb699ba433e16fa091d960906c frozenFiles=26 changedPaths=29
```


## Build and full suite

```text
pnpm build: exit=0, Build success
pnpm test: exit=0
Test Files  87 passed (87)
Tests       1352 passed (1352)
```

The full suite includes `witan CLI offline guarantee > finds no structural
offline-boundary violations in scoring source`, which passed. Node guard tests
run separately, as in CI. Local build/test dependencies were reused from the
existing installation; pnpm's pinned-version resolution required network-enabled
execution after sandboxed invocations stalled before producing output.

No live signing, live marker edit, real allowlist edit, scoring-source change,
calibration/experiment edit, merge, or branch-protection change is part of this
proposal. [Operator transition commands](measurement-freeze.md#operator-transition-after-this-proposal-is-reviewed-and-landed)
are the remaining live action. The signed amendment commit id must be supplied by
the operator; it was not present in the request.

## Independent-review follow-up: SSH envelope

The reviewer found that replacing `ok: status === 'G' && ssh` with
`ok: status === 'G'` left the original 42 tests green. The added regression creates
an actual disposable OpenPGP key and trusted keyring, signs a root `FREEZE.md`
commit, and asserts Git itself reports `G` with a PGP envelope. It then invokes the
real calibration-signature CLI and requires refusal naming `FREEZE.md`, `%G?=G`,
and `examinedCommitCount=1 verified=0 signers=1`. There is no mocked verifier in this
new case. Missing GnuPG is a failed test, not a skipped control.

Exact mutation in a temporary copy, leaving the proposal's implementation intact:

```diff
- return { sha: sha.slice(0, 8), status, subject, ok: status === 'G' && ssh };
+ return { sha: sha.slice(0, 8), status, subject, ok: status === 'G' };
```

```sh
node --test --test-reporter=tap --test-name-pattern='trusted OpenPGP' scripts/check-calibration-signatures.node-test.mjs
```

Mutation RED (captured exit 1; fixture setup succeeded and Git reported G):

```text
not ok 1 - a trusted OpenPGP G signature cannot satisfy the SSH allowlist
error: calibration_signature_guard examinedCommitCount=1 verified=1 signers=1
actual: 0
expected: 1
# tests 1
# pass 0
# fail 1
```

Restored implementation GREEN:

```text
node --test --test-reporter=tap scripts/check-calibration-signatures.node-test.mjs scripts/check-measurement-freeze.node-test.mjs
exit=0
# tests 43
# pass 43
# fail 0
# cancelled 0
# skipped 0
```

The initial sandboxed GPG attempt could not connect to its temporary agent. The
verified runs used permission for that isolated agent socket and a short temporary
path suitable for Unix socket limits. No real operator keyring was used.

The allowlist bootstrap was also re-derived after fetching main at
`e4010efb8de0f357403b19900ce58c2dbde2e259`: introduction commit
`77fd3d27850fa928bcea70ba5fae622e8bda4465` reports `E` with web-flow key id
`B5690EEEBB952194` in this environment. The disclosure in `docs/security/README.md`
separates initial enrollment trust from forward signature verification. A stale
test comment claiming this admission commit returned G was removed. No trust file
or production guard logic changed in this follow-up.

Follow-up build/full-suite verification:

```text
pnpm build: exit=0, Build success
pnpm test: exit=0
Test Files  87 passed (87)
Tests       1353 passed (1353)
```

The structural offline-boundary check passed in that full run. Comparing the
per-file reports attributes the increase from 1,352 to 1,353 to
`bare-npx-invocation-guard.test.ts` (166 to 167 tests), not to the lesson array.
