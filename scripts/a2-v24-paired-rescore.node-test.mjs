import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALFRED_COMMIT,
  BASELINE_RUBRIC,
  CANDIDATE_RUBRIC,
  HAND_REVIEW_STATUS,
  PREREGISTRATION_COMMIT,
  assertPrivateRowsPathFree,
  assertStrictPreregistrationAncestry,
  buildDecision,
  buildResult,
  canonicalJson,
  measureRows,
  preparePrivateCheckout,
  renderMarkdown,
  scoreEntry,
  syntheticParityPreflight,
} from './a2-v24-paired-rescore.mjs';

// Synthetic fixtures only. Nothing here reads leaderboard/corpus.json or any corpus repository.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = 'scripts/a2-v24-paired-rescore.mjs';
const PRIVATE_MARKER = 'zz-private-marker-7f3e/vault-internals/ledger-credentials.ts';

const HERMETIC_GIT_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Synthetic Test',
  GIT_AUTHOR_EMAIL: 'test@test.invalid',
  GIT_COMMITTER_NAME: 'Synthetic Test',
  GIT_COMMITTER_EMAIL: 'test@test.invalid',
  GIT_AUTHOR_DATE: '2026-10-01T00:00:00+00:00',
  GIT_COMMITTER_DATE: '2026-10-01T00:00:00+00:00',
};

function sh(cwd, ...argv) {
  return execFileSync('git', argv, { cwd, env: HERMETIC_GIT_ENV, encoding: 'utf8' }).trim();
}

function makeRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sh(dir, 'init', '--quiet');
  sh(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

function writeAndCommit(dir, files, message) {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents, 'utf8');
    sh(dir, 'add', '--', path);
  }
  sh(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', message);
  return sh(dir, 'rev-parse', 'HEAD');
}

// ---- synthetic report builders ------------------------------------------------------------

function finding(severity, summary, path, line = 3) {
  return { severity, summary, evidence: { kind: 'secret_scan', label: 'x', path, line, contentHash: 'abcdef0123456789' } };
}

const COMMITTED = 'Secret-shaped value appears committed in the scanned repository.';
const AMBIGUOUS =
  'Secret-shaped value with an ambiguous content context — Cejel abstains on secret cleanliness rather than assert either a committed credential or a clean result, because x.';

function report({ rubricVersion, a2Score = 4, a2Findings = [], b3Score = 3, overall = 3, verdict = 'conditional', otherPath = 'src/index.ts', limitations = [] }) {
  return {
    rubricVersion,
    overallScore: overall,
    codeTrustScore: overall,
    processTrustScore: overall,
    verdict,
    repo: { path: '/abs/should-not-matter', headSha: 'f'.repeat(40) },
    scanLimitations: limitations,
    criteria: [
      { id: 'A1', category: 'code_trust', score: 3, status: 'verified', evidence: [{ kind: 'artifact', label: 'tests', path: otherPath }], findings: [], metrics: [] },
      {
        id: 'A2',
        category: 'code_trust',
        score: a2Score,
        status: a2Score >= 3.5 ? 'verified' : 'critical',
        evidence: [],
        findings: a2Findings,
        metrics: [{ name: 'secret_cleanliness', label: 'Secret cleanliness', value: a2Score >= 3.5 ? 1 : 0, max: 1 }],
      },
      { id: 'B1', category: 'process_trust', score: 0, status: 'not_applicable', evidence: [], findings: [], metrics: [] },
      { id: 'B3', category: 'process_trust', score: b3Score, status: 'verified', evidence: [], findings: [], metrics: [{ name: 'ci_script_depth', label: 'CI', value: 1 }] },
    ],
  };
}

// A fake sealed scorer: one report per rubric, chosen by the arm.
function scorerFor(baseline, candidate, calls = []) {
  return (options) => {
    calls.push(options);
    return structuredClone(options.rubricVersion === BASELINE_RUBRIC ? baseline : candidate);
  };
}

const OPTIONS = { checkoutRoot: '/tmp/never-created-root', privateAlfredSource: '/tmp/never-read-private-source' };

function scoredRow(name, visibility, baseline, candidate) {
  return {
    name,
    visibility,
    corpusIndex: 0,
    sourceCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    ...scoreEntry({ name, visibility }, { path: `/tmp/${name}` }, scorerFor(baseline, candidate), '2026-10-01T00:00:00.000Z'),
  };
}

