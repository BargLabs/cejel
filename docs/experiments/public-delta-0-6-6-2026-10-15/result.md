# Result — the 0.6.6 security fixes leave public scoring unchanged

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Preregistration:** `31909f02bcc6a4d349b1c7660d42d3a67c42d779`, a strict ancestor of this
  result. `plan.json` and `PREREGISTRATION.md` are unchanged since that commit.
- **Runs:** on the operator's host, once each, per the 0.6.5 run sheet applied to this plan.
- **Records:** `paired-result.json` and `byte-identity.json` as written by the harness, unedited.
  Raw reports stay local.

## Summary

All three expected values held. Under both v17 and v26, every one of the 23 public reports is
byte-identical between v0.6.5 (`a8e582a0`) and the fix commit (`82cba330`).

| | Expected | Measured | |
|---|---|---|---|
| E0 | 23/23 complete per run, zero errors; targets unchanged; source at the run commit; existing output refused | 23/23 and 0 errors in all four runs; `targetIdentityIdenticalAcrossRuns: true`; each manifest's `sourceHead` equals its run commit; the overwrite was refused in all four runs | held |
| E1 | both pairs: 23 byte-identical reports, no scoring move, no fingerprint change, no unexpected criterion or undeclared field change | both pairs: `identicalReports` 23, `scoringRowsMoved` 0, `fingerprintsChanged` 0, `placementsMoved` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` empty | held |
| E2 | any difference only in A1, on a row with a `pnpm run /` selector | no row differs | held |

## Notes

- **Overwrite check.** As in the 0.6.5 run, the refusal check printed two matching lines per run:
  Node's echo of the throwing source line, which contains the message, and the `Error:` line. One
  refusal each.
- **What the identity covers.** #502 changes how a `pnpm run /…/` selector and a declared workspace
  glob are handled; #500 changes the HTTP server and the terminal certificate, neither of which this
  harness uses. Byte identity on these 23 repositories means none of them reaches the changed
  behaviour in a way that alters `report.json`. It does not test the fixes themselves; their tests
  are in #500 and #502.

## What this does not show

No precision or recall claim, on this corpus or any other. v26 remains prospective and
explicit-only; the public default stays v17.
