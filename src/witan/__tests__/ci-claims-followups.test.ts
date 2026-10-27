import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  CI_CLAIMS_FIXTURES,
  CONTROLS_517,
  EVASIONS,
  TOX_LOCK_RUNNER_FIXTURE,
  baselineFor,
} from './fixtures/ci-claims-followups-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { NO_RISE_COMPOSITES, checkNoRise, lostFindings, rises } from './v27-no-rise.js';

// Follow-ups to #597 for #520 and #517 (#598, then its review).
//
// #520: the lockfile-requirement reader decided "the lockfile may be generated" per workflow
// without regard to step order, so CI that runs `uv sync --locked` and then `uv run pytest`, with
// uv.lock deleted, still printed "a committed lockfile is credited but not required": the later
// `uv run` excused the earlier step, which fails first. A step whose `run:` is one command fails
// with it in every shell GitHub provides, so the separate-step shape stands on any runner. A pip
// install with --require-hashes reads a hash-pinned requirements file, which is a lockfile
// requirement too. An earlier `uses:` step may write the lockfile: a local composite action's
// `run:` steps are read as if inline, and any other action Cejel does not read leaves the
// requirement not determined. Under every rubric, a requirement CI states reports
// lockfile_coverage, as 0 or as not computed with a stated reason.
//
// #517: v27's publishing rule was evaded by an always-true job condition, a pull-request word in a
// comment, a matrix, list-form or non-Ubuntu runner, a default shell, a reusable-workflow job, a
// fromJSON matrix in an unrelated job or in the publishing job itself, `success()`/`!cancelled()`,
// an upper-case event name or a fork guard. Each evasion below is #517's publishing workflow, moved onto every push to main with
// its gate removed, and must not raise B3 above the same repository without it.
//
// The fixtures are in fixtures/ci-claims-followups-fixtures.ts.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = CI_CLAIMS_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'ci-claims-fixture',
    productDisplayName: 'CI claims fixture',
    generatedAt: '2026-10-27T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

function metricValue(score: WitanCriterionScore, name: string): number | undefined {
  return score.metrics.find((metric) => metric.name === name)?.value;
}

const NOT_REQUIRED = 'a committed lockfile is credited but not required';
const REQUIREMENT_FINDING = "This repository's CI requires a lockfile";
const NOT_DETERMINED = 'was not determined';

