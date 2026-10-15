# Operator run sheet — step 2 was not run in the preregistering session

**CONSTRAINTS-VERSION: 2026-08-01.5**

The preregistration is commit `9b37aa48e922cfbaebf037d964e0fd3458037bb8`. It was pushed before
any run.

The session that wrote it stopped after step 1, as the dispatch card directs when a run cannot
proceed. That session's permissions covered only its own worktree:

- It could not create a scratch root outside the repository. `score-arm.mts` refuses a scratch
  root inside a checkout, so no run could start.
- It could not read the verified full-history target copies in the 0.6.3 board scratch root.

No run started, no scanner was imported, no target was copied or cloned, and no row-level output
was read. Nothing has been scored, so all four runs belong on one host. Never split a run between
hosts.

This sheet applies `../public-delta-harness/RUN.md` to this plan. It is not part of the
preregistration. Every block is zsh-safe and has no `#` comments. Run the blocks in order, and stop
at any checkpoint whose expected output does not appear.

## 1. Paths

Use a clean checkout of this pull request's branch, at or after the preregistration commit. In the
command below, `<protocol checkout>` is that checkout's path. The scratch root, source checkouts
and target copies all sit outside every repository. If your verified copies are not in the 0.6.3
board scratch root, set `BOARD` to the directory that holds them. That directory must hold one
directory per public row, verified against corpus digest
`dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`.

```
export P=<protocol checkout>
export D=docs/experiments/public-delta-0-6-5-2026-10-15
export PREREG=9b37aa48e922cfbaebf037d964e0fd3458037bb8
export S=~/tmp/cejel-public-delta-0-6-5-2026-10-15
export SRC_V064=~/tmp/cejel-pd065-src-v064
export SRC_MAIN=~/tmp/cejel-pd065-src-main
export BOARD=~/tmp/cejel-board-0.6.3-full/work
```

## 2. Protocol checkout and harness self-test

```
cd "$P"
git status --porcelain
git merge-base --is-ancestor "$PREREG" HEAD && echo "prereg is an ancestor"
git show "$PREREG:$D/plan.json" | cmp - "$D/plan.json" && echo "plan bytes match prereg"
pnpm install --frozen-lockfile
pnpm exec node --test docs/experiments/public-delta-harness/harness.node-test.mjs "$D/byte-identity.node-test.mjs"
```

**Checkpoint 2:**
- `git status` prints nothing;
- both `echo` lines print;
- the test run ends with `# pass 36` and `# fail 0`.

## 3. Source checkouts, one per distinct run commit

`package.json` and `pnpm-lock.yaml` are identical at both commits, and neither declares an install
lifecycle script.

```
git -C "$P" worktree add --detach "$SRC_V064" 093de2a16408f249be3470b9f4e385e21c8899a8
git -C "$P" worktree add --detach "$SRC_MAIN" 98dbf2505406fd3f3ac9eb4d904bf5e2d044edbd
(cd "$SRC_V064" && pnpm install --frozen-lockfile && git status --porcelain --untracked-files=no && git rev-parse HEAD)
(cd "$SRC_MAIN" && pnpm install --frozen-lockfile && git status --porcelain --untracked-files=no && git rev-parse HEAD)
```

**Checkpoint 3:** no status lines, then `093de2a16408f249be3470b9f4e385e21c8899a8` and
`98dbf2505406fd3f3ac9eb4d904bf5e2d044edbd`.

## 4. Fresh scratch root and the 23 public target copies

`mkdir` without `-p` fails if the scratch root already exists. That is intended: use a fresh root.
`cp -c` makes APFS clone copies. Copy public rows only.

```
mkdir "$S" "$S/checkouts"
cd "$P"
node -e 'for (const e of require(process.argv[1]).entries) if (e.visibility === "public") console.log(e.name)' "$P/leaderboard/corpus.json" > "$S/public-names.txt"
wc -l < "$S/public-names.txt"
while read -r name; do cp -cR "$BOARD/$name" "$S/checkouts/$name" < /dev/null; done < "$S/public-names.txt"
ls "$S/checkouts" | wc -l
```

**Checkpoint 4:** both counts are `23`. `score-arm.mts` checks each target's identity (pin,
clean tree, not shallow, no partial-clone filter) before scoring and again before and after every
scan. A target that fails is refused, not repaired.

## 5. The four runs, once each, in plan order

Each run is followed by one refusal check. The check runs only if that run wrote its manifest. It
must print `1`: the harness refuses the existing output before it imports the scanner, so the check
scores nothing. Do not re-run a run that failed. Record the failure.

```
cd "$P"
pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_V064" v064-v17 "$S" "$PREREG" | tee "$S/run-v064-v17.log"
test -f "$S/out/v064-v17/_manifest.json" && pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_V064" v064-v17 "$S" "$PREREG" 2>&1 | grep -c 'run output already exists; never overwrite a run'
```

```
cd "$P"
pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v17 "$S" "$PREREG" | tee "$S/run-main-v17.log"
test -f "$S/out/main-v17/_manifest.json" && pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v17 "$S" "$PREREG" 2>&1 | grep -c 'run output already exists; never overwrite a run'
```

```
cd "$P"
pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v25 "$S" "$PREREG" | tee "$S/run-main-v25.log"
test -f "$S/out/main-v25/_manifest.json" && pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v25 "$S" "$PREREG" 2>&1 | grep -c 'run output already exists; never overwrite a run'
```

```
cd "$P"
pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v26 "$S" "$PREREG" | tee "$S/run-main-v26.log"
test -f "$S/out/main-v26/_manifest.json" && pnpm exec tsx docs/experiments/public-delta-harness/score-arm.mts "$D/plan.json" "$SRC_MAIN" main-v26 "$S" "$PREREG" 2>&1 | grep -c 'run output already exists; never overwrite a run'
```

**Checkpoint 5, for each run:**
- the first JSON line names the run, its commit and its rubric;
- the last line is `{"run":"<name>","completed":23,"rows":23}` if E0 holds;
- the refusal check prints `1`.

Any other value is a measurement. Keep it as it is.

## 6. Compare and byte identity

```
cd "$P"
node docs/experiments/public-delta-harness/compare.mjs "$D/plan.json" leaderboard/corpus.json "$S" | tee "$S/compare.log"
node "$D/byte-identity.mjs" "$D/plan.json" leaderboard/corpus.json "$S" | tee "$S/byte-identity.log"
cp "$S/paired-result.json" "$S/byte-identity.json" "$D/"
```

**Checkpoint 6:** both scripts print their summaries, and both files are now beside the
preregistration.

## 7. Result

Write `result.md` against the unchanged expected values, using the reading rules in the
preregistration's "How each value is read". Use the run logs and refusal-check counts for E0.

Attribution for E2, E3 and E4 reads the raw reports under `$S/out/`, locally. It covers:

- which rule moved A2;
- whether a row declares workspaces;
- which A5 or A2 finding appeared or disappeared;
- the table for an A2 firing that is new under v26.

Only per-row facts and scalars enter `result.md`. No evidence text or path is committed, and raw
reports stay local.

Commit the three files on this branch, so that the preregistration commit stays a strict ancestor.
Merge with a merge commit, never a squash. Afterwards, remove the source checkouts:

```
git -C "$P" worktree remove "$SRC_V064"
git -C "$P" worktree remove "$SRC_MAIN"
```
