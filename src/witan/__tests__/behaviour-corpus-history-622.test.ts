import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  BEHAVIOUR_CORPUS_MINIMUM_GIT,
  buildBehaviourFixture,
  fixtureHeadSha,
  HERMETIC_GIT_ENV,
  type BehaviourFixture,
} from './fixtures/behaviour-corpus.js';

// #622: the behaviour corpus's history and publishing specimens. The fingerprint test scores them;
// this file checks that they are what they claim to be: the shallow specimen is a shallow clone
// (never a full one), its full clone scores A2 and B2 from history, its build is the same on every
// run, and v27 counts the publishing workflow as every other rubric does.

const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

function fixture(name: string): BehaviourFixture {
  const found = BEHAVIOUR_CORPUS.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no corpus specimen ${name}`);
  return found;
}

function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' }).trim();
}

function scan(dir: string, name: string, rubricVersion: string) {
  return scoreRepoWithPublicCejel({
    repoPath: dir,
    productSlug: name,
    productDisplayName: name,
    generatedAt: SCAN_GENERATED_AT,
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function criterion(report: ReturnType<typeof scan>, id: string) {
  const found = report.criteria.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no criterion ${id}`);
  return found;
}

const SHALLOW = 'history-shallow-depth-1';
const PUBLISHING = 'publish-after-check-workflow';

describe('#622 — the corpus build the history specimens rely on', () => {
  it(`runs on git ${BEHAVIOUR_CORPUS_MINIMUM_GIT.join('.')} or later`, () => {
    const version = /git version (\d+)\.(\d+)/.exec(git(process.cwd(), ['--version']));
    expect(version, 'git --version printed no version').not.toBeNull();
    const [major, minor] = [Number(version?.[1]), Number(version?.[2])];
    const [needMajor, needMinor] = BEHAVIOUR_CORPUS_MINIMUM_GIT;
    expect(
      major > needMajor || (major === needMajor && minor >= needMinor),
      `the behaviour corpus needs git ${needMajor}.${needMinor} or later; this host runs ${major}.${minor}`,
    ).toBe(true);
  });
});

describe('#622 — every specimen with a clone depth is scanned as a shallow clone', () => {
  const shallowSpecimens = BEHAVIOUR_CORPUS.filter((candidate) => candidate.cloneDepth !== undefined);

  it('the corpus holds at least one', () => {
    expect(shallowSpecimens.map(({ name }) => name)).toContain(SHALLOW);
  });

  for (const specimen of shallowSpecimens) {
    it(`${specimen.name}: git says the materialised repository is shallow, at depth ${specimen.cloneDepth}`, () => {
      const dir = buildBehaviourFixture(specimen);
      expect(git(dir, ['rev-parse', '--is-shallow-repository'])).toBe('true');
      const shallowFile = readFileSync(join(git(dir, ['rev-parse', '--absolute-git-dir']), 'shallow'), 'utf8');
      expect(shallowFile.trim().split('\n').length).toBeGreaterThan(0);
      expect(Number(git(dir, ['rev-list', '--count', 'HEAD']))).toBe(specimen.cloneDepth);
      expect(fixtureHeadSha(dir)).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[specimen.name]);
    });
  }
});

describe(`#622 — ${SHALLOW}: a full clone would score A2 and B2 from history`, () => {
  const full: BehaviourFixture = { ...fixture(SHALLOW), cloneDepth: undefined };

  it('the full repository has the same HEAD, five commits, and the same history on every build', () => {
    const first = buildBehaviourFixture(full);
    const second = buildBehaviourFixture(full);
    expect(git(first, ['rev-parse', '--is-shallow-repository'])).toBe('false');
    expect(fixtureHeadSha(first)).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[SHALLOW]);
    const history = (dir: string) => git(dir, ['log', '--format=%H %an <%ae> %aI %cn <%ce> %cI %s']);
    expect(history(second)).toBe(history(first));
    // Epoch seconds and offset, not %aI: how git writes a +00:00 offset in ISO form varies by version.
    expect(git(first, ['log', '--format=%an <%ae>|%cn <%ce>|%at|%ct|%ad|%s', '--date=format:%z']).split('\n')).toEqual(
      [
        ['2026-09-15T00:04:00Z', 'Merge pull request #4 from example-org/changelog'],
        ['2026-09-15T00:03:00Z', 'Document the total helper (#3)'],
        ['2026-09-15T00:02:00Z', 'Merge pull request #2 from example-org/drop-env'],
        ['2026-09-15T00:01:00Z', 'Add local settings'],
        ['2026-09-15T00:00:00Z', 'initial commit'],
      ].map(([date, subject]) => {
        const seconds = Date.parse(date as string) / 1000;
        return `Cejel Fixture <fixture@cejel.invalid>|Cejel Fixture <fixture@cejel.invalid>|${seconds}|${seconds}|+0000|${subject}`;
      }),
    );
  });

  it('under every rubric, the full clone finds the deleted secret and reads the merge ratio; the shallow clone cannot', () => {
    const fullDir = buildBehaviourFixture(full);
    const shallowDir = buildBehaviourFixture(fixture(SHALLOW));
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const fromFull = scan(fullDir, SHALLOW, rubricVersion);
      expect(criterion(fromFull, 'A2').status, rubricVersion).toBe('critical');
      expect(criterion(fromFull, 'A2').findings.some(({ severity }) => severity === 'critical'), rubricVersion).toBe(true);
      expect(
        criterion(fromFull, 'B2').metrics.find(({ name }) => name === 'pr_merge_ratio')?.value,
        rubricVersion,
      ).toBe(3);

      const fromShallow = scan(shallowDir, SHALLOW, rubricVersion);
      expect(criterion(fromShallow, 'A2').status, rubricVersion).toBe('insufficient_data');
      expect(criterion(fromShallow, 'B2').metrics.map(({ name }) => name), rubricVersion).toEqual(['pr_trace_primitives']);
      expect(fromShallow.verdict, rubricVersion).toBe('insufficient_source');
    }
  });
});

describe(`#622 — ${PUBLISHING}: v27 counts a workflow that checks before it publishes`, () => {
  it('v27 B3 names it as counted, and scores B3 as v17 does', () => {
    const dir = buildBehaviourFixture(fixture(PUBLISHING));
    expect(fixtureHeadSha(dir)).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[PUBLISHING]);
    const v17 = criterion(scan(dir, PUBLISHING, WITAN_RUBRIC_VERSION_V17), 'B3');
    const v27 = criterion(scan(dir, PUBLISHING, WITAN_RUBRIC_VERSION_V27), 'B3');
    expect(v27.notes).toContain(
      '.github/workflows/release.yml is counted as CI verification because a check runs before it publishes',
    );
    expect(v27.metrics.map(({ name, value }) => [name, value])).toEqual(
      v17.metrics.map(({ name, value }) => [name, value]),
    );
    expect(v27.metrics.find(({ name }) => name === 'default_branch_ci_depth')?.value).toBe(1);
    expect(v27.score).toBe(v17.score);
  });
});
