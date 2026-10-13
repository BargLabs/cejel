> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimate pre-run record

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amendment 5 §3 requires the
implementation seal's sha256 to be recorded out of band before the one scoring run; this is that
record. The runner ((private record)) refuses to run unless exactly one record of this name is on
`origin/main`, added by a commit with a good signature, and its two values below match.

Run commit: `5e72e91be0358884781a03d00a12d0fe1427e3f6`

Implementation hashes.json sha256: `1e732751f1c69fc6b86e08e1e82847e0fcb34003aad7a8628476737bd84526a8`

| Item | Value |
|---|---|
| Run commit | merge of (private record) (runner head `472ddca6c`) |
| Files bound by the implementation seal | 427 (amendment 5 §3 scope, at the run commit) |
| Runner sha256 at the run commit | `f6dcdbff09b9a9c4fc98661bc35f9218cd1f8c701ad6c05fb2b51e02c5ab72b3` |
| Implementation hashes.json location | custody, `estimate-implementation/hashes.json` under the packets custody root |

## How the values were established

- The operator ran `implementation-seal` on the custody host, in a detached worktree at the run
  commit, on 2026-10-13. It printed the sha256 above, the run commit as HEAD, and 427 files.
- The reviewing session recomputed the same sha256 independently from the run commit's tree (the
  same file scope, read with `git ls-tree` and `git cat-file`), without reading custody.
- The runner at the run commit is byte-identical to the one reviewed in (private record). That review found
  the code correct as read and three guards without tests; they are filed as a `later:` issue and
  do not change what this commit runs.

## What happens next

The operator runs `run` once, in the foreground, from that worktree. It prints aggregates only:
per-arm figures with intervals, the paired differences, validity, and within-rater agreement. Arm
totals, rule-level detail, labels and ids stay in custody, under `estimate/`, until the operator
rules on publication.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-13T03:43:28Z`
- Signature: Houman Azimi-Nejadi — cycle-13 estimate pre-run record: run commit and implementation seal fixed before the one run