describe('#520 — a requiring step stands when it comes before every step that could write the lockfile', () => {
  const claimed = [
    ['uv-sync-then-run-lockfile-deleted', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-frozen-then-run-lockfile-deleted', 'uv sync --frozen', 'uv.lock', 12],
    ['uv-sync-then-run-one-step', 'uv sync --locked', 'uv.lock', 13],
    ['uv-sync-then-run-windows', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-then-run-matrix-os', 'uv sync --locked', 'uv.lock', 15],
    ['uv-sync-then-run-shell-bash', 'uv sync --locked', 'uv.lock', 12],
    ['pip-require-hashes-file-deleted', 'pip install --require-hashes', 'requirements/ci.txt', 12],
    ['local-composite-without-writer', 'uv sync --locked', 'uv.lock', 13],
    ['action-in-another-job', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-and-run-one-line', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-and-run-one-line-windows', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-and-echo-then-run', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-then-run-shell-bash-login', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-then-run-shell-bash-el-windows', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-then-run-shell-bash-noprofile', 'uv sync --locked', 'uv.lock', 15],
  ] as const;

  it('every rubric: the note names the requiring line instead of saying a lockfile is not required', () => {
    for (const [name, command, lockfile, line] of claimed) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain(NOT_REQUIRED);
        expect(a4.notes, `${name}@${rubricVersion}`).toContain(
          `An unconditional step in this repository's CI runs \`${command}\` (.github/workflows/tests.yaml line ${line}), which exits with an error without ${lockfile}, and the scanned inventory holds none.`,
        );
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain(NOT_DETERMINED);
        expect(a4.evidence[0]?.path, `${name}@${rubricVersion}`).toBe('.github/workflows/tests.yaml');
        expect(a4.evidence[0]?.line, `${name}@${rubricVersion}`).toBe(line);
      }
    }
  });

  it('v27: lockfile_coverage is 0 and a warning finding cites the requiring line', () => {
    for (const [name, command, lockfile, line] of claimed) {
      const a4 = criterion(name, V27, 'A4');
      expect(metricValue(a4, 'lockfile_coverage'), name).toBe(0);
      const finding = a4.findings.find(({ summary }) => summary.startsWith(REQUIREMENT_FINDING));
      expect(finding?.summary, name).toBe(
        `This repository's CI requires a lockfile that is not committed: an unconditional step runs \`${command}\`, which exits with an error without ${lockfile}, and the scanned inventory holds none.`,
      );
      expect(finding?.severity, name).toBe('warning');
      expect(finding?.evidence.line, name).toBe(line);
    }
  });

  it('v17: lockfile_coverage is reported as not computed, with the reason, never by omission', () => {
    for (const [name, , lockfile, line] of claimed) {
      const a4 = criterion(name, V17, 'A4');
      expect(metricValue(a4, 'lockfile_coverage'), name).toBeUndefined();
      expect(a4.disclosures, name).toContain(
        `A4 did not compute lockfile coverage under this rubric, which scores a library's lockfile only when one is committed: this repository's own CI requires ${lockfile} (.github/workflows/tests.yaml line ${line}), and the scanned inventory holds none.`,
      );
    }
  });

  it('nothing is claimed when the lockfile is committed, may be written first, or a failing command need not stop the job', () => {
    for (const name of [
      'uv-sync-then-run-with-lockfile',
      'uv-run-before-sync',
      'uv-run-in-another-job',
      'uv-sync-in-and-list',
      'uv-sync-piped',
      'uv-sync-then-run-one-step-windows',
      'pip-require-hashes-file-committed',
      'pip-without-require-hashes',
      'pip-require-hashes-compiled-first',
      'local-composite-writes-lockfile',
      'uv-lock-and-sync-one-line',
      'uv-sync-semicolon-run-one-line-windows',
      'uv-sync-and-run-then-echo',
      'uv-sync-then-run-shell-nu',
    ]) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain("this repository's CI runs");
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain(NOT_DETERMINED);
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
        expect(a4.disclosures ?? [], `${name}@${rubricVersion}`).not.toContainEqual(expect.stringContaining('lockfile coverage'));
      }
    }
  });
});

describe('#520 — an earlier action Cejel does not read leaves the requirement not determined', () => {
  const ACTION = 'uses an action Cejel did not read in full, which may write it first.';
  const notDetermined = [
    ['action-before-sync-then-run', 12, 13],
    ['action-before-sync-only', 12, 13],
    ['local-composite-using-action', 12, 13],
    ['local-javascript-action', 12, 13],
  ] as const;

  it('every rubric: the note says the requirement was not determined and why, never that a lockfile is not required', () => {
    for (const [name, usesLine, line] of notDetermined) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain(NOT_REQUIRED);
        expect(a4.notes, `${name}@${rubricVersion}`).toContain(
          `An unconditional step in this repository's CI runs \`uv sync --locked\` (.github/workflows/tests.yaml line ${line}), which exits with an error without uv.lock, and the scanned inventory holds none. Whether that makes a lockfile required was not determined: an earlier step in the same job (.github/workflows/tests.yaml line ${usesLine}) ${ACTION}`,
        );
      }
    }
  });

  it('every rubric: lockfile_coverage is not computed, with the reason, and no finding or 0 is claimed', () => {
    for (const [name, usesLine, line] of notDetermined) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).toBeUndefined();
        expect(a4.findings.some(({ summary }) => summary.startsWith(REQUIREMENT_FINDING)), `${name}@${rubricVersion}`).toBe(false);
        expect(a4.disclosures, `${name}@${rubricVersion}`).toContain(
          `A4 did not compute lockfile coverage, because whether this repository requires a lockfile was not determined: an unconditional CI step runs \`uv sync --locked\` (.github/workflows/tests.yaml line ${line}), which exits with an error without uv.lock, and an earlier step in the same job (.github/workflows/tests.yaml line ${usesLine}) ${ACTION}`,
        );
      }
    }
  });

  it('the tox requirement is not determined when a CI step uses an action Cejel does not read', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion('tox-action-before-tox', rubricVersion, 'A4');
      expect(a4.notes ?? '', rubricVersion).not.toContain(NOT_REQUIRED);
      expect(metricValue(a4, 'lockfile_coverage'), rubricVersion).toBeUndefined();
      expect(a4.findings.some(({ summary }) => summary.startsWith("This repository's tox configuration requires")), rubricVersion).toBe(false);
      expect(a4.disclosures, rubricVersion).toContain(
        `A4 did not compute lockfile coverage, because whether this repository requires a lockfile was not determined: its tox configuration selects the \`uv-venv-lock-runner\` runner (pyproject.toml line 15), which exits with an error without uv.lock, and a CI step (.github/workflows/tests.yaml line 12) ${ACTION}`,
      );
    }
  });
});

