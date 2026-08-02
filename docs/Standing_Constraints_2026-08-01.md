# Standing constraints

**Written:** 2026-08-01, at the close of the 2026-07-31/08-01 engineering session.
**Purpose:** these were stated across a long conversation and exist nowhere else as a set.
A new session, or an agent given a narrow prompt, will not know them. Several are
safety-relevant. Read this before dispatching work in `alfred` or `cejel`.

Where a constraint was earned from a specific defect, the defect is named — a rule whose
origin is legible is harder to argue away later.

## Secrets and credentials

- **Never log a presented token, nor any prefix, suffix, or hash of it.** Presence and
  length only. Length is diagnostic (it separates "a plausible credential of our format"
  from "garbage") and discloses nothing. This is asserted by test in
  `cejel/src/__tests__/http-mcp-auth.test.ts` across all four refusal paths — keep it that
  way; a review promise will not survive six months.
- **Never log the raw `POST /api/product-health` request body.** `ProductHealthDetailsSchema`
  is screened for credential-shaped content precisely because reports can carry it.
- **`vercel env pull` does not return sensitive values** — it writes the keys with
  zero-length values. Never source `.vercel/.env.*.local` for a credential a step actually
  needs; inject from the secret store and assert non-empty (`: "${VAR:?}"`) before anything
  parses it. `test -s <file>` is not a credential check: the file is always non-empty.
  *(Earned: four consecutive production deploy failures, 2026-07-31 22:01–23:04, reported
  as `Invalid URL`.)*
- **A URL-parse failure inside a credentialed step is an absent credential until proven
  otherwise.** This signature appeared three times in one day wearing three disguises.
- **`MIGRATION_DATABASE_URL` stays on the owner/migrator role.** Only `DATABASE_URL` moves
  to `alfred_app_rls`. Do not "fix" a guard by pointing it at the migrator role: that role
  holds `BYPASSRLS`, so a non-bypass assertion against it either fails by construction or,
  if relaxed to pass, certifies the exact role it exists to exclude.
- **Delete pulled credential files after use** (`rm -f /tmp/alfred-prod.env`).
- **Configuration diffs are the likeliest place in any repo for an accidentally committed
  secret.** Any stratum that mines `.github/` or CI config history must scrub before the
  diff enters a corpus, artifact, or log.
- **Cloudflare edge IPs (`172.64.0.0/13` and the other published ranges) identify the path,
  not the origin.** Do not treat a "trusted platform IP" in that range as attribution, and
  never build a blocklist on a client-settable `x-forwarded-for`.

## Guards that must not be weakened to go green

- **The `PostgresStore` studio-context guard.** No escape hatch, no test-only bypass.
- **`ProductHealthReportInputSchema`.** Do not loosen it to stop 400s.
- **The public-tenant-isolation guard.** If it genuinely fails against `alfred_app_rls`,
  that is a finding to report, not a blocker to route around.
- General rule: when a guard blocks a deploy, the question is whether the guard is right,
  never whether it can be silenced.

## Experiment integrity

- **Guard 5: the preregistration commit must remain a strict ancestor of the first result
  commit.** `d879c2f69488f4fb3f3c6b45667125812c2c7364` for `dual-control-v1`. **Never edit a
  preregistration after a run.** Corrections go in a separate errata document; a superseded
  protocol gets a new preregistration citing the old one as a pilot.
- **`dual-control-result-2026-07-31.md` is DESCRIPTIVE ONLY and must not be quoted to a
  customer, counterparty, or commercial document** until the missing publication-guard
  halves are implemented in `report.ts` and the report re-derived. The preregistration
  requires refusal on five counts that the code does not check. See the errata.
- **Do not conflate the v50 free-core GO with recall.** The former is agreement between
  findings and blinded reviewers over bounded static evidence; it is not recall against
  defects present in a repository. An escrow buyer will find that seam in the second
  technical conversation.
- **Any citation of the 75.8% figure carries all three conditions** — false success as a
  share of *failures*, among trajectories with an *explicit completion claim*, among
  *self-assessing coding agents*. Anything less is the D7 the card names. Source:
  `_studio/FalseSuccess_Source_Definition_2606-09863_2026-07-30.md`.
- **Yield predictions get committed before the measurement runs.** Two estimates in this
  programme were wrong by an order of magnitude in opposite directions, both from
  extrapolating a discovery filter rather than the qualification bar.

## Evidence discipline

- **Never assert a cause you have not observed.** A 400 does not mean malformed input when
  `app.ts:1560` also converts storage exceptions into 400s. A green endpoint after an
  incident is evidence the deployment was replaced, not that the defect was fixed.
- **A deploy verifier must read the build identity off the running artifact**, not off the
  ref it was asked to verify. *(Earned: five green `Edgar Tier C Deploy Verify` runs against
  a production that had not moved in four hours. Fixed in #772.)*
- **Shell command history must be scrubbed at ingestion** before entering any corpus an
  agent later recalls from.
- **Session transcripts are not oracles.** An agent's own red→green account is the evidence
  class this programme argues against. Sessions are a discovery channel; qualification still
  requires a mechanical reverse-patch reproduction on frozen `main`.

## Product and commercial

- **Never generate the rewrite.** Alfred governs and verifies; somebody else's agent writes.
  Two independent reasons: it competes with free first-party tooling, and it makes us attest
  to our own output, which is single-control and contradicts the company sentence.
- **Sign the binding, not the verdict.** The scan runs offline on the customer's machine and
  we do not witness it. The defensible claim is that this report was produced by detector
  revision X under rubric vY whose calibration record is Z, and the digest matches.
- **`cerdic`: do not create package names yet.** `cerdic.com` is taken and no formal
  trademark clearance has been run.
- **react and django are calibration repositories.** They cannot be used as an external
  recall corpus — that would be training on test. Reconstructing the full calibration repo
  list is a prerequisite for any external-corpus work; it is not currently recoverable from
  `docs/calibration/`.

## Open at the close of this session

- 23 of the alfred lesson seeds carry `REPLACE_WITH_40_HEX_FIX_COMMIT`. They are held out of
  candidate storage by the `PENDING_` filename prefix — a real protection with no test
  asserting it. Some describe defects in documents or workflows that exist now and could
  anchor as `artifact` today (ADR-0012).
- ADR-0013's D1 rule scores 0/1 against its own documented positive
  (`bede/src/dual-control/report.ts:87`). Its implemented contract is narrower than its
  name. Amend the ADR or the rule; do not leave the name unqualified.
- The dual-control preregistration's primary hypothesis (`8/16` on an eight-seed held-out
  split) is unsatisfiable at every outcome. Recorded in the errata, not amendable.