const BINDINGS = {
  preregistrationCommit: PREREGISTRATION_COMMIT,
  executionCommit: 'c'.repeat(40),
  baselineRubric: BASELINE_RUBRIC,
  candidateRubric: CANDIDATE_RUBRIC,
  generatedAt: '2026-10-01T00:00:00.000Z',
  corpus: { gitBlob: 'd', sha256: 'e', rows: 24 },
  privateAlfredCommit: ALFRED_COMMIT,
  candidateSources: {},
};

// ---- 1. ancestry ---------------------------------------------------------------------------

test('ancestry: refuses when the preregistration commit is not an ancestor, then when HEAD is not strict, then when tracked files are dirty', () => {
  const repo = makeRepo('cejel-v24-ancestry-');
  const first = writeAndCommit(repo, { 'a.txt': 'one\n' }, 'first');
  const unrelated = makeRepo('cejel-v24-unrelated-');
  const foreign = writeAndCommit(unrelated, { 'b.txt': 'two\n' }, 'foreign');

  assert.throws(
    () => assertStrictPreregistrationAncestry({ root: repo, preregistrationCommit: foreign }),
    /preregistration_commit_is_not_an_ancestor/,
  );
  assert.throws(
    () => assertStrictPreregistrationAncestry({ root: repo, preregistrationCommit: first }),
    /execution_commit_is_not_a_strict_descendant/,
  );
  const second = writeAndCommit(repo, { 'a.txt': 'two\n' }, 'second');
  assert.equal(assertStrictPreregistrationAncestry({ root: repo, preregistrationCommit: first }), second);
  writeFileSync(join(repo, 'a.txt'), 'dirty\n', 'utf8');
  assert.throws(
    () => assertStrictPreregistrationAncestry({ root: repo, preregistrationCommit: first }),
    /tracked_worktree_is_not_clean/,
  );
});

test('ancestry: the committed harness refuses before reading any source when the preregistration is not in history', () => {
  // A repository that does not contain ef253a8. It carries a corpus file and nothing else, so any
  // read that happened before the ancestry check would fail with a different error.
  const repo = makeRepo('cejel-v24-harness-');
  writeAndCommit(
    repo,
    { [HARNESS]: readFileSync(join(REPO_ROOT, HARNESS), 'utf8'), 'leaderboard/corpus.json': '{"entries":[]}\n' },
    'fixture',
  );
  const scratch = mkdtempSync(join(tmpdir(), 'cejel-v24-out-'));
  const checkoutRoot = join(scratch, 'checkouts');
  const jsonPath = join(scratch, 'result.json');
  const markdownPath = join(scratch, 'result.md');

  const run = spawnSync(
    process.execPath,
    [join(repo, HARNESS), '--checkout-root', checkoutRoot, '--private-alfred-source', join(scratch, 'no-source'), '--json', jsonPath, '--markdown', markdownPath],
    { cwd: repo, encoding: 'utf8' },
  );

  assert.equal(run.status, 1);
  assert.match(run.stderr, /preregistration_commit_is_not_an_ancestor/);
  assert.equal(existsSync(checkoutRoot), false, 'no checkout root may be created');
  assert.equal(existsSync(jsonPath), false);
  assert.equal(existsSync(markdownPath), false);
  assert.equal(PREREGISTRATION_COMMIT, 'ef253a8e64e70e27c9c440bc5b3cf02167c81a4e');
});

// ---- 2. non-A2 change is an implementation failure ------------------------------------------

test('a non-A2 criterion that differs between arms is reported as an implementation failure', () => {
  const a2Only = scoredRow('a2-only', 'public', report({ rubricVersion: BASELINE_RUBRIC }), report({ rubricVersion: CANDIDATE_RUBRIC, a2Score: 2 }));
  assert.equal(a2Only.nonA2CriteriaByteIdentical, true);
  assert.deepEqual(a2Only.nonA2ChangedCriteria, []);

  const drift = scoredRow('drift', 'public', report({ rubricVersion: BASELINE_RUBRIC, b3Score: 0.5 }), report({ rubricVersion: CANDIDATE_RUBRIC, b3Score: 4 }));
  assert.equal(drift.nonA2CriteriaByteIdentical, false);
  assert.deepEqual(drift.nonA2ChangedCriteria, ['B3']);

  const result = buildResult([a2Only, drift], BINDINGS);
  const band = result.decision.bands.find((entry) => entry.id === 'nonA2CriterionChanges');
  assert.equal(band.measured, 1);
  assert.equal(band.withinLimit, false);
  assert.deepEqual(band.rows, ['drift']);
  assert.equal(result.decision.mechanicalBandsWithinLimits, false);
  assert.match(renderMarkdown(result), /\| drift \|.*CHANGED \(B3\): implementation failure \|/);
});