describe('#520 — v17 reports lockfile_coverage as not computed for #597 requirements too', () => {
  it('a tox lock runner with no uv.lock is disclosed under v17', () => {
    const a4 = criterion(TOX_LOCK_RUNNER_FIXTURE.name, V17, 'A4');
    expect(a4.disclosures).toContain(
      "A4 did not compute lockfile coverage under this rubric, which scores a library's lockfile only when one is committed: this repository's tox configuration requires uv.lock (pyproject.toml line 15), and the scanned inventory holds none.",
    );
  });
});

describe('#517 — removing the gate does not raise v27 B3, whichever evasion is used', () => {
  const publishingSentence = (file: string) =>
    `1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: ${file}.`;

  for (const [name, , files] of EVASIONS) {
    it(`v27: ${name}`, () => {
      const baseline = criterion(baselineFor(files), V27, 'B3');
      const after = criterion(name, V27, 'B3');
      expect(after.notes, name).toBe(publishingSentence('.github/workflows/publish.yaml'));
      expect(after.score, name).toBe(baseline.score);
      expect(metricValue(after, 'default_branch_ci_depth'), name).toBe(metricValue(baseline, 'default_branch_ci_depth'));
      expect(metricValue(after, 'ci_script_depth'), name).toBe(metricValue(baseline, 'ci_script_depth'));
    });
  }

  it('v17 is unchanged: each evasion still raises B3 above its baseline, as the issue reports', () => {
    for (const [name, , files] of EVASIONS) {
      expect(criterion(name, V17, 'B3').score, name).toBeGreaterThan(criterion(baselineFor(files), V17, 'B3').score);
    }
  });

  it('v27 keeps counting a condition that can be false, a run-line publish off bash, and a remote or guarded reusable workflow', () => {
    for (const [name] of CONTROLS_517) {
      expect(criterion(name, V27, 'B3'), name).toEqual(criterion(name, V17, 'B3'));
    }
  });

  it('B2 is not changed by this rule', () => {
    for (const [name] of [...EVASIONS, ...CONTROLS_517]) {
      expect(criterion(name, V27, 'B2'), name).toEqual(criterion(name, V17, 'B2'));
    }
  });
});

