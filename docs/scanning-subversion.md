# Scanning a Subversion repository

Cejel scans a git repository. To scan code kept in Subversion, convert it to git with `git svn`,
then scan the converted directory. This page gives the recipe, the record of one measured run on
the Apache Portable Runtime (APR), what follows from the conversion, and what has not been tested.

Everything this page says about what Cejel reports comes from that one run. It is not a general
claim about Subversion repositories.

## Recipe

1. **Choose how much history to convert.** A conversion can start at any revision. To start at
   a date, ask Subversion for the last revision that changed the path on or before that date
   with `svn info` at that date:

   ```text
   svn info -r '{2024-11-17}' https://svn.apache.org/repos/asf/apr/apr/trunk
   ```

2. **Convert from that revision to the head:**

   ```text
   git svn clone -r 1921159:HEAD https://svn.apache.org/repos/asf/apr/apr/trunk apr-svn
   ```

3. **Scan the converted directory:**

   ```text
   npx @cejel/cejel@0.6.11 scan apr-svn --out out-apr-svn --product-name apr
   ```

4. **Find the Subversion revision the certificate describes.** The certificate names a git
   commit. `git svn` writes the Subversion revision into each commit message, as a `git-svn-id`
   line ending in `@<revision>`. Read that line in the message of the commit the report names.

The URL, revision and directory names above are the ones from the APR run below. Replace them
with your own.

## The recorded run (17 Nov 2026)

**Environment:** Ubuntu 24.04, git 2.43.0, git-svn 2.43.0 (svn 1.14.3), Node 22, `@cejel/cejel`
0.6.11 from npm.

**Subject:** Apache Portable Runtime (APR). Its canonical repository is Subversion,
`https://svn.apache.org/repos/asf/apr/apr/trunk`, last changed at r1940371 on 16 Nov 2026. Apache
also publishes a git mirror at `https://github.com/apache/apr`. The run converted trunk, scanned
the conversion, then scanned the mirror for comparison.

**Commands, in order:**

```text
svn info -r '{2024-11-17}' https://svn.apache.org/repos/asf/apr/apr/trunk
git svn clone -r 1921159:HEAD https://svn.apache.org/repos/asf/apr/apr/trunk apr-svn
npx @cejel/cejel@0.6.11 scan apr-svn --out out-apr-svn --product-name apr
git clone https://github.com/apache/apr.git apr-mirror
npx @cejel/cejel@0.6.11 scan apr-mirror --out out-apr-mirror --product-name apr
```

The run installed `@cejel/cejel@0.6.11` from npm into a working directory and ran the scans
with `npx cejel scan`. The commands here name the pinned package, so they run the version this
record describes.

The first command gave r1921159, the last revision that changed trunk on or before 17 Nov 2024,
so the conversion holds two years of trunk history.

**Results:**

- The conversion took 247 seconds and produced 160 commits. The mirror has 9,637 commits (full
  history).
- The two working trees were the same apart from one empty directory, which git does not track.
- Each scan took one to two seconds.
- The two `report.json` files differed in one field only, `repo.headSha` (`5483bdae…` for the
  conversion, `fe04cce0…` for the mirror). Every score, finding, measurement and skipped-content
  count was identical. `summary.json` was identical.
- Both scans: overall 2.5/4.0 (Conditional), code 2.0, process 2.9; 5 of 11 dimensions measured,
  6 not applicable. Findings: A4 dependencies, critical (0.5/4.0); B2 pull request history,
  warning (3.2/4.0); A1, informational (no coverage configuration).
- B2's weakest measurement, recent commits with recognisable pull-request references, was 0 of 12
  in both scans. APR's commits come from Subversion and carry no pull-request references, so
  this reflects the project's workflow, not the conversion.

## What follows from the conversion

- **The certificate is bound to a git commit, not to a Subversion revision.** It names the commit
  the conversion produced. The `git-svn-id` line in that commit's message is how a reader finds
  the Subversion revision it describes; in the APR run the line ends in `@1940371`.
- **The commit hash depends on how the conversion was run.** A conversion with a different start
  revision, an authors file or other options produces different commit hashes for the same tree,
  so its certificate names a different commit.
- **Authors.** Without an authors file, `git svn` records each author as
  `<user>@<repository UUID>`. The APR run used no authors file, and nothing in the report changed
  because of it.
- **A partial history covers only the converted revisions.** Checks that read history, such as
  the secret scan of reachable history and the reading of recent commit subjects, see only the
  revisions converted. In the APR run both scans found no critical secret, so the shorter history
  changed nothing there. That is one result on one repository; a shorter history can hide what a
  full one would show.

## Not tested

- A full-history conversion.
- A repository with the standard trunk, branches and tags layout, converted with `git svn`'s
  standard-layout option.
- Any repository other than APR.
- Any Cejel version other than 0.6.11.