test('the synthetic parity preflight refuses on a non-A2 divergence and passes on parity', () => {
  const fixtures = [{ name: 'one' }, { name: 'two' }];
  const base = {
    fixtures,
    headShas: { one: 'h-one', two: 'h-two' },
    build: (fixture) => fixture.name,
    headSha: (dir) => `h-${dir}`,
    generatedAt: '2026-10-01T00:00:00.000Z',
  };
  assert.deepEqual(
    syntheticParityPreflight({ ...base, score: scorerFor(report({ rubricVersion: BASELINE_RUBRIC }), report({ rubricVersion: CANDIDATE_RUBRIC, a2Score: 1 })) }),
    { fixtures: 2, nonA2CriteriaIdentical: true },
  );
  assert.throws(
    () => syntheticParityPreflight({ ...base, score: scorerFor(report({ rubricVersion: BASELINE_RUBRIC }), report({ rubricVersion: CANDIDATE_RUBRIC, b3Score: 1 })) }),
    /preflight_non_a2_divergence:one\[B3\];two\[B3\]/,
  );
  assert.throws(
    () => syntheticParityPreflight({ ...base, headShas: { one: 'other' }, score: () => assert.fail('scored an unreproducible fixture') }),
    /preflight_fixture_not_reproducible:one/,
  );
});

// ---- 3. error rows ------------------------------------------------------------------------

test('an error row is preserved and counted, and no row is ever attempted twice', () => {
  const entries = [
    { name: 'first', visibility: 'public', commit: '1'.repeat(40) },
    { name: 'broken', visibility: 'public', commit: '2'.repeat(40) },
    { name: 'alfred', visibility: 'private' },
    { name: 'last', visibility: 'public', commit: '3'.repeat(40) },
  ];
  const prepared = [];
  const rows = measureRows(entries, {
    options: OPTIONS,
    prepare: (entry) => {
      prepared.push(entry.name);
      if (entry.name === 'broken') throw new Error(`fatal: unable to fetch at ${OPTIONS.checkoutRoot}/broken`);
      if (entry.name === 'alfred') throw new Error(`clone failed for ${OPTIONS.privateAlfredSource}: ${PRIVATE_MARKER}`);
      return { path: `/tmp/${entry.name}`, commit: entry.commit, tree: 't'.repeat(40) };
    },
    score: (entry, checkout) =>
      scoreEntry(entry, checkout, scorerFor(report({ rubricVersion: BASELINE_RUBRIC }), report({ rubricVersion: CANDIDATE_RUBRIC })), '2026-10-01T00:00:00.000Z'),
  });

  assert.deepEqual(prepared, ['first', 'broken', 'alfred', 'last'], 'each row is attempted exactly once, in corpus order');
  assert.deepEqual(rows.map((row) => row.name), ['first', 'broken', 'alfred', 'last']);
  const result = buildResult(rows, BINDINGS);
  const broken = result.rows.find((row) => row.name === 'broken');
  assert.equal(broken.error, 'fatal: unable to fetch at [checkout-root]/broken');
  assert.equal(broken.expectedSourceCommit, '2'.repeat(40));
  const alfred = result.rows.find((row) => row.name === 'alfred');
  assert.equal(alfred.error.detailWithheld, true);
  assert.equal(alfred.error.code, 'clone');
  assert.equal(alfred.expectedSourceCommit, ALFRED_COMMIT);
  assert.equal(result.decision.counts.errors, 2);
  assert.equal(result.decision.counts.completed, 2);
  assert.equal(result.decision.counts.retriedRows, 0);
  const completion = result.decision.bands.find((entry) => entry.id === 'completion');
  assert.equal(completion.withinLimit, false);
  assert.deepEqual(completion.rows, ['broken', 'alfred']);
  const markdown = renderMarkdown(result);
  assert.match(markdown, /\| broken \| error: fatal: unable to fetch/);
  assert.match(markdown, /\| alfred \| error: clone \(detail withheld\)/);
  assert.ok(!canonicalJson(result).includes(PRIVATE_MARKER));
  assert.ok(!markdown.includes(PRIVATE_MARKER));
});

// ---- 4. private paths ---------------------------------------------------------------------

