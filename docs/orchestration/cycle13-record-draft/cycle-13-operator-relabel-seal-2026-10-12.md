> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — the operator's re-label set, sealed

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Records that the operator's
second-pass label set for the 40 re-label cases (amendment 4 §2) is sealed, before any agreement
statistic or estimate is computed. Spec `sealedKey.hashingAndSealing` step 4; amendment 4 §2.
First-pass seal: `docs/calibration/cycle-13-operator-label-seal-2026-10-05.md`.

| Item | Value |
|---|---|
| Rater | operator, re-label |
| Cases | 40 (`labels/relabel-case-list.json`, amendment 4's fresh order) |
| Sealed label file sha256 | `d554abc8012ebf49e6d6dfe70050c26ef6877f7d9ce94356aa709a50a8661309` |
| Case list sha256 | `da939f1895845f6f3166a5cc1ae0151dedbae90c727c7b521a55a048fd8a8e65` |
| Seal file (`labels/operator-relabel.sealed.json`) sha256 | `842b6677d3dfe9c41422b9157cfc2dd5d851d2582be7f302302ae37275597391` |
| Sealed at | `2026-10-12T20:42:42.273Z` |
| First-pass seal file, unchanged | `a88f5afe873759b7f4d5065b4f7ad68f1ca204269cef7c54c2f306fc5c00756a` |

The label files, the seal and the per-label counts stay in custody. No label, count of labels,
agreement figure or estimate appears here.

## When the pass ran

The washout ended at `2026-10-12T16:55:17Z`. Erratum 2 was signed at `2026-10-12T18:58:37Z`
(`f769863a3`) before the pass began. The operator recalls opening the first case at about
20:00 BST (19:00Z); the completed set was exported at `2026-10-12T20:05:36Z` (file time).

## Disclosures

- **Rater name on the first export.** The viewer's rater menu was left at its default, so the
  completed second-pass set was exported naming the first-pass rater (`operator`). The operator
  ruled (2026-10-12, before any comparison) to seal this set. Its `rater` field was set to
  `operator-relabel` with `jq`; the sealed file was checked to equal the export in every other
  field. The original export is kept in custody as `labels/operator-relabel-first-export-2105-original.json`
  (sha256 `c545a9ff67cd4f2be0330d40b02e26b37d133e14c3ede70eaa2640187a852627`).
- **A second labelling of the same 40, not used.** After that export the operator switched the
  menu and labelled all 40 cases again, exported at `2026-10-12T20:18:56Z`, about 13 minutes later. That set
  measures recall of a pass just made, not consistency after a washout. Under the operator's
  ruling, fixed by order before either set was compared or counted, the first complete pass is the
  second pass amendment 4 defines. The later set is kept in custody unsealed as
  `labels/operator-relabel-redo-2118-unsealed.json` (sha256 `e86817dec3d12a90d472e00c473dd2ff49587a8a76c99af928ae2f68ffca2f93`), is never compared with any set,
  and enters no figure.
- A third export file from the same session (exported 2026-10-12T20:32:04Z, sha256 `e86817dec3d12a90d472e00c473dd2ff49587a8a76c99af928ae2f68ffca2f93`, byte-identical to the 21:18 redo export) is kept in custody unsealed as `labels/operator-relabel-export-duplicate-unsealed.json`. It is not used.
- **Order.** The operator loaded `labels/relabel-order.json` as the viewer's order file for both
  labellings, so cases were shown in amendment 4's fresh order. The seal does not record which
  order file was used; this rests on the operator's statement.
- Exposures between the first-pass seal and this pass are recorded in
  `docs/calibration/cycle-13-washout-exposures-and-known-limitations-2026-10-12.md` and its
  errata 1 and 2.

## What is compared

Amendment 4 §2's within-rater agreement compares the first-pass labels on these 40 cases (sealed
set `71edbf19…`) with the set sealed here (`d554abc8…`), published as
within-rater agreement under amendment 4 §4. The estimate uses the first-pass labels only.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-12T20:50:15Z`
- Signature: Houman Azimi-Nejadi — re-label set sealed; the first complete re-label is the second pass
