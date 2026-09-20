---
model: opus
tier: red
repo: BargLabs/cejel
---
# Card 9 — rebuild the two open cycle-12 specimens

**Propose-only: push, report, STOP.** This card touches measurement inputs. Nothing here merges
without the operator.

CONSTRAINTS-VERSION expected: **2026-08-01.5** — read from `origin/main`, echo the full line.

Report the commit or tree id **and the execution mode** with every result. **State the expected
non-zero before measuring.**

---

## The boundary, first — this is the whole point of the card

The properties each specimen must exhibit derive from **blinded descriptions of real cycle-12
misses**. Those descriptions are CLOSED. They are not in this repository, they do not go into this
repository, and they do not go into this card.

`docs/fixtures/specimen-derivations/cycle-12-miss-specimens.json` carries
`closedDescriptionStatus: "pending-operator-input"` and `closedDescriptionProperties: []` for every
entry. **Those are not blanks to fill.** `src/__tests__/specimen-derivation-records.test.ts`
refuses the record if the status is anything else, and refuses any non-empty properties array with
*"closed description properties must remain absent from this public record"*. The emptiness is the
control working.

**The required properties reach you from the operator at dispatch time, out of band.** You build a
specimen that exhibits them and you record only: the specimen, a mechanical assertion that it
exhibits what was asked, and the measurement. You never write down what was asked or where it came
from.

If this card appears to require reading a description, or writing one down, **stop and hand back**.

## Why these two

Recorded in `docs/experiments/cycle12-specimen-fidelity-erratum-2026-09-20.md` (alfred). Of the
8.83 live weighted-FN cost on the cycle-12 board, 6.53 rests on these two specimens' evidence
defects. Neither is currently auditable.

| specimen | status | what is missing |
|---|---|---|
| `coverage-node` | `unversioned-evidence` | A committed canonical specimen revision. The generated fixture observed in a shared worktree is not an auditable input. |
| `template-pem` | `evidence-pending` | A reproducible run through the complete PEM plausibility gate, pinned to the exact specimen bytes. The earlier report is not sufficient evidence. |

`a2-history-env` is **not in scope**. Its non-reproduction is established and its measurement is
recorded; leave it alone.

## Expected answer — `coverage-node`

A committed specimen at a known path, plus a mechanical assertion in the guard that the specimen
exhibits the operator-supplied property. The existing pattern is already in the repo:
`assertSyntheticFixture` checks that the fixture directory contains **exactly** its asserted
artifact and that the artifact exhibits the asserted value. Follow it.

The defect being repaired is that the prior specimen existed only as a generated artifact in a
worktree. **A specimen that cannot be re-measured by a second party is not evidence**, so the exit
condition is that someone other than its author can re-measure it from a pinned revision.

## Expected answer — `template-pem`

A specimen whose payload survives the **complete** plausibility gate, not a prefix of it, plus a
reproducible run pinned to the exact specimen bytes. The prior specimen failed a filter a real key
would pass, which means the case it was built to exercise was never exercised.

**Do not weaken the plausibility gate to admit the specimen.** That inverts the repair into the
defect. If no constructible payload passes, **that is the finding** — report it and stop.

## Guards — both mutations, for each specimen

Per the standing rule: where a guard asserts presence **and** a property, the property needs its
own mutation that leaves presence intact.

- **presence** — remove the specimen ⇒ red
- **property** — leave the specimen in place, break only the asserted property ⇒ red, **failing for
  the property's own reason**, not for a length or existence assertion firing first
- the record still refuses a non-empty `closedDescriptionProperties` ⇒ demonstrate this still holds
- **enumeration:** report `N specimens examined`. **Zero examined is a failure, not a pass.**

## The status-pin problem — read before editing the guard

`specimen-derivation-records.test.ts` pins today's statuses by literal value:

```
expect(…'coverage-node')?.status).toBe('unversioned-evidence');
expect(…'template-pem')?.status).toBe('evidence-pending');
```

Repairing either specimen makes that test red. **This is expected and it is not permission to
loosen the assertion.** As currently written a green guard asserts *nothing has improved* — which
is a tripwire, not a health check.

**Do not decide this yourself.** Report the collision, propose the smallest change that keeps the
assertion exact (a status transition the test knows about, not a wildcard), and hand the decision
back. A guard relaxed to accommodate progress stops detecting regression.