test('the private row never publishes a repository path, in either output', () => {
  const v22 = report({
    rubricVersion: BASELINE_RUBRIC,
    a2Score: 0,
    a2Findings: [finding('critical', COMMITTED, `${PRIVATE_MARKER}.old`, 9)],
    otherPath: PRIVATE_MARKER,
    limitations: [`1 signal declined ${PRIVATE_MARKER}`],
  });
  const v24 = report({
    rubricVersion: CANDIDATE_RUBRIC,
    a2Score: 0,
    a2Findings: [
      finding('critical', COMMITTED, PRIVATE_MARKER, 12),
      finding('info', `Secret-shaped value in a test/fixture file (${PRIVATE_MARKER}) — likely fixture data, not a production leak; verify.`, PRIVATE_MARKER, 4),
      finding('info', AMBIGUOUS, PRIVATE_MARKER, 5),
    ],
    otherPath: PRIVATE_MARKER,
    limitations: [`1 signal declined ${PRIVATE_MARKER}`],
  });
  const privateRow = scoredRow('alfred', 'private', v22, v24);
  const publicRow = scoredRow('react', 'public', v22, v24);
  const result = buildResult([privateRow, publicRow], BINDINGS);
  const json = canonicalJson(result);
  const markdown = renderMarkdown(result);

  // The same material on a public row is published in full, so the test can see the marker.
  assert.ok(json.includes(PRIVATE_MARKER) && markdown.includes(PRIVATE_MARKER));
  const privateJson = canonicalJson([
    result.rows.find((row) => row.name === 'alfred'),
    result.newCriticalSecretFindings.filter((entry) => entry.row === 'alfred'),
    result.lostCriticalSecretFindings.filter((entry) => entry.row === 'alfred'),
  ]);
  assert.ok(!privateJson.includes('zz-private-marker-7f3e'), privateJson);
  for (const line of markdown.split('\n').filter((entry) => /(^| )alfred[ :|]/.test(entry))) {
    assert.ok(!line.includes('zz-private-marker-7f3e'), line);
  }
  assert.doesNotThrow(() => assertPrivateRowsPathFree([privateRow, publicRow], result));

  // The private row still carries the finding, its line, class, and that a review is owed.
  const added = result.newCriticalSecretFindings.find((entry) => entry.row === 'alfred');
  assert.deepEqual(
    { path: added.path, pathWithheld: added.pathWithheld, line: added.line, handReview: added.handReview },
    { path: null, pathWithheld: true, line: 12, handReview: HAND_REVIEW_STATUS },
  );
  assert.match(markdown, /- alfred: path withheld \(private row\), line 12; class flag; .*awaiting operator hand review/);
  const candidate = result.rows.find((row) => row.name === 'alfred').candidate;
  assert.equal(candidate.a2.secretScan.kind, 'flag+abstain');
  assert.equal(candidate.a2.secretScan.count, 3);
  assert.equal(candidate.scanLimitations.withheld, true);
});

test('the private-path guard trips if a private path reaches the published projection', () => {
  const privateRow = scoredRow(
    'alfred',
    'private',
    report({ rubricVersion: BASELINE_RUBRIC }),
    report({ rubricVersion: CANDIDATE_RUBRIC, a2Findings: [finding('critical', COMMITTED, PRIVATE_MARKER)] }),
  );
  const result = buildResult([privateRow], BINDINGS);
  result.newCriticalSecretFindings[0].path = PRIVATE_MARKER;
  assert.throws(() => assertPrivateRowsPathFree([privateRow], result), /private_path_emitted:alfred/);
});

// ---- 5. band counting ---------------------------------------------------------------------

