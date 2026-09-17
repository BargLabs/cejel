# Measurement freeze guard

**CONSTRAINTS-VERSION: 2026-08-01.5**

`FREEZE.md` is a JSON declaration. The guard refuses diffs touching non-test source
below `src/witan/`, including deletion and either side of a rename. Tests and
fixture directories are exempt. An empty frozen source inventory is unreadable,
never a successful sweep.

The first declaration remains the historical trust anchor. Later markers must
name their predecessor and carry an operator signature on the changing commit:

```json
"supersedes": {
  "markerSha256": "<SHA-256 of the exact preceding FREEZE.md bytes>",
  "pinnedRevision": "<preceding marker's full pinnedRevision>"
}
```

Both fields must match the marker currently in force. Every reachable marker
change is checked in history order, including changes later reverted. Competing
successors refuse as a fork. A merge preserving the signed successor's bytes is
accepted; a merge changing those bytes needs its own chain and signature. Deleting
or renaming the marker remains forbidden, even with a valid signature. An
unsigned edit diagnoses the signature and any missing/malformed chain separately.

The signature reader is shared with `check-calibration-signatures.mjs`, whose
guarded set includes the exact root `FREEZE.md` path. Only a verified SSH signature
from `docs/security/allowed-signers` is accepted. The transition reader takes that
file from the changing commit's first parent, so a commit cannot authorize itself
by adding its own key. Missing or key-less signers refuse. `E`, `N`, and every other
non-`G` status refuse; a GPG signature does not establish membership in the SSH
allowlist. GitHub's web-flow signature is not an operator signature. Preserve the
operator commit with a merge, never a squash or rebase.

PR checks compare scoring changes against the merge base. Full-tree sweeps compare
the complete tracked source against the effective marker's pin. A signed marker
transition moves that pin; it does not exempt scoring changes from PR review.
Shallow history, malformed markers, unreadable revisions, and conflicting base/head
chains refuse. No declaration anywhere in the inspected history means no freeze.
The original declaration predates this transition rule; it is not retroactively
claimed to have a verifiable signature.

`--marker` is a historical-audit aid only when the inspected history predates any
marker. It cannot override a declared chain. Workflows do not accept that override.
Closing conditions remain an authority statement, not an automatic timer. This
mechanism does not implement deletion or an empty-scope closure shortcut.

## Operator transition after this proposal is reviewed and landed

The proposal does not change the live marker, add a real signer, or sign a real
commit. The operator must use their already enrolled SSH signing key and the full
commit id of the signed amendment authorizing the new pin. The amendment id was
not supplied in the task; do not substitute the old authority or invent an id.
Run from a clean Cejel checkout after the mechanism lands:

```sh
git fetch origin main
git switch -c freeze/<window>-amendment-<n> origin/main
printf 'Full signed amendment commit id in the authority repository: '
read -r FREEZE_AUTHORITY_COMMIT
export FREEZE_AUTHORITY_COMMIT
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync('FREEZE.md');
const old = JSON.parse(bytes);
if (old.pinnedRevision !== '85eab44b61fa31be00191d8bd5c262e281e8d65c') {
  throw new Error('Live marker has moved; review the new authority before proceeding');
}
const signedCommit = process.env.FREEZE_AUTHORITY_COMMIT;
if (!/^[0-9a-f]{40}$/.test(signedCommit ?? '')) throw new Error('Full amendment commit id required');
writeFileSync('FREEZE.md', JSON.stringify({
  ...old,
  pinnedRevision: 'cfd9b16ffc94dfcb699ba433e16fa091d960906c',
  authority: { ...old.authority, signedCommit },
  supersedes: {
    markerSha256: createHash('sha256').update(bytes).digest('hex'),
    pinnedRevision: old.pinnedRevision,
  },
}, null, 2) + '\n');
JS
git diff -- FREEZE.md
git add -- FREEZE.md
git -c gpg.format=ssh commit -S -m 'docs: apply signed cycle-13 freeze amendment' -- FREEZE.md
node scripts/check-calibration-signatures.mjs origin/main...HEAD
node scripts/check-measurement-freeze.mjs --base origin/main --head HEAD
node scripts/check-measurement-freeze.mjs --full-tree --head HEAD
git push -u origin HEAD
gh pr create --title 'docs: apply signed cycle-13 freeze amendment' --body 'Apply the operator-signed amendment; preserve the signed commit with a merge, never squash or rebase.'
```

Inspect the amendment's record path before running: this command retains the
existing authority repository and record path. If the amendment lives in a
different record, update that pointer to the actual signed record before committing.
The guard verifies the local transition signature; it does not fetch or attest to
the contents of the external authority record.

## Commissioning and verification

On 2026-09-16 the live required checks were re-read as `cla`, `build-test`,
`calibration-signature`, and `measurement-freeze`. No protection changes are needed
or made. The scheduled sweep detects changes after a direct push; mutable workflow
and guard code still require independent review.

[The supersession verification record](measurement-freeze-supersession-evidence.md)
contains baseline RED, implementation GREEN, defence-removal mutations, and real
history outputs. Reproduce the latter with:

```sh
node scripts/verify-measurement-freeze-history.mjs cd75fc435d33bccc84293c8d1ce1a5a99685d6c0
```

That command creates and removes a temporary local clone and disposable signing
key. It changes the allowlist and marker only inside that fixture, never in the
source checkout. A fixture signature is test evidence, not operator authorization.
