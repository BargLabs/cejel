import { readFileSync, readdirSync } from 'node:fs';
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
      'collectRepoFileInventory: other failure states "Tracked-file inventory was unavailable because <gitFailureDetail>" and walks the directory; expected absence walks the directory unstated (a directory git calls no repository has no tracked files; git missing is #568\'s, which A2 states). listRepoInventory: other failure stops the scan. listGitTrackedFiles (monorepo root): other failure states "monorepo shared-file inventory". filesIncludingExcluded (v27 A1\'s builtin-copy check): other failure states "full tracked-file inventory" and A1 credits no builtin copy (review of b67489a96, item C; unstated before); expected absence walks the directory.',
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
      "Read once per scan; the report-level abstention, A2, B2 and the shallow disclosure all use the answer. Any failure: the depth is read from the shallow file in the common git directory, the file git itself reads to answer, so the evidence is the same (a shallow file git cannot open reads as shallow, the cautious side); not_a_repository where no .git entry is visible. Other failure: stated (historyDepthFailureLimitation), and where the files cannot settle the depth A2 counts a failed history read and abstains under every rubric, v17 included (the report withholds its verdict there), and v27's B2 abstains in the composite at 0 where fewer than 12 commits are visible. The disclosure, which quotes git's answer, is written only where git answered.",
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

const ROOT = join(__dirname, '..', '..', '..');

// Review of b67489a96, item D: the record covers every source file under src/, not a fixed list,
// and finds execGit under whatever name a file imports it as. A test file (under __tests__/, or
// named *.test.* or *.spec.*) is not source and is not read.
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const GIT_EXEC_MODULE = /^(?:\.{1,2}\/)+(?:[\w.-]+\/)*git-exec(?:\.[cm]?[jt]s)?$/;
const GIT_EXEC_DEFINITION = 'src/witan/git-exec.ts';