test('band counting: a fixture with known changes produces the exact counts', () => {
  const base = () => report({ rubricVersion: BASELINE_RUBRIC });
  const rows = [];
  const add = (name, candidate, baseline = base()) => rows.push(scoredRow(name, 'public', baseline, candidate));
  // three A2 changes: score, secret_scan kind (to abstention), secret_scan count
  add('a2-score', report({ rubricVersion: CANDIDATE_RUBRIC, a2Score: 3 }));
  add('a2-abstain', report({ rubricVersion: CANDIDATE_RUBRIC, a2Findings: [finding('info', AMBIGUOUS, 'docs/a.md')] }));
  add(
    'a2-count',
    report({ rubricVersion: CANDIDATE_RUBRIC, a2Score: 0, a2Findings: [finding('critical', COMMITTED, 'src/k.ts'), finding('info', 'note', '.env')] }),
    report({ rubricVersion: BASELINE_RUBRIC, a2Score: 0, a2Findings: [finding('critical', COMMITTED, 'src/k.ts')] }),
  );
  // two headline changes, one of which also changes verdict
  add('headline', report({ rubricVersion: CANDIDATE_RUBRIC, overall: 3.2 }));
  add('headline-verdict', report({ rubricVersion: CANDIDATE_RUBRIC, overall: 3.8, verdict: 'verified' }));
  // one non-A2 change
  add('non-a2', report({ rubricVersion: CANDIDATE_RUBRIC, b3Score: 1 }));
  // one new critical (v24 flags a docs value v22 exempted) and one lost critical
  add('new-critical', report({ rubricVersion: CANDIDATE_RUBRIC, a2Score: 0, a2Findings: [finding('critical', COMMITTED, 'docs/runbook.md', 7)] }));
  add('lost-critical', report({ rubricVersion: CANDIDATE_RUBRIC }), report({ rubricVersion: BASELINE_RUBRIC, a2Score: 0, a2Findings: [finding('critical', COMMITTED, 'docs/tutorial.md', 4)] }));
  // twelve unchanged rows and four error rows make 24
  for (let index = 0; index < 12; index += 1) add(`same-${index}`, report({ rubricVersion: CANDIDATE_RUBRIC }));
  for (let index = 0; index < 4; index += 1) rows.push({ name: `error-${index}`, visibility: 'public', expectedSourceCommit: 'x', error: 'boom' });
  assert.equal(rows.length, 24);

  const result = buildResult(rows, BINDINGS);
  const measured = Object.fromEntries(result.decision.bands.map((entry) => [entry.id, [entry.measured, entry.withinLimit, entry.rows]]));
  assert.deepEqual(measured.completion, [20, false, ['error-0', 'error-1', 'error-2', 'error-3']]);
  assert.deepEqual(measured.nonA2CriterionChanges, [1, false, ['non-a2']]);
  assert.deepEqual(measured.a2Changes, [5, true, ['a2-score', 'a2-abstain', 'a2-count', 'new-critical', 'lost-critical']]);
  assert.deepEqual(measured.headlineScoreChanges, [2, true, ['headline', 'headline-verdict']]);
  assert.deepEqual(measured.verdictChanges, [1, true, ['headline-verdict']]);
  assert.deepEqual(measured.newCriticalFalseAssertions, [null, null, ['new-critical']]);
  assert.deepEqual(measured.lostConfirmedTruePositives, [null, null, ['lost-critical']]);
  // Comparable score excludes B1 and averages A1, A2, B3. Baseline: 18 rows at 3.3 (ties by name),
  // then a2-count and lost-critical at 2.0. Candidate: a2-score drops to 3.0, non-a2 to 2.7,
  // new-critical to 2.0 and lost-critical rises to 3.3. Only a2-abstain (1st) and a2-count (19th)
  // keep their rank.
  assert.equal(measured.placementChanges[0], 18);
  assert.equal(measured.placementChanges[1], false);
  assert.deepEqual(
    measured.placementChanges[2].filter((name) => !name.startsWith('same-')),
    ['a2-score', 'headline', 'headline-verdict', 'non-a2', 'new-critical', 'lost-critical'],
  );
  assert.equal(result.decision.protocolDecision, null);
  assert.equal(result.decision.protocolDecisionStatus, HAND_REVIEW_STATUS);
  assert.equal(result.decision.handReviewPending, true);
  assert.deepEqual(
    result.newCriticalSecretFindings.map(({ row, path, line, handReview }) => [row, path, line, handReview]),
    [['new-critical', 'docs/runbook.md', 7, HAND_REVIEW_STATUS]],
  );
  assert.deepEqual(result.lostCriticalSecretFindings.map(({ row, path }) => [row, path]), [['lost-critical', 'docs/tutorial.md']]);

  const markdown = renderMarkdown(result);
  assert.match(markdown, /^Protocol decision: ________ /m);
  assert.doesNotMatch(markdown, /Protocol decision: \*\*(GO|NO-GO)\*\*/);
  assert.equal(markdown.match(/^\| (a2-|headline|non-a2|new-|lost-|same-|error-)/gm)?.length, 24);
});

test('a clean pair with no hand-review candidates settles both review bands at zero', () => {
  const rows = Array.from({ length: 24 }, (_, index) =>
    scoredRow(`repo-${index}`, 'public', report({ rubricVersion: BASELINE_RUBRIC }), report({ rubricVersion: CANDIDATE_RUBRIC })),
  );
  const { decision } = buildResult(rows, BINDINGS);
  assert.equal(decision.mechanicalBandsWithinLimits, true);
  assert.equal(decision.handReviewPending, false);
  assert.equal(decision.protocolDecision, null, 'the harness never writes GO or NO-GO');
  for (const entry of decision.bands) assert.equal(entry.withinLimit, true, entry.id);
});

