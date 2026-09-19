---
role: record
---

# Cycle-12 measurement-validity note 2 — evidence provenance, and abstention counted as miss

> **Published transcription, redacted.** Operator-signed source record, held in the private
> measurement repository. **Redacted: the drawn case ids of the six affected cases (one under
> defect 1, five under defect 2).** The defect classes, their counts, their mechanisms, their
> directions, and all binding requirements are published in full. See
> [`REDACTIONS.md`](REDACTIONS.md).

Status: **IN FORCE — operator-signed.** Not in force until the operator signature block is complete.

Second addendum to `cycle-12-estimation-result.md` (in force), and a companion to
`cycle-12-validity-note-control-review-circularity.md` (in force). Both defects below were found
2026-09-06 during v23 detection triage over the miss inventory. As with the first note,
**no figure, validity verdict, or promotion decision is amended** — a corrected estimate would
require a fresh measurement under a signed protocol, and none is authorized.

> **Instrument and date — read this with the figure, every time.**
>
> Measured source commit: **`e434a40e`** (`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`) — the
> cejel revision the detector ran at. **Package version: not stated in the source result
> record;** recorded as absent rather than inferred. The measurement **predates cejel #276,
> #277 and the 0.4.8 abstention-scoring change.** A re-measurement on the current release is
> owed, and the figure this note attaches to — **33.99%, 95% CI [20.99%, 53.51%]** — must not
> be read as describing it.

> *Case ids withheld under the disclosure boundary; digest published.* Wherever the source
> record names a drawn case id below, it is withheld under the closed-class item *cohort member
> identities*. The digest committing to those ids is the cohort selection commitment specified
> in [`README.md`](README.md) ("Membership: committed to, not yet revealed"); **that digest
> value is owed and not yet computed**, and the ids become checkable against it at retirement.
> Counts and rule names are published; only the ids are removed.

## Defect 1 — a packet carried evidence from the wrong path and revision

One reviewed case *[case id withheld]*, under the rule `CORE-A2-HISTORY-ENV`, was presented to
the reviewer with evidence excerpts drawn from a **different path and a different revision**
than the frozen finding the case was built from: the finding's own pointer was a tracked
`.env`, while the packet displayed fixture material from another scan. The human adjudicated a
claim against material that did not belong to it.

This is a **measurement-integrity defect**, distinct from the review circularity recorded in
note 1: there, the reviewer saw genuine evidence framed misleadingly; here, the reviewer saw
evidence belonging to something else. The existing independent byte-check verifies that packets
carry no cohort identity; nothing verified that each case's evidence derives from that case's
own finding, at its own revision.

**Requirement, binding on any future cycle:** the packet build must bind every displayed
evidence excerpt to the specific finding it belongs to — same repository, same revision, same
path as the finding's own pointer — and **fail loud on any mismatch**, in the manner of the
existing candidate-to-pinned-report byte-match guard. A provenance mismatch must stop the build,
never reach a reviewer.

## Defect 2 — abstention silently counted as a detection miss

Five reviewed cases *[case ids withheld]* reached the cohort as controls not because the
detector failed to detect, but because it **abstained**. `buildWitanInputFromRepo` wraps
scanning in a content-read tracker; when any file relevant to a criterion cannot be read, that
criterion is added to `affectedCriteria`, and every signal for it is then replaced wholesale —
`findings: []`, `positiveEvidence: []`, `metrics: []`, `insufficientData: true`. Findings
correctly computed from readable files are erased because an unrelated file was skipped.

Two separable issues follow.

**(a) Granularity.** Criterion-wide erasure from a single unreadable file is coarser than the
honesty it implements. Whether abstention should be per-signal rather than per-criterion is a
product decision for the detector, recorded here as identified, not decided.

**(b) Measurement semantics — the part that binds this protocol family.** An abstained
criterion is neither a clean candidate (no finding was emitted) nor a clean control (the
detector did not silently decline to detect; it declined to report on an incomplete scan).
Cycle 12 had no rule for this state, so such cases defaulted into the control pool and, when a
reviewer answered "the rule should have fired," were counted as false negatives.

**Requirement, binding on any future cycle:** the protocol must state, before any scan, how
abstained criteria are treated — as a third stratum reported separately, as controls, as
excluded with the exclusion counted and published, or otherwise. It must also make abstention
**visible in the packet**, so a reviewer is never asked to judge "should this have fired?"
about a case where the instrument declined to look. Silent defaulting is not available.

Both readings are defensible on the merits — from the user's position an unreported defect is a
miss; from the instrument's position a correct abstention is not a detection failure — and that
is precisely why the choice must be made in writing beforehand rather than settled by a
default nobody chose.

## Direction, and why the figure still is not amended

Defect 2 pushes the recorded recall **downward** relative to a definition that excludes
abstentions: five of twelve control misses were abstention-driven. Note 1's circularity
instance pushed it upward. Both directions are recorded; neither is applied.

**The symmetry is the point, and is recorded deliberately.** Across the two validity notes, the
identified defects push the figure in *opposite* directions — note 1's circularity instance
means one miss was not a miss (recall marginally understated), note 2's abstention finding
means five misses may not be detection failures (recall overstated under a definition that
excludes abstentions). Neither correction is applied, and no net is computed. A record that
applied only the flattering correction, or that quietly netted them, would be curating toward a
number; recording both and applying neither is what makes the figure's integrity checkable by
someone who does not trust us. Any future write-up of this measurement should carry this
paragraph or its substance. Adjusting a signed
estimate by reclassifying cases identified after unblinding is exactly the analyst freedom this
protocol family exists to forbid. **33.99% [20.99%, 53.51%] stands as measured**, with both
notes attached to it.

## Provenance

Established 2026-09-06 from the detector source on `origin/main` (`buildWitanInputFromRepo`,
`src/witan/content-reads.ts`), the frozen scan reports, and the repositories at their pinned
revisions, read and not executed. Working notes are operator-private and contain cohort
identities; they are not committed to any repository.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-07T11:29:44Z
- Signature: Houman Azimi-Nejadi — two further cycle-12 defects recorded: one packet carried evidence from the wrong path and revision (integrity), and five abstained criteria were silently counted as detection misses (semantics); both binding on any future cycle; the signed 33.99% figure deliberately NOT amended in either direction