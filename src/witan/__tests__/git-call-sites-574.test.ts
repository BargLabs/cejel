import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// #574 item 3: every execGit call in Cejel's source, with what its caller does when the call fails,
// and one class. A new call, a moved call or a removed one fails this test until the record says
// what its failure does. The record is keyed by file, enclosing function and the call's position in
// that function, so it does not move when lines above it move.
//
// The classes (goal card of 10 Nov, item A):
// - stated: the failure reaches a scan limitation, a history limitation or a disclosure; a read
//   whose failure stops the scan with an error naming the read is counted here too, since no report
//   is written that could differ;
// - abstains: the failure makes a criterion abstain with a stated reason;
// - silent switch: the failure changes which evidence is read, with nothing stated;
// - silent absence: the failure reads as "none found", with nothing stated.
//
// "Expected absence" below is git_absent or not_a_repo (isExpectedGitAbsence): git is not installed,
// or git answered that there is no repository or no revision. Both are facts about the host or the
// directory, not about the machine's load; #560 and #568 decided how history reads treat them.
// "Other failure" is timeout, buffer_exceeded or exec_failed (a non-zero exit, or a spawn error).

type GitCallSiteClass = 'stated' | 'abstains' | 'silent switch' | 'silent absence';

interface GitCallSite {
  readonly command: string;
  readonly onFailure: string;
  readonly class: GitCallSiteClass;
  /** The class on origin/main before #574 item 3 (1da23c208), where it differs. */
  readonly classOnMain?: GitCallSiteClass;
}