// ---- full-chain rehearsal on synthetic repositories ---------------------------------------

test('rehearsal: real private local clone and real sealed scoring on synthetic repositories', async () => {
  const { register } = await import('tsx/esm/api');
  register();
  const { scoreRepoWithPublicCejel } = await import('../src/witan/index.ts');

  const gitignore = '.env\n.env.*\n!.env.example\n';
  const placeholder = 'ReplaceThisWithYourOwnApiKeyValue1234567890';
  const real = 'Qv8Ht2Nx6Br4Ls9Dw3Pk7Zf1Mj5Cy0Ag4Tu8Ei2Ro6Xn';
  const privateSource = makeRepo('cejel-v24-private-source-');
  const privateCommit = writeAndCommit(
    privateSource,
    {
      '.gitignore': gitignore,
      'package.json': '{"name":"synthetic-private","version":"1.0.0"}\n',
      'src/index.ts': 'export const version = "1.0.0";\n',
      [`docs/${PRIVATE_MARKER}`]: `# Rotation\n\n    LEDGER_INGEST_TOKEN=${real}\n`,
    },
    'synthetic private source',
  );
  writeAndCommit(privateSource, { 'src/later.ts': 'export const later = 1;\n' }, 'a later commit the harness must not use');
  const publicSource = makeRepo('cejel-v24-public-source-');
  const publicCommit = writeAndCommit(
    publicSource,
    {
      '.gitignore': gitignore,
      'package.json': '{"name":"synthetic-public","version":"1.0.0"}\n',
      'src/index.ts': 'export const version = "1.0.0";\n',
      'docs/tutorial.py': `from acme import Client\n\nclient = Client(api_key="${placeholder}")\n`,
    },
    'synthetic public source',
  );

  const scratch = mkdtempSync(join(tmpdir(), 'cejel-v24-rehearsal-'));
  const options = { checkoutRoot: join(scratch, 'checkouts'), privateAlfredSource: privateSource };
  mkdirSync(options.checkoutRoot);
  const entries = [
    { name: 'synthetic-public', visibility: 'public', commit: publicCommit },
    { name: 'alfred', visibility: 'private' },
  ];
  const rows = measureRows(entries, {
    options,
    alfredCommit: privateCommit,
    prepare: (entry) => {
      const target = join(options.checkoutRoot, entry.name);
      if (entry.visibility === 'private') {
        // The production private acquisition, exactly as the corpus run uses it.
        preparePrivateCheckout(options.privateAlfredSource, target, privateCommit);
      } else {
        // The public https fetch cannot run offline; a local clone stands in for it here.
        sh(scratch, 'clone', '--quiet', '--no-checkout', publicSource, target);
        sh(target, 'checkout', '--quiet', '--detach', entry.commit);
      }
      return { path: target, commit: sh(target, 'rev-parse', 'HEAD'), tree: sh(target, 'rev-parse', 'HEAD^{tree}') };
    },
    score: (entry, checkout) => scoreEntry(entry, checkout, scoreRepoWithPublicCejel, '2026-10-01T00:00:00.000Z'),
  });

  assert.deepEqual(rows.map((row) => row.error ?? 'ok'), ['ok', 'ok']);
  const alfredRow = rows.find((row) => row.name === 'alfred');
  assert.equal(alfredRow.sourceCommit, privateCommit, 'detached at the pinned commit, not the source HEAD');
  for (const row of rows) {
    assert.equal(row.baseline.report.rubricVersion, BASELINE_RUBRIC);
    assert.equal(row.candidate.report.rubricVersion, CANDIDATE_RUBRIC);
    assert.equal(row.nonA2CriteriaByteIdentical, row.nonA2ChangedCriteria.length === 0);
  }
  const result = buildResult(rows, { ...BINDINGS, privateAlfredCommit: privateCommit });
  assertPrivateRowsPathFree(rows, result);
  const json = canonicalJson(result);
  const markdown = renderMarkdown(result);
  for (const bytes of [json, markdown]) {
    assert.ok(!bytes.includes('zz-private-marker-7f3e'));
    assert.ok(!bytes.includes(privateSource));
    assert.ok(!bytes.includes(options.checkoutRoot));
  }
  assert.equal(markdown.match(/^\| (synthetic-public|alfred) \|/gm)?.length, 2);
});
