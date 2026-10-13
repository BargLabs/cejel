# Run the three immutable public arms

Commit and push PREREGISTRATION.md, plan.json and this harness before scoring. Preserve that
commit as a strict ancestor of the result; do not squash the branch. Keep scratch storage local.

1. Create three detached, clean source checkouts at the exact commits in plan.json. Reuse the
   installed dependencies; this does not change tracked source. Do not point an arm at main.
2. Copy only the public entries' verified full-history trees from the existing 0.6.3 board
   scratch work directory into a new scratch/checkouts directory (APFS clone copies are fine).
   Every target must match its manifest commit, be non-shallow and clean. Do not copy private rows.
3. Read and save the preregistration commit from Git. Run node --test harness.node-test.mjs.
4. From the protocol checkout, invoke score-arm.mts through the installed tsx loader with five
   arguments: plan path, source checkout path, arm name, scratch root, preregistration commit.
   Run before459, after459 and fixes once each. Existing output directories are refused.
5. Invoke compare.mjs with plan path, unchanged leaderboard/corpus.json and scratch root.
   Copy paired-result.json unchanged beside the preregistration. Its records carry only public
   scalar scores, statuses, counts and field names. Raw reports remain local.
6. Write result.md against the unchanged expected values, retaining every failed forecast,
   unexpected movement and error. Update CHANGELOG and RUBRIC_CHANGELOG with the measured rows.
   Verify preregistration ancestry and all guards before committing the results.

These are within-run modeled placements, using the existing 0.6.3 comparison functions. This
script does not publish a leaderboard, calibrate v25, change target pins or fix a failed row.