### Amendment 1 (2026-09-20) — the agreed `evidence-established` shape

A dispatch on 2026-09-20 stopped at the boundary, correctly, and proposed adding an exact
`evidence-established` status requiring a pinned measurement. That proposal is adopted **with the
two corrections below**, which are not cosmetic. Implement this shape; do not redesign it.

**Correction A — the validation predicate must become set-membership.** Today it is binary on one
literal:

```
if (status === 'established-nonreproduction' && !measurement) throw
if (status !== 'established-nonreproduction' && !missingEvidence) throw
```

A new `evidence-established` falls into the second branch and would be **required to name missing
evidence** — a status meaning "evidence exists" forced to declare what is absent. Change to:

- statuses in `{established-nonreproduction, evidence-established}` ⇒ `measurement` REQUIRED, and
  `missingEvidence` MUST BE ABSENT (not merely unrequired — otherwise a repaired entry keeps its
  stale missing-evidence text and the record reads as both established and pending)
- all other statuses ⇒ `missingEvidence` REQUIRED

**Correction B — "pinned measurement" must be a pin, not prose.** `measurement` is free text today
(*"All 20 synthetic cells were detected…"*). Gating a status on a sentence is the defect class this
card exists to repair. `evidence-established` additionally REQUIRES a structured, mechanically
checkable pin:

```
"evidencePin": {
  "revision":       "<full 40-hex commit sha in this repository>",
  "specimenPath":   "<repo-relative path>",
  "specimenDigest": "sha256:<hex of the blob at revision:specimenPath>"
}
```

The guard MUST verify, for every `evidence-established` entry:

1. `evidencePin` is present and all three fields are populated
2. `revision` is a full 40-hex sha that resolves in this repository
3. `specimenPath` exists **at that revision**
4. `sha256` of the blob at `revision:specimenPath` equals `specimenDigest`
5. `measurement` present, `missingEvidence` absent

**The digest is computed from the blob at the pinned revision, never from the working tree.** A
digest taken from the working tree proves only that a file is currently on disk, which is exactly
the `unversioned-evidence` defect being repaired — and a tree read under a different execution mode
can disagree with the committed bytes.

**Mutations required for this amendment**, each failing for its own reason:

- `evidence-established` with `evidencePin` removed ⇒ red on the pin's absence
- one hex character of `specimenDigest` altered ⇒ red on **digest mismatch**, not on absence
- `specimenPath` repointed at a different committed file ⇒ red on mismatch
- `missingEvidence` retained alongside `evidence-established` ⇒ red
- a valid entry ⇒ passes, so the check is not merely refusing everything

**Unchanged and not up for negotiation:** `closedDescriptionStatus` stays `pending-operator-input`,
`closedDescriptionProperties` stays empty and still refuses non-empty, and the per-specimen literal
status assertions are updated **only** once that specimen's evidence qualifies under the rules
above — never pre-emptively, never to a wildcard.

### Amendment 2 (2026-09-20) — the sanitised-property protocol

**Operator decision: the operator supplies a SANITISED property statement inline at dispatch; the
agent builds the specimen, the parameterised exhibition check, and the evidence pin.** The blinded
descriptions themselves never leave operator custody.

**The consequence that sets the sanitisation bar.** The guard's existing pattern stores the
expected value as a committed literal — `assertSyntheticFixture` hardcodes
`'node --test --coverage'`. So a sanitised property does not merely pass through a transcript: **it
becomes a permanent literal in a tracked test file.** Sanitise for the repository, not for the
session.

**Distribution check, answered 2026-09-20.** `@cejel/cejel`'s `package.json` declares a `files`
allowlist — `dist`, `README.md`, `LICENSE`, `docs/security/issuer-signers`,
`docs/security/issuer-revocations` — and there is no `.npmignore`. An allowlist excludes everything
unlisted, so **`src/__tests__/` is not carried in the npm package or the standalone binaries.** The
sanitised property is therefore a committed literal in a repository file, not a published string.

**Residual, for the operator:** whether the repository itself is visible to anyone outside the
estate. That is not determinable from the package manifest and it governs the standard. If the
repository is or may become public, judge the property against the IP boundary's public-surface
rules; if not, against internal custody. Either way it is permanent and it is committed.

