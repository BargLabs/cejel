# Confirmation run, 2026-09-25: v0.4.10 → main (5ae73b2), v17

This directory is a confirmation of the preregistered record in
`../v17-behaviour-delta-post-0.4.10-2026-09-23/`, which is the record. It was run by the operator
on one macOS host on 2026-09-25 without knowledge of that record, using the 0.4.9 harness unchanged
(`../v17-behaviour-delta-0.4.9-2026-09-15/harness/`), and it is not preregistered.

Arms: baseline `d2a80188` (`v0.4.10`), candidate `5ae73b27` (`origin/main` at the time of the run).
Both arms report package version 0.4.10; no scorer source changed between v0.4.9 and v0.4.10.

Exactly what was run, from the cejel shared checkout, with `~/tmp/cejel-049-delta` wiped first
because `compare.mjs` and `prepare-checkouts.sh` hard-code that root:

```
git fetch origin --prune
git worktree add --detach .worktrees/rescore-base-v0.4.10 v0.4.10
git worktree add --detach .worktrees/rescore-cand-0411 origin/main
( cd .worktrees/rescore-base-v0.4.10 && pnpm install --frozen-lockfile )
( cd .worktrees/rescore-cand-0411 && pnpm install --frozen-lockfile )
rm -rf ~/tmp/cejel-049-delta && mkdir -p ~/tmp/cejel-049-delta
cp leaderboard/corpus.json ~/tmp/cejel-049-delta/corpus.json
H=$PWD/docs/experiments/v17-behaviour-delta-0.4.9-2026-09-15/harness
sed 's#^CORPUS=.*#CORPUS=~/tmp/cejel-049-delta/corpus.json#' "$H/prepare-checkouts.sh" | bash
( cd .worktrees/rescore-base-v0.4.10 && ARM=base pnpm exec tsx "$H/score-arm.ts" )
( cd .worktrees/rescore-cand-0411 && ARM=cand pnpm exec tsx "$H/score-arm.ts" )
node "$H/compare.mjs"
```

The `sed` only points the checkout script at the copied corpus; the committed script names a
worktree path from the 0.4.9 run that no longer exists. Nothing else in the harness was changed.

Observed: `CHECKOUTS_DONE 24`; `ARM_DONE base ok=24/24`; `ARM_DONE cand ok=24/24`;
`{"rows":24,"errors":0,"reportIdentical":0,"anyCriterionMoved":0,"anyMetricMoved":0,"headlineMoved":0}`;
board check 24/24 rows reproduce. `paired-result.json` here is `delta.json` as written by
`compare.mjs`, renamed; `delta.md` is its table. Per-row reports were kept locally and not
committed; the private row's report is not public.

The 0.4.9 record's shallow-clone note applies here too: both arms score the same depth-1 checkouts,
so history-dependent signals see one commit of history in both arms.
