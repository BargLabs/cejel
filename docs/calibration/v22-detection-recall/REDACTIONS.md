# Redaction ledger — what was withheld from this directory, and under which closed-class item

Every file in [`.`](README.md) was read end to end against the disclosure boundary
(`CLAUDE.md` / `AGENTS.md`, IP boundary of 2026-08-18) before publication. This file records the
result for each one. **A file with nothing withheld says so explicitly** — a silent omission
would be a false record, and so would a silent absence of omissions.

## The closed classes, as applied here

- **C1 — adjudication labels.** The 119 blinded operator adjudication labels, individually or as
  any table that lets a reader recover a label for a named repository.
- **C2 — reviewer notes and per-repository reasoning.**
- **C3 — per-repository findings, packet excerpts, evidence excerpts.**
- **C4 — cohort member identities.** Withheld because the retirement statement is empty: the
  cycle-12 cohort is spent, but spent frame membership is revealed at retirement by a separate
  signed act, and that act has not occurred. The drawn case ids fall here: they are the frame's
  membership handle.
- **C5 — counterparty specifics.**
- **C6 — operator-machine private paths.** Not one of the boundary's four named classes, but a
  standing repository rule: no workstation home path appears in any tracked file, enforced by
  `src/__tests__/experiment-doc-path-redaction-guard.test.ts`.

## Per file

### [`README.md`](README.md)

**Nothing withheld.** Written for this publication, not transcribed. Carries the figure, the
instrument sentence, the commitment to membership, and the index.

### [`cycle-12-estimation-protocol.md`](cycle-12-estimation-protocol.md)

**Nothing withheld.** Transcribed complete. The source record is methodology throughout: the
population is stated at rule level only (the source itself notes that the identity-level list is
held operator-side, "rule-level is what belongs in this record"), and no label, packet, or
repository identity appears in it.

One transcription note is inserted by this publication and marked as such: the source's status
line reads `DRAFT` while its signature block is complete. Reproduced unchanged.

### [`cycle-12-draw-addendum.md`](cycle-12-draw-addendum.md)

**Withheld: the list of 119 drawn case ids** (the "Drawn ids" code block of the source record),
under **C4**.

Published in their place: the count (119 — 40 candidates, 79 controls, all distinct), the full
per-rule allocation table, the seed, the selection method, and the pin. Seed plus method plus
allocation plus the sealed key determine the drawn set exactly, so the withheld list is
recomputable at retirement rather than taken on trust.

**Digest status: owed.** The commitment specification — the exact canonical object, ordering
rule, and hash contract — is published in [`README.md`](README.md) under "Membership: committed
to, not yet revealed". **The digest value itself is not yet computed and is not published.**
This is stated rather than papered over: the specification fixes the value in advance so it
cannot be chosen later, but until the value is published there is no commitment a reader can
check, only one they can see the shape of.

### [`cycle-12-estimation-result.md`](cycle-12-estimation-result.md)

**Withheld: the operator-machine filesystem directory of the result artifact**, under **C6**.
The artifact's filename (`estimation-result-2026-09-05.json`) is published; only its location on
the operator's workstation is removed. The artifact itself is held operator-side and is not
published.

Everything the goal names as open is published in full: the figure, the interval, the
false-positive rate and its interval, the design-weighted totals, the validity verdict, the
aggregate control insufficient-context share against its ceiling, the per-rule miss counts as
counts, the bootstrap design, the scope statement, and the three recorded defects of the run
itself (including the voided scoring run and the printer defect).

One editorial insertion is marked inline: the source's "Per-rule observations" section states
"the cohort figure is 34.0%" without its interval. The interval is inserted in brackets, marked
as a publisher's insertion with the source wording quoted, so the point never appears alone.

### [`cycle-12-promotion-policy.md`](cycle-12-promotion-policy.md)

**Nothing withheld.** Transcribed complete. The criteria, their rationales, the P3 branch
structure and the per-outcome consequences are all methodology. v17's published figures quoted
in P3 are already public on this repository's own CHANGELOG.

### [`cycle-12-promotion-decision.md`](cycle-12-promotion-decision.md)

**Nothing withheld.** Transcribed complete, including the criterion-by-criterion reading, the
NO-GO, the no-retry clause, and the "what this decision does not say" section.

### [`cycle-12-validity-note-control-review-circularity.md`](cycle-12-validity-note-control-review-circularity.md)

**Withheld: the drawn case id of the identified instance** (under **C4**), **and the
per-repository description that established it** (under **C2** and **C3**) — the source
identifies the repository's specific script names, coverage threshold and CI wiring in enough
detail to name it.

Published in their place: the defect class in full, the rule it occurred under
(`CORE-A1-NO-COVERAGE-CONFIG`), the count (one, of the twelve control-side misses), the
generalised mechanism (coverage measured through a command flag on a reachable test script
rather than a conventional configuration file), the direction and magnitude (a false miss;
removing it would move recall marginally upward, so the recorded figure is conservative in this
respect), the refutation of the earlier parity claim, the non-amendment, and all five
requirements binding on any future cycle.

The source's signature line names the case id; the id is replaced there by a marked withholding
rather than the line being dropped.

**Digest status: owed**, as above — the withheld id is committed to by the cohort selection
commitment, whose value is not yet computed.

### [`cycle-12-validity-note-2-evidence-provenance-and-abstention.md`](cycle-12-validity-note-2-evidence-provenance-and-abstention.md)

**Withheld: the drawn case ids of the six affected cases** — one under defect 1, five under
defect 2 — under **C4**.

Published in their place: both defect classes in full, their counts, their rules
(`CORE-A2-HISTORY-ENV` for defect 1), the mechanism of each (a packet displaying fixture
material from another scan against a finding whose pointer was a tracked `.env`; and the
criterion-wide erasure in `buildWitanInputFromRepo` / `src/witan/content-reads.ts` — cejel's own
public source), both binding requirements, the granularity-versus-semantics split, the direction
of each defect, and the symmetry paragraph in full.

Nothing about the repositories behind those ids is published, and nothing about the reviewer's
labels for them. "Five of twelve control misses were abstention-driven" is a count, not a set of
labels: it is already implied by the aggregate miss counts published in the result record.

**Digest status: owed**, as above.

### [`untouched-estimator-spec-v3.json`](untouched-estimator-spec-v3.json)

**Nothing withheld.** Copied byte-for-byte from the source record. It is a specification: no
cohort data, no labels, no identities.

### [`cycle-12-estimator-falsifiability-fixture.json`](cycle-12-estimator-falsifiability-fixture.json)

**Nothing withheld.** Copied byte-for-byte. Synthetic by construction — its `ruleId` is
deliberately unreal (`FIXTURE-SANITY-CHECK-DO-NOT-TREAT-AS-REAL-RULE`) so it cannot be mistaken
for production data.

### [`REDACTIONS.md`](REDACTIONS.md)

**Nothing withheld.** This file. It names what was removed and why, at a granularity that does
not itself reconstruct what was removed.

## What a reader cannot do with this directory

Recompute the figure. The 119 adjudication labels are the ground truth for every number here,
are not published, are not derivable from anything in this directory, and remain closed
indefinitely as a separate category under the disclosure boundary. Any future release of labels
is a distinct operator decision with its own redaction review; it is not implied or scheduled by
this publication.

Identify a cohort member. Membership is committed to here, not revealed. Retirement is a
separate signed act.