**What "sanitised" means operationally.** The statement names a structural property of a file or
repository shape and contains none of: an organisation or repository name; a URL; a commit sha
originating in a cohort repository; a distinctive file path; a verbatim string copied from the
source; or a count, version, or combination specific enough to select one repository from a
population. A property that would let a reader narrow the source is not sanitised, however
abstractly it is phrased.

**The agent is the second check, not a passive recipient.** If a supplied property appears to carry
source-identifying content, **stop and hand back** — do not build with it, do not reword it into
something that looks safer, and do not record it anywhere. A property the agent had to soften was
not sanitised when it arrived, and softening it is the agent making a disclosure judgement it is
not positioned to make.

**The agent never**: asks for the description, asks "what was this actually", speculates about the
source in commits, PR bodies, comments or handbacks, or writes the property anywhere except as the
guard's expected value.

`closedDescriptionProperties` stays empty and `closedDescriptionStatus` stays
`pending-operator-input` regardless. The sanitised property lives in the guard's assertion, never in
the derivation record.

### Amendment 3 (2026-09-20) — close the unproven property in `613c5e9`

The evidence-pin guard at `613c5e9` on `codex/card9-evidence-pin-guard` implements Amendment 1 in
full: all five checks, sixteen mutations each asserting its own reason, status literals and
closed-description controls untouched. Three items remain before it lands.

**REQUIRED 1 — prove the pin reads the COMMITTED blob, not the working tree.**

This is the property Amendment 1 exists for and no current mutation asserts it. Replace
`git cat-file blob ${revision}:${path}` with `readFileSync(path)` and **all sixteen mutations still
pass**, because on a clean tree the two sources agree. The distinction is unasserted.

Add the test whose expected result is **green** — which is why it is easy to omit:

- write content to the working-tree path of the pinned specimen that differs from its committed blob
- run the validator ⇒ it must **PASS**, because it reads the commit
- restore the original bytes in `finally`, and assert after restoration that the file matches the
  committed blob, so a failed restore fails loudly rather than leaving a dirty tree

**Then demonstrate that this new test is live**, by temporarily swapping the implementation to
`readFileSync` and reporting both counts: the new divergence test must go **red**, and the sixteen
existing mutations must stay **green**. Expected: 1 red, 16 green. Revert the swap; it is a
demonstration, not a commit. **A count other than 1/16 means the tests are coupled to something
other than the property — say so rather than adjusting the expectation.**

If modifying a tracked file is judged unacceptable, report that as the finding and propose an
alternative. Do **not** substitute an assertion on the implementation's source text: pinning
declarations rather than reachable behaviour is the defect class this card already records.

**REQUIRED 2 — stop collapsing a tool failure into a specific finding.**

Both `try { … } catch { throw new Error('…') }` blocks in `assertEvidencePin` replace *any* git
failure with a specific negative claim. A corrupt repository or a missing git directory currently
reports *"evidencePin revision must resolve to a commit"* — the tool declining to answer, recorded
as a definite finding about the data. Distinguish the two: an object that does not exist is a
finding; git failing for another reason is an **unresolved measurement** and must say so, carrying
the underlying stderr.

**REQUIRED 3 — record the second hardcoded revision.**

`9ce92fc16afefe2c69116e9b25b03d01847196f4` now joins `ab2026d88ad33857aefc31044cc72d782d523231` as
a commit that must remain reachable for this suite to pass. Add a comment at each stating that
requirement and that CI must fetch full history. This is not a defect — it matches the established
pattern — but two such pins unremarked become an unexamined dependency.

**Unchanged:** no specimen status is promoted, no measurement is claimed, the sanitised properties
are still outstanding, and `closedDescriptionProperties` stays empty.

## Out of scope

The board's figures. Any re-estimation. `a2-history-env`. The registered-inventory denominator
(already derived from an immutable ancestor, `ab2026d8…`, and correctly so). Anything under
`docs/calibration/**` or `docs/experiments/**`.

## Anti-vacuity

A specimen that exists is not a specimen that exhibits. State, for each: which asserted property it
instantiates, how that is checked mechanically, and what the check reports when the property is
absent. **"The test passes" is not evidence that the property was ever required to hold.**

## The generalisable rule

**A synthetic built from a description drifts from what it describes, and nothing checks the gap
unless something is built to check it.** The derivation record exists so that the gap between "what
the specimen is" and "what it was supposed to represent" is written down and mechanically tested
wherever it can be — while the description itself stays where it belongs, which is out of this
repository.