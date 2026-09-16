# Cycle-12 measurement-validity note — control-side review circularity

> **Published transcription, redacted.** Operator-signed source record, held in the private
> measurement repository. **Redacted: the drawn case id of the identified instance, and the
> per-repository reasoning that established it.** The defect class, its direction, its
> magnitude, the rule it occurred under, and all five binding requirements are published in
> full. See [`REDACTIONS.md`](REDACTIONS.md).

Status: **IN FORCE — operator-signed.** Not in force until the operator signature block is complete.

An addendum to `cycle-12-estimation-result.md` (in force). It records a defect in how control
cases were presented for review, found after signing. **It changes no figure, no validity
verdict, and no promotion decision** — a corrected estimate would require a fresh measurement
under a signed protocol, and none is authorized. The honest act is to record the defect beside
the number, not to adjust the number silently.

> **Instrument and date — read this with the figure, every time.**
>
> Measured source commit: **`e434a40e`** (`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`) — the
> cejel revision the detector ran at. **Package version: not stated in the source result
> record;** recorded as absent rather than inferred. The measurement **predates cejel #276,
> #277 and the 0.4.8 abstention-scoring change.** A re-measurement on the current release is
> owed, and the figure this note attaches to — **33.99%, 95% CI [20.99%, 53.51%]** — must not
> be read as describing it.

## The defect

Control-side review asks: *should this rule have fired on this repository?* The reviewer
answered partly from evidence the detector itself produced — including the detector's own
bounded-inventory result (`artifactCount: 0`) as displayed in the packet. Where the detector's
scan has a blind spot, that blind spot propagates into the human answer, and the review is no
longer independent of the instrument it is auditing.

## The identified instance

One of the twelve control-side misses, under the rule `CORE-A1-NO-COVERAGE-CONFIG`.

> *Withheld under the disclosure boundary; digest published.* The source record names the drawn
> case id and describes the repository's own configuration in enough detail to identify it.
> Both are withheld here under the closed-class items *cohort member identities*, *per-repository
> findings*, and *reviewer notes and per-repository reasoning*. The digest committing to the
> withheld case id is the cohort selection commitment specified in [`README.md`](README.md)
> ("Membership: committed to, not yet revealed"); **that digest value is owed and not yet
> computed**, and the case id becomes checkable against it at retirement.

The mechanism, which is the part that generalises and is published: the repository measures
coverage, but through a **command flag on a test script reachable from its test entry point**
rather than through any conventional coverage configuration file. The detector's file-pattern
scan therefore reported zero artifacts, correctly by its own construction; the reviewer, shown
that zero alongside substantial test infrastructure, judged that the rule should have fired.
The detector was right not to fire. Verified independently, twice, from the pinned tree and the
frozen scan reports.

## Direction and magnitude

This instance is a **false miss**: counted as a control-side false negative when the detector's
silence was correct. Removing it would move recall marginally **upward** — the recorded 33.99%
is, in this respect, conservative. No other instance has been identified; the other two
`NO-COVERAGE-CONFIG` misses were checked against the pinned reports and are genuine detector
false negatives, and an earlier claim that they showed a candidate-assembly parity discrepancy
was refuted by those same reports.

**The recorded figure is not amended.** Adjusting a signed estimate by removing a single case
found after unblinding is exactly the analyst freedom this protocol family exists to forbid.
The number stands as measured, with this note attached.

## Binding on any future cycle

A cycle-13 or later protocol must not present control cases the way cycle 12 did. Minimum
requirements, to be written into that protocol rather than left as guidance:

1. Detector-derived quantities shown to a reviewer (inventory counts, `artifactCount`,
   pattern-set results) are **labelled as detector-derived**, never presented as independent
   evidence of a repository's properties.
2. Control packets carry **raw, matcher-independent excerpts** — scripts, dependency and lock
   metadata, CI commands, and candidate configuration files — sufficient to judge the question
   without relying on the detector's conclusion.
3. Command reachability is preserved where it decides the question (e.g. the chain
   `test → /^test:/ → test:coverage`), so a reviewer can see how a capability is actually
   invoked rather than only whether a conventional file exists.
4. Reviewers adjudicate the raw evidence **before** seeing any detector conclusion.
5. A control whose evidence is coverage-bearing but unresolved routes to targeted review or
   `insufficient_context` — the detector's own zero count is never treated as proof of its own
   correctness.

## Provenance

Found 2026-09-06 during v23 detection triage over the cycle-12 miss inventory; established from
the repository's own files at its pinned revision (read, not executed) and from the frozen scan
reports. Working notes are operator-private and contain cohort identities; they are not
committed to any repository.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-06T19:17:40Z
- Signature: Houman Azimi-Nejadi — control-review circularity recorded: one identified false miss *[case id withheld under the disclosure boundary]*, direction conservative, the signed 33.99% figure deliberately NOT amended; five packet-design requirements binding on any future cycle