/** Every source file under src/, repository-relative, in a fixed order. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const pending = ['src'];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const entry of readdirSync(join(ROOT, next), { withFileTypes: true })) {
      const path = `${next}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') pending.push(path);
      } else if (SOURCE_FILE_PATTERN.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) {
        found.push(path);
      }
    }
  }
  return found.sort();
}

interface ScannedSource {
  /** Every execGit call, keyed `<file>#<enclosing function>#<position in it>`. */
  readonly calls: string[];
  /**
   * Every way the file reaches execGit other than a call through an imported name: a mention of the
   * name that is not a call (`const run = execGit`), a re-export, a dynamic import or require of
   * git-exec, or a namespace used other than as `ns.execGit(`. Each fails the record test, since a
   * call through it would escape the record.
   */
  readonly unrecognised: string[];
}

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/** The calls and the unrecognised references in one file's text. Linear in the text. */
function scanSource(file: string, text: string): ScannedSource {
  const unrecognised: string[] = [];
  const callees: string[] = [];
  let code = text;
  // Static imports from git-exec, under any local name. Each matched statement is blanked, so its
  // specifiers are not read as mentions below; line numbers stay where they were.
  const importPattern =
    /\bimport\s+(?:type\s+)?(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))\s*from\s*(['"])([^'"]+)\4\s*;?/g;
  code = code.replace(importPattern, (statement, _default, named: string | undefined, namespace: string | undefined, _quote, from: string) => {
    if (!GIT_EXEC_MODULE.test(from)) return statement;
    if (namespace !== undefined) callees.push(`${namespace}.execGit`);
    for (const specifier of (named ?? '').split(',')) {
      const parsed = /^\s*(?:type\s+)?execGit(?:\s+as\s+([\w$]+))?\s*$/.exec(specifier);
      if (parsed) callees.push(parsed[1] ?? 'execGit');
    }
    return blank(statement);
  });
  if (file === GIT_EXEC_DEFINITION) callees.push('execGit');
  const lines = code.split('\n');
  const keys: string[] = [];
  const perFunction = new Map<string, number>();
  let enclosing = '<module>';
  lines.forEach((line, index) => {
    const declared = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/.exec(line);
    if (declared?.[1]) enclosing = declared[1];
    // A comment line, or the part of a line after a comment that follows a space (a `//` inside a
    // string such as a URL is not preceded by one).
    if (/^\s*(?:\*|\/\*|\/\/)/.test(line)) return;
    const stripped = line.replace(/(^|\s)\/\/.*$/, '$1');
    const where = `${file}:${index + 1}`;
    if (/\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"][^'"]*git-exec/.test(stripped)) {
      unrecognised.push(`${where} re-exports git-exec`);
    }
    if (/\b(?:import|require)\s*\(\s*['"`][^'"`]*git-exec/.test(stripped)) {
      unrecognised.push(`${where} loads git-exec dynamically`);
    }
    for (const callee of callees) {
      const escaped = callee.replace(/[$.]/g, (character) => `\\${character}`);
      const mention = new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'g');
      for (const match of stripped.matchAll(mention)) {
        const after = stripped.slice((match.index ?? 0) + callee.length);
        const before = stripped.slice(0, match.index ?? 0);
        if (file === GIT_EXEC_DEFINITION && /function\s+$/.test(before)) continue;
        if (/^\s*\(/.test(after)) {
          const position = (perFunction.get(enclosing) ?? 0) + 1;
          perFunction.set(enclosing, position);
          keys.push(`${file}#${enclosing}#${position}`);
        } else {
          unrecognised.push(`${where} mentions ${callee} other than as a call`);
        }
      }
    }
    // A namespace import reaches execGit only as `ns.execGit(`; any other use of the namespace
    // object (`ns['execGit']`, `const { execGit: run } = ns`, passing ns on) is not followed.
    for (const callee of callees.filter((name) => name.endsWith('.execGit'))) {
      const namespace = callee.slice(0, -'.execGit'.length);
      const use = new RegExp(`(?<![\\w$.])${namespace.replace(/\$/g, '\\$')}(?![\\w$])(?!\\.execGit\\b)`, 'g');
      if (use.test(stripped)) unrecognised.push(`${where} uses the git-exec namespace ${namespace} other than to call execGit`);
    }
  });
  return { calls: keys, unrecognised };
}

function scanFile(file: string): ScannedSource {
  return scanSource(file, readFileSync(join(ROOT, file), 'utf8'));
}

function callSitesIn(file: string): string[] {
  return scanFile(file).calls;
}

describe('#574 item 3: every execGit call site is classified', () => {
  it('the record names exactly the execGit calls in every source file under src/', () => {
    const found = sourceFiles().flatMap(callSitesIn).sort();
    expect(found).toEqual(Object.keys(RECORD).sort());
  });

  it('no source file reaches execGit other than by a call through an imported name', () => {
    expect(sourceFiles().flatMap((file) => scanFile(file).unrecognised)).toEqual([]);
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

// The scanner itself, on synthetic source text: each way a call could escape it is found.
describe('#574 item 3: the call-site scanner (review of b67489a96, item D)', () => {
  it('finds a call through an aliased import, and a call through a namespace import', () => {
    const aliased = "import { describeGitFailure, execGit as runGit } from '../witan/git-exec.js';\nexport function probe(cwd: string) {\n  return runGit(['status'], { cwd });\n}\n";
    expect(scanSource('src/x/probe.ts', aliased)).toEqual({ calls: ['src/x/probe.ts#probe#1'], unrecognised: [] });
    const multiline = "import {\n  type GitExecResult,\n  execGit as run,\n} from './git-exec.js';\nfunction probe() {\n  run(['status'], { cwd: '.' });\n}\n";
    expect(scanSource('src/witan/probe.ts', multiline).calls).toEqual(['src/witan/probe.ts#probe#1']);
    const namespace = "import * as git from './git-exec.js';\nfunction probe() {\n  git.execGit(['status'], { cwd: '.' });\n}\n";
    expect(scanSource('src/witan/probe.ts', namespace)).toEqual({ calls: ['src/witan/probe.ts#probe#1'], unrecognised: [] });
  });

  it('reports every other way to reach execGit', () => {
    const cases = [
      "import { execGit } from './git-exec.js';\nconst run = execGit;\n",
      "import * as git from './git-exec.js';\nconst run = git['execGit'];\n",
      "export { execGit } from './git-exec.js';\n",
      "const { execGit } = await import('./git-exec.js');\n",
    ];
    for (const text of cases) expect(scanSource('src/witan/probe.ts', text).unrecognised, text).toHaveLength(1);
  });

  it('ignores comments, a longer name, and a member of another object; a mention in a string fails closed', () => {
    const text = "import { execGit } from './git-exec.js';\n// execGit(['x'])\n/* execGit(['y']) */\n * execGit(['z'])\nfunction probe() {\n  execGitLater();\n  tools.execGit(['status']);\n  execGit(['status'], { cwd: '.' }); // execGit(['w'])\n}\n";
    expect(scanSource('src/witan/probe.ts', text)).toEqual({ calls: ['src/witan/probe.ts#probe#1'], unrecognised: [] });
    const quoted = "import { execGit } from './git-exec.js';\nconst label = 'execGit';\n";
    expect(scanSource('src/witan/probe.ts', quoted).unrecognised).toEqual(['src/witan/probe.ts:2 mentions execGit other than as a call']);
  });
});