describe('no rise against v17 on these fixtures', () => {
  it('no score, status or composite rises, and no v17 finding is lost', () => {
    for (const { name } of CI_CLAIMS_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});

// ---- v27 against main's v27 --------------------------------------------------------------------
//
// The comparison with v17 above cannot see a change that raises v27 back towards v17: #598's
// whole-file matrix refusal raised B3 on `matrix-in-unrelated-job` from main's 1.6 to 2.1, and
// #599's per-job refusal did the same on `publishing-job-fromjson-matrix`, each still no higher than
// v17. So every fixture here is also compared with main's own v27, pinned in
// fixtures/ci-claims-main-v27.json from the Cejel commit named there. To re-pin, score the fixtures
// with that commit's source: set CI_CLAIMS_MAIN_V27_PIN to the output path and
// CI_CLAIMS_MAIN_V27_COMMIT to the commit, and run only the test named "writes the pin".

interface ScoreSummary {
  readonly overallScore: number | null;
  readonly codeTrustScore: number | null;
  readonly processTrustScore: number | null;
  readonly criteria: Readonly<Record<string, { readonly score: number; readonly status: string }>>;
}

interface MainV27Pin {
  readonly commit: string;
  readonly rubricVersion: string;
  readonly fixtures: Readonly<Record<string, ScoreSummary>>;
}

function scoreSummary(scored: WitanReport): ScoreSummary {
  return {
    overallScore: scored.overallScore ?? null,
    codeTrustScore: scored.codeTrustScore ?? null,
    processTrustScore: scored.processTrustScore ?? null,
    criteria: Object.fromEntries(scored.criteria.map(({ id, score, status }) => [id, { score, status }])),
  };
}

const STATUS_ORDER: Readonly<Record<string, number>> = { verified: 0, info: 1, warning: 2, critical: 3 };

/** Every way `after` rises above `before`: a score or composite, a status toward assurance, or an unscored criterion scored. */
function risesOver(before: ScoreSummary, after: ScoreSummary): string[] {
  const found: string[] = [];
  for (const key of NO_RISE_COMPOSITES) {
    if (rises(before[key], after[key])) found.push(`${key} ${String(before[key])} -> ${String(after[key])}`);
  }
  for (const [id, was] of Object.entries(before.criteria)) {
    const now = after.criteria[id];
    if (!now) {
      found.push(`${id} missing`);
      continue;
    }
    if (rises(was.score, now.score)) found.push(`${id} ${was.score} -> ${now.score}`);
    const wasRank = STATUS_ORDER[was.status];
    const nowRank = STATUS_ORDER[now.status];
    if (wasRank === undefined && was.status !== now.status) found.push(`${id} ${was.status} -> ${now.status}`);
    else if (wasRank !== undefined && nowRank !== undefined && nowRank < wasRank) found.push(`${id} ${was.status} -> ${now.status}`);
  }
  return found;
}

const PIN_PATH = join(import.meta.dirname, 'fixtures', 'ci-claims-main-v27.json');

// The only rises over main's v27 this change makes, each the item's own instruction (#520 item C):
// main claimed CI or tox requires uv.lock, and scored lockfile_coverage 0, where an earlier step
// uses an action Cejel does not read, which may write it. That requirement is now not determined,
// so the 0 is withdrawn and A4 says why. v17 is not raised (the comparison above), and on these two
// fixtures no composite moves.
const PERMITTED_RISES_OVER_MAIN_V27: Readonly<Record<string, readonly string[]>> = {
  'action-before-sync-only': ['A4'],
  'tox-action-before-tox': ['A4'],
};

describe("no rise against main's v27 on these fixtures", () => {
  it.runIf(process.env.CI_CLAIMS_MAIN_V27_PIN !== undefined)('writes the pin', () => {
    const pin: MainV27Pin = {
      commit: process.env.CI_CLAIMS_MAIN_V27_COMMIT ?? '',
      rubricVersion: V27,
      fixtures: Object.fromEntries(CI_CLAIMS_FIXTURES.map(({ name }) => [name, scoreSummary(report(name, V27))])),
    };
    writeFileSync(process.env.CI_CLAIMS_MAIN_V27_PIN ?? '', `${JSON.stringify(pin, null, 2)}\n`);
  });

  it.skipIf(process.env.CI_CLAIMS_MAIN_V27_PIN !== undefined)('every fixture is pinned, and none rises above main except where listed', () => {
    const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as MainV27Pin;
    expect(pin.rubricVersion).toBe(V27);
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(pin.fixtures).sort()).toEqual(CI_CLAIMS_FIXTURES.map(({ name }) => name).sort());
    const risen: Record<string, string[]> = {};
    for (const { name } of CI_CLAIMS_FIXTURES) {
      const found = risesOver(pin.fixtures[name] as ScoreSummary, scoreSummary(report(name, V27)));
      if (found.length > 0) risen[name] = found.map((entry) => entry.split(' ')[0] ?? entry).sort();
    }
    expect(risen).toEqual(
      Object.fromEntries(Object.entries(PERMITTED_RISES_OVER_MAIN_V27).map(([name, keys]) => [name, [...keys].sort()])),
    );
  });
});