const RECORD: Readonly<Record<string, GitCallSite>> = {
  'src/witan/repo-signals.ts#explainIgnoredScanTarget#1': {
    command: 'git rev-parse --show-toplevel',
    onFailure:
      'Runs only when the inventory is empty. Expected absence: no ignored-path reason. Other failure: the scan stops with "repository-root discovery" named.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#explainIgnoredScanTarget#2': {
    command: 'git check-ignore --quiet -- <target>/',
    onFailure:
      "Exit 1 is git's answer \"not ignored\". Expected absence: no reason. Other failure: the scan stops with \"ignore-rule check\" named.",
    class: 'stated',
  },
  'src/witan/repo-signals.ts#a2HistoryIncompleteness#1': {
    command: 'git rev-parse --git-dir',
    onFailure:
      'Runs only when a history read reported no repository and a .git entry is visible. Any failure reads as an unopenable repository: A2 abstains under v27 (and wherever the report withholds its verdict for the history) and discloses otherwise (#560). A timeout here is named as an unopenable repository, not as a timeout.',
    class: 'abstains',
  },
  'src/witan/repo-signals.ts#readAuditFreshnessCommitterYear#1': {
    command: 'git show -s --format=%cI HEAD',
    onFailure:
      'Expected absence: no freshness year (no commit to date). Other failure: scan limitation "HEAD committer-date discovery", B4 keeps only static freshness markers.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readGitTrackedFileOutput#1': {
    command: 'git rev-parse --is-inside-work-tree',
    onFailure: 'Returned to the callers of readGitTrackedFileOutput as the inventory read\'s failure; see #2.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readGitTrackedFileOutput#2': {
    command: 'git ls-files --cached',
    onFailure:
      'collectRepoFileInventory: other failure states "Tracked-file inventory was unavailable because <gitFailureDetail>" and walks the directory; expected absence walks the directory unstated (a directory git calls no repository has no tracked files; git missing is #568\'s, which A2 states). listRepoInventory: other failure stops the scan. listGitTrackedFiles (monorepo root): other failure states "monorepo shared-file inventory".',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#resolveMonorepoContext#1': {
    command: 'git rev-parse --show-toplevel',
    onFailure:
      'Expected absence: no monorepo context. Other failure: scan limitation "repository-root discovery", no root-level shared configuration.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readHistoryCommitsInPages#1': {
    command: 'git rev-list --max-count=<page> --skip=<n> HEAD',
    onFailure: 'Other failure: declareHistoryFailure (scan limitation, A2 recorder). Expected absence: recorder notes it (#560).',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#runHistoryCommandInBatches#1': {
    command: 'git <history argv> --stdin (batched)',
    onFailure: 'Own limit: halve and retry; other failure: declareHistoryFailure. Expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readCredentialHistoryEntries#1': {
    command: 'git rev-list HEAD',
    onFailure: 'Own limit: paged re-read (#567); other failure: declareHistoryFailure; expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readCredentialHistoryEntries#2': {
    command: 'git diff-tree --stdin --root --name-only -r --diff-filter=AM -z',
    onFailure: 'Own limit: batched re-read; other failure: declareHistoryFailure; expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readDeletedCredentialHistoryPaths#1': {
    command: 'git log HEAD --diff-filter=D --name-only -z',
    onFailure: 'Own limit: batched re-read; other failure: declareHistoryFailure; expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readHistoryCommitsForPath#1': {
    command: 'git log HEAD --diff-filter=AM --format=%H -- :(literal)<path>',
    onFailure: 'Other failure: declareHistoryFailure; expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readGitBlob#1': {
    command: 'git show <commit>:<path>',
    onFailure: 'A gitlink is not a failure; other failure: declareHistoryFailure (512 KiB limit named); expected absence: recorder notes it.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#isGitlinkInCommit#1': {
    command: 'git diff-tree --root -r --raw -z --no-commit-id <commit> -- :(literal)<path>',
    onFailure: 'Runs only after a blob read failed. Any failure reads as "not a gitlink", so the blob read\'s failure is declared.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readRecentCommits#1': {
    command: 'git log --max-count=12 --format=%H%x00%s',
    onFailure: 'Expected absence: no commits. Other failure: the scan stops with "recent history scan" named.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#readGitHead#1': {
    command: 'git rev-parse HEAD',
    onFailure: 'Expected absence: no HEAD. Other failure: the scan stops with "HEAD resolution" named.',
    class: 'stated',
  },
  'src/witan/repo-signals.ts#hasEnvPathInGitHistory#1': {
    command: 'git log HEAD --diff-filter=AM --name-only -z',
    onFailure: 'Own limit: batched re-read; other failure: declareHistoryFailure; expected absence: recorder notes it.',
    class: 'stated',
  },
  // On main this call was readHistoryDepth's, and isShallowRepository made a second, separate one,
  // read three more times per scan (A2, B2, the shallow disclosure). Since the review of b67489a96
  // (item A) the scan reads this one answer once and every reader of the depth uses it.
  'src/witan/history-depth.ts#readHistoryDepthAnswer#1': {
    command: 'git rev-parse --is-shallow-repository',
    onFailure:
      "Read once per scan; the report-level abstention, A2, B2 and the shallow disclosure all use the answer. Any failure: the depth is read from the shallow file in the common git directory, the file git itself reads to answer, so the evidence is the same (a shallow file git cannot open reads as shallow, the cautious side); not_a_repository where no .git entry is visible. Other failure: stated (historyDepthFailureLimitation), and where the files cannot settle the depth v27's A2 counts a failed history read and v27's B2 abstains in the composite at 0 where fewer than 12 commits are visible. The disclosure, which quotes git's answer, is written only where git answered.",
    class: 'stated',
    classOnMain: 'silent switch',
  },
  // On main this call was readScannedSubject's.
  'src/witan/public-scan.ts#readScannedSubjectAnswer#1': {
    command: 'git show -s --format=%ct HEAD',
    onFailure:
      'Runs only when HEAD resolved. Any failure: no commit time, so every ingested input\'s freshness is "unverifiable" instead of stale or within the window; stated ("HEAD committer-time discovery") wherever there is an ingested input. With none, the commit time decides nothing and nothing is added.',
    class: 'stated',
    classOnMain: 'silent absence',
  },
  'src/packs/llm/files.ts#listTrackedFiles#1': {
    command: 'git rev-parse --is-inside-work-tree',
    onFailure: 'LLM pack, not the scan. Expected absence: no tracked list. Other failure: the command stops with "work-tree check" named.',
    class: 'stated',
  },
  'src/packs/llm/files.ts#listTrackedFiles#2': {
    command: 'git ls-files --cached',
    onFailure: 'LLM pack, not the scan. Expected absence: no tracked list. Other failure: the command stops with "tracked-file inventory" named.',
    class: 'stated',
  },
  'src/packs/d-series/unobserved-control.ts#introducedCommit#1': {
    command: 'git log --reverse --format=%H -S<text> -- <path>',
    onFailure: 'D-series pack, not the scan. Any failure: no introducing commit, recorded as an anchor abstention.',
    class: 'abstains',
  },
};

const SOURCE_FILES = [
  'src/witan/repo-signals.ts',
  'src/witan/history-depth.ts',
  'src/witan/public-scan.ts',
  'src/packs/llm/files.ts',
  'src/packs/d-series/unobserved-control.ts',
] as const;

const ROOT = join(__dirname, '..', '..', '..');

/** Every execGit call in `file`, keyed `<file>#<enclosing function>#<position in it>`. */
function callSitesIn(file: string): string[] {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const keys: string[] = [];
  const perFunction = new Map<string, number>();
  let enclosing = '<module>';
  for (const line of lines) {
    const declared = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(line);
    if (declared?.[1]) enclosing = declared[1];
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*\*/.test(code) || !/\bexecGit\(/.test(code) || /function\s+execGit\(/.test(code)) continue;
    const position = (perFunction.get(enclosing) ?? 0) + 1;
    perFunction.set(enclosing, position);
    keys.push(`${file}#${enclosing}#${position}`);
  }
  return keys;
}

describe('#574 item 3: every execGit call site is classified', () => {
  it('the record names exactly the execGit calls in the source', () => {
    const found = SOURCE_FILES.flatMap(callSitesIn).sort();
    expect(found).toEqual(Object.keys(RECORD).sort());
  });

  it('the scan path has 18 calls in repo-signals.ts, 1 in history-depth.ts and 1 in public-scan.ts', () => {
    expect(callSitesIn('src/witan/repo-signals.ts')).toHaveLength(18);
    expect(callSitesIn('src/witan/history-depth.ts')).toHaveLength(1);
    expect(callSitesIn('src/witan/public-scan.ts')).toHaveLength(1);
  });

  it('no call site is a silent switch or a silent absence', () => {
    const silent = Object.entries(RECORD)
      .filter(([, site]) => site.class === 'silent switch' || site.class === 'silent absence')
      .map(([key]) => key);
    expect(silent).toEqual([]);
  });
});
