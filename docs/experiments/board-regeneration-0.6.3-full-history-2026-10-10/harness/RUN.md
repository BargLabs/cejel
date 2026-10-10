# Running the 0.6.3 full-history board regeneration

The operator runs these steps **after this PR merges with `--merge`**, from a clean checkout of
this repository's `main`, on one macOS host. Nothing here was run when the harness was written.
The expected values are in `../PREREGISTRATION.md`. `compare.mjs` reads them from that file.

Every command block below is zsh-safe: it has no `#` comments. Run the blocks in order, and stop at
any checkpoint whose expected output does not appear. Score each row once. If a row errors, keep
the error. Do not repair it and re-run it.

`BOARD_ROOT` is a scratch directory outside every repository. The scanner runs from it, and
`run-row.sh` refuses if it, the shell's working directory, or any parent of either is a cejel
checkout or holds an installed `@cejel/cejel` (#436). Nothing under it is committed except the two
comparison outputs, in step 7.

## 1. Scratch root, harness path, corpus

Run this from the root of the cejel checkout, so that `$PWD` resolves the harness:

```
export H=$PWD/docs/experiments/board-regeneration-0.6.3-full-history-2026-10-10/harness
export BOARD_ROOT=~/tmp/cejel-board-0.6.3-full
mkdir -p "$BOARD_ROOT"
cp leaderboard/corpus.json "$BOARD_ROOT/corpus.json"
shasum -a 256 "$BOARD_ROOT/corpus.json"
echo "expect dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00"
node -e 'for (const e of require(process.argv[1]).entries) console.log([e.name, e.visibility, e.url ?? "", e.commit ?? ""].join("\t"))' "$BOARD_ROOT/corpus.json" > "$BOARD_ROOT/entries.tsv"
wc -l < "$BOARD_ROOT/entries.tsv"
pnpm exec node --test "$H/compare.test.mjs"
```

**Checkpoint 1:**
- the digest equals the `expect` line;
- `wc` prints `24`;
- the test run ends with `# pass 7` and `# fail 0`.

## 2. The published package, from the neutral directory

```
cd "$BOARD_ROOT"
npm view @cejel/cejel@0.6.3 gitHead
npx -y @cejel/cejel@0.6.3 --version
```

**Checkpoint 2:**
- `gitHead` is `8ad26b496e32a5bc3b2350f2b0f8a5f940ea74ac`;
- the version line is `0.6.3`.

`run-row.sh` re-checks the version before every row.

## 3. The published board the comparison reads

`compare.mjs` reads `~/projects/cejel-site/leaderboard/reports/*.json` (override with
`SITE_REPORTS`). Confirm the checkout holds the published 0.4.9 board reports:

```
git -C ~/projects/cejel-site fetch --quiet origin
git -C ~/projects/cejel-site diff --quiet 026774b25ed77c692392ee85c4d626b499780823 origin/main -- 'leaderboard/reports/*.json' && echo "board json unchanged since 026774b"
git -C ~/projects/cejel-site diff --quiet HEAD -- 'leaderboard/reports/*.json' && git -C ~/projects/cejel-site diff --quiet origin/main HEAD -- 'leaderboard/reports/*.json' && echo "local board json = origin/main"
```

**Checkpoint 3:** both lines print.

## 4. The 23 public rows, full history, once each

Each row gets a full clone, its pin fetched and checked out detached, and a scan with
`--product-name <row>`. `< /dev/null` keeps `git` and `npx` from consuming the loop's input.

```
cd "$BOARD_ROOT"
while IFS=$'\t' read -r name vis url commit; do
  [ "$vis" = public ] || continue
  "$H/run-row.sh" "$name" "$url" "$commit" "$BOARD_ROOT" < /dev/null
done < "$BOARD_ROOT/entries.tsv" | tee "$BOARD_ROOT/run-public.log"
grep -c '^DONE ' "$BOARD_ROOT/run-public.log"
grep -E '^(ERROR|REFUSED)' "$BOARD_ROOT/run-public.log"
```

**Checkpoint 4:** the count is `23`, and the last command prints nothing.

An `ERROR` row stays an error and is not re-run. A `REFUSED` line means the directory or the
package version is wrong. Nothing has been scored for that row, so fix the environment and run
step 4 again from the start.

## 5. The private row, from your local full-history checkout

Its corpus entry has no `url` or `commit`. Set these three in your shell, from what you hold:

- `PRIVATE_NAME`: its corpus name;
- `PRIVATE_CHECKOUT`: the path of your local full-history checkout;
- `PRIVATE_COMMIT`: the commit its published row was scored at.

None of the three is written in this repository. `run-row.sh` clones the checkout, so the scan sees
the same tracked tree and full history that #448's control arm reproduced.

```
cd "$BOARD_ROOT"
"$H/run-row.sh" "$PRIVATE_NAME" "$PRIVATE_CHECKOUT" "$PRIVATE_COMMIT" "$BOARD_ROOT" < /dev/null
cat "$BOARD_ROOT/out/$PRIVATE_NAME/meta.txt"
```

**Checkpoint 5:**
- one `DONE` line;
- `meta.txt` shows `shallow=false` and your commit as `head`.

Its report stays on this machine.

## 6. Compare

```
cd "$BOARD_ROOT"
node "$H/compare.mjs"
ls "$BOARD_ROOT/board-to-new.json" "$BOARD_ROOT/new-vs-prereg.json"
```

**Checkpoint 6:** both files exist. The console prints:

- the summary: `completed`, `rowsHeld`, rows matching a C1 alternative, rows with scoring or
  placement mismatches, and `rankOrderHeld`;
- the run line: R1 issues, R2 counts, R3;
- every mismatch, row by row.

Expected per the preregistration:

- `completed` `24/24`;
- R1 issues `0`;
- R2 `24` of `24` on each field;
- R3 `0`.

The two outputs are:

- `board-to-new.json`: per public row, published board → new (headline, comparable, coverage,
  placement, every criterion score and status, every metric value/max that moved);
- `new-vs-prereg.json`: per public row, new → preregistered expectation, with every scoring and
  placement mismatch listed, plus the run-level checks.

In both, the private row appears only as `private-row`, with its completion status. Neither file
contains a path.

## 7. Where the outputs go

Paste the step 6 console output to the rubric lane. Copy the two files, unchanged, beside the
preregistration, then write `result.md` there. Commit them on a branch whose history contains the
preregistration commit:

```
D=docs/experiments/board-regeneration-0.6.3-full-history-2026-10-10
cp "$BOARD_ROOT/board-to-new.json" "$D/board-to-new.json"
cp "$BOARD_ROOT/new-vs-prereg.json" "$D/new-vs-prereg.json"
```

Raw reports under `$BOARD_ROOT/out/` stay local until the publishing card's redaction backstop
has run. Publishing the board (staging, the redaction backstop, cejel-site) is that separate card.

## Changes from the #448 harness

The #448 harness is `../../board-clone-depth-2026-10-08/run-row.sh`. Only these changes were made:

- **`run-row.sh`**
  - The full arm only. The depth-1 arm is dropped.
  - The package is `@cejel/cejel@0.6.3`, not 0.4.9.
  - It refuses to run when the shell's working directory or `<root>`, or any parent of either,
    is a cejel checkout or holds an installed `@cejel/cejel`. It also refuses when
    `npx @cejel/cejel@0.6.3 --version` does not print `0.6.3` (#436).
  - It records `head`, `shallow` and `commits`. A row whose `HEAD` is not its pin, or whose
    clone is shallow, is an error and is not scored.
  - It writes `report.json` directly under `out/<row>/`.
- **`compare.mjs`** is new. It reads the published board, the run and the preregistration's
  expected-values block. It writes the two outputs above, and it exports its functions for
  `compare.test.mjs`. Its placement rule reproduces the published board's 14 ranks and every
  public row's comparable score from the published reports.
