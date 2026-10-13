> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — the operator's first-pass label set, sealed

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Records, before any re-label case
list is opened, that the operator's first-pass label set for the 177 accepted packets
(private record) is sealed. Spec `sealedKey.hashingAndSealing` step 4;
amendment 4 §2.

| Item | Value |
|---|---|
| Rater | operator, first pass |
| Cases | 177 (operator case list, presentation order) |
| Sealed label file sha256 | `71edbf19f4790b90bbe394496d1e934def1d95be9a827ea30a02528c159351e8` |
| Case list sha256 | `8c44d5a79906e4ec3069cdf8c24b00128cd685a3367519093ae5ba2a52584d2e` |
| Seal file (`labels/operator.sealed.json`) sha256 | `a88f5afe873759b7f4d5065b4f7ad68f1ca204269cef7c54c2f306fc5c00756a` |
| Sealed at | `2026-10-05T16:55:17.272Z` |
| Earliest re-label start (7-day washout, amendment 4) | `2026-10-12T16:55:17Z` |

The label file, the seal and the per-label counts stay in custody. No label, count of labels or
estimate appears here.

## Disclosures

- On 2026-10-05, after the set was complete and before it was sealed, the operator attached the
  exported label file to a Cowork review session. The reviewing session did not open, read or
  process it. The sealed file is the operator's local copy.
- On 2026-10-04, during the first pass, the operator read a session summary of how the cycle-13
  instrument matches CI test, lint and type-check commands (cejel #409).
- The R7 exposure on the 8 `CORE-A2-HISTORY-ENV` packets, recorded at acceptance, stands.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-05T16:57:32Z`
- Signature: Houman Azimi-Nejadi — first-pass labels sealed before the re-label list is opened
