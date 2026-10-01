import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// One-shot paired rescore for
// docs/experiments/a2-secret-posture-content-context-v24-2026-09-15/preregistration.md.
// Modelled on scripts/b4-commit-year-v19-paired-rescore.mjs. The private-row acquisition is the
// corrected one from scripts/b4-commit-year-v19-alfred-recovery.mjs: the v19 first run failed on
// that row because it requested `clone --local` under `protocol.file.allow=never`.
// There is no rerun mode. A row that fails is preserved as an error row and is never retried.

export const PREREGISTRATION_COMMIT = 'ef253a8e64e70e27c9c440bc5b3cf02167c81a4e';
export const BASELINE_RUBRIC = 'witan-rubric-v22-prospective-2026-08-10';
export const CANDIDATE_RUBRIC = 'witan-rubric-v24-prospective-2026-09-15';
// The preregistration freezes "the corpus frozen for the v19 protocol — same blob, same 24
// entries". The corpus file records no commit for the private row. The only Alfred commit ever
// frozen against this blob for a paired rescore is the v19 protocol's, so it is reused here. That
// choice is the operator's to confirm before the run; see the PR that introduced this file.
export const ALFRED_COMMIT = 'be2b4325a317fdfaafb68abf9c920a7d6242a830';
const CORPUS_BLOB = 'd563653c6f1d7ee733693c0e9612fa52c323b162';
const CORPUS_SHA256 = 'dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00';
const CORPUS_ROWS = 24;
export const PUBLIC_FETCH_DEPTH = 1;
const TARGET_CRITERION = 'A2';
export const HAND_REVIEW_STATUS = 'awaiting operator hand review';
const SOURCE_PATHS = [
  'src/witan/content-reads.ts',
  'src/witan/git-exec.ts',
  'src/witan/public-scan.ts',
  'src/witan/repo-signals.ts',
  'src/witan/rubric-version.ts',
  'src/witan/rubric.ts',
  'src/witan/schemas.ts',
  'src/witan/scoring.ts',
  'src/witan/__tests__/fixtures/behaviour-corpus.ts',
  'scripts/a2-v24-paired-rescore.mjs',
];
const PUBLISHER_OWNED = new Set(['alfred', 'cejel']);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase().startsWith('GIT_')) delete environment[key];
  }
  return {
    ...environment,
    LC_ALL: 'C',
    LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'true',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
  };
}

// Every transport is refused by default. Exactly two call sites widen it: the public fetch
// (https only) and the single local clone of the operator-supplied private source (file only).
const SAFE_GIT_ARGUMENTS = [
  '--no-pager',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.pager=',
  '-c',
  'core.editor=false',
  '-c',
  'core.sshCommand=false',
  '-c',
  'diff.external=false',
  '-c',
  'credential.helper=',
  '-c',
  'log.showSignature=false',
  '-c',
  'gpg.program=false',
  '-c',
  'gpg.openpgp.program=false',
  '-c',
  'gpg.x509.program=false',
  '-c',
  'gpg.ssh.program=false',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.file.allow=never',
  '-c',
  'protocol.ext.allow=never',
  '-c',
  'protocol.git.allow=never',
  '-c',
  'protocol.http.allow=never',
  '-c',
  'protocol.https.allow=never',
  '-c',
  'protocol.ssh.allow=never',
];

export function hardenedGitArguments(
  argv,
  { allowFixedLocalClone = false, allowPublicHttpsFetch = false } = {},
) {
  const overrides = [
    ...(allowFixedLocalClone ? ['-c', 'protocol.file.allow=always'] : []),
    ...(allowPublicHttpsFetch ? ['-c', 'protocol.https.allow=always'] : []),
  ];
  return [...SAFE_GIT_ARGUMENTS, ...overrides, ...argv];
}

function git(argv, cwd = ROOT, transport = {}) {
  return execFileSync('git', hardenedGitArguments(argv, transport), {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment(),
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
  }).trim();
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`invalid_argument:${key ?? ''}`);
    if (values.has(key)) throw new Error(`duplicate_argument:${key}`);
    values.set(key, value);
  }
  for (const key of ['--checkout-root', '--private-alfred-source', '--json', '--markdown']) {
    if (!values.has(key)) throw new Error(`missing_argument:${key}`);
  }
  return {
    checkoutRoot: resolve(values.get('--checkout-root')),
    privateAlfredSource: resolve(values.get('--private-alfred-source')),
    jsonPath: resolve(values.get('--json')),
    markdownPath: resolve(values.get('--markdown')),
  };
}

export function assertStrictPreregistrationAncestry({
  root = ROOT,
  preregistrationCommit = PREREGISTRATION_COMMIT,
} = {}) {
  const executionCommit = git(['rev-parse', 'HEAD'], root);
  if (executionCommit === preregistrationCommit) {
    throw new Error('execution_commit_is_not_a_strict_descendant');
  }
  try {
    git(['merge-base', '--is-ancestor', preregistrationCommit, executionCommit], root);
  } catch {
    throw new Error('preregistration_commit_is_not_an_ancestor');
  }
  const trackedChanges = git(['status', '--porcelain', '--untracked-files=no'], root);
  if (trackedChanges !== '') throw new Error('tracked_worktree_is_not_clean');
  return executionCommit;
}

// "fixed generatedAt: the date this protocol's execution commit is authored".
export function executionGeneratedAt(executionCommit, root = ROOT) {
  const authoredDate = git(['show', '-s', '--format=%as', executionCommit], root);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(authoredDate)) throw new Error('execution_commit_date_unreadable');
  return `${authoredDate}T00:00:00.000Z`;
}

function sourceBindings(executionCommit) {
  return Object.fromEntries(
    SOURCE_PATHS.map((path) => {
      const bytes = readFileSync(join(ROOT, path));
      const committedBlob = git(['rev-parse', `${executionCommit}:${path}`]);
      const workingBlob = git(['hash-object', path]);
      if (committedBlob !== workingBlob) throw new Error(`source_not_bound_to_execution_commit:${path}`);
      return [path, { gitBlob: committedBlob, sha256: sha256(bytes) }];
    }),
  );
}

function assertFrozenCorpusBindings(executionCommit, corpusBytes) {
  const corpusBlob = git(['rev-parse', `${executionCommit}:leaderboard/corpus.json`]);
  if (corpusBlob !== CORPUS_BLOB) throw new Error(`corpus_blob_mismatch:${corpusBlob}`);
  if (sha256(corpusBytes) !== CORPUS_SHA256) throw new Error('corpus_sha256_mismatch');
}

function preparePublicCheckout(entry, target) {
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(entry.url ?? '')) {
    throw new Error('unapproved_public_source_url');
  }
  mkdirSync(target);
  git(['init', '--quiet'], target);
  git(['remote', 'add', 'origin', entry.url], target);
  git(
    ['fetch', '--quiet', `--depth=${PUBLIC_FETCH_DEPTH}`, 'origin', entry.commit],
    target,
    { allowPublicHttpsFetch: true },
  );
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], target);
}

export function preparePrivateCheckout(source, target, commit = ALFRED_COMMIT) {
  if (!existsSync(source)) throw new Error('private_source_unavailable');
  git(['clone', '--quiet', '--local', '--no-hardlinks', '--no-checkout', source, target], ROOT, {
    allowFixedLocalClone: true,
  });
  git(['checkout', '--quiet', '--detach', commit], target);
}

export function prepareCheckout(entry, options, { alfredCommit = ALFRED_COMMIT } = {}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.name)) throw new Error('unsafe_corpus_name');
  const target = join(options.checkoutRoot, entry.name);
  if (existsSync(target)) throw new Error('checkout_target_already_exists');
  if (entry.visibility === 'private') {
    preparePrivateCheckout(options.privateAlfredSource, target, alfredCommit);
  } else {
    preparePublicCheckout(entry, target);
  }
  const actualCommit = git(['rev-parse', 'HEAD'], target);
  const expectedCommit = entry.visibility === 'private' ? alfredCommit : entry.commit;
  if (actualCommit !== expectedCommit) throw new Error(`source_commit_mismatch:${actualCommit}`);
  return {
    path: target,
    commit: actualCommit,
    tree: git(['rev-parse', 'HEAD^{tree}'], target),
  };
}

function targetCriterion(report) {
  return report.criteria.find((criterion) => criterion.id === TARGET_CRITERION) ?? null;
}

function nonA2Criteria(report) {
  return report.criteria.filter((criterion) => criterion.id !== TARGET_CRITERION);
}

// The ids of every non-A2 criterion whose bytes differ between the arms. Criteria carry no
// report-level rubric identifier or generation time, so comparing them whole is the
// preregistered "byte-identical after excluding the report-level rubric identifier and
// generation timestamp".
export function changedNonA2Criteria(baselineReport, candidateReport) {
  const ids = [
    ...new Set([...nonA2Criteria(baselineReport), ...nonA2Criteria(candidateReport)].map(({ id }) => id)),
  ];
  return ids.filter((id) => {
    const left = baselineReport.criteria.find((criterion) => criterion.id === id) ?? null;
    const right = candidateReport.criteria.find((criterion) => criterion.id === id) ?? null;
    return canonicalJson(left) !== canonicalJson(right);
  });
}

function findingClass(finding) {
  if (/ambiguous content context/i.test(finding.summary)) return 'abstain';
  if (finding.severity === 'critical') return 'flag';
  return 'note';
}

function secretScanFindings(report) {
  return (targetCriterion(report)?.findings ?? []).filter(
    (finding) => finding.evidence?.kind === 'secret_scan',
  );
}

// flag / abstain / no-finding, as the preregistration names them. `note` findings (an `info`
// test-path match or a committed .env with no matched value) are counted but are not a flag.
export function secretScanKind(findings) {
  const classes = new Set(findings.map(findingClass));
  if (classes.has('flag') && classes.has('abstain')) return 'flag+abstain';
  if (classes.has('flag')) return 'flag';
  if (classes.has('abstain')) return 'abstain';
  return 'no-finding';
}

function criticalSecretFindings(report) {
  return secretScanFindings(report).filter((finding) => finding.severity === 'critical');
}

function findingKey(finding) {
  return canonicalJson({ summary: finding.summary, evidence: finding.evidence });
}

export function criticalSecretDelta(baselineReport, candidateReport) {
  const baseline = criticalSecretFindings(baselineReport);
  const candidate = criticalSecretFindings(candidateReport);
  const baselineKeys = new Set(baseline.map(findingKey));
  const candidateKeys = new Set(candidate.map(findingKey));
  return {
    added: candidate.filter((finding) => !baselineKeys.has(findingKey(finding))),
    lost: baseline.filter((finding) => !candidateKeys.has(findingKey(finding))),
  };
}

function computeCoverage(report) {
  const byCategory = [];
  let measured = 0;
  for (const criterion of report.criteria) {
    let bucket = byCategory.find((entry) => entry.category === criterion.category);
    if (!bucket) {
      bucket = { category: criterion.category, measured: 0, total: 0 };
      byCategory.push(bucket);
    }
    bucket.total += 1;
    if (criterion.status !== 'not_applicable' && criterion.status !== 'insufficient_data') {
      bucket.measured += 1;
      measured += 1;
    }
  }
  const overall = { measured, total: report.criteria.length };
  const lowConfidence = [...byCategory, overall].some(
    ({ measured: count, total }) => total > 0 && count / total < 0.5,
  );
  return { byCategory, overall, lowConfidence };
}

function comparableScore(report) {
  const scores = report.criteria
    .filter(
      (criterion) =>
        criterion.id !== 'B1' &&
        criterion.id !== 'B5' &&
        criterion.status !== 'not_applicable' &&
        criterion.status !== 'insufficient_data',
    )
    .map((criterion) => criterion.score);
  return scores.length === 0
    ? null
    : Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10;
}

function publicFinding(finding) {
  return {
    class: findingClass(finding),
    severity: finding.severity,
    summary: finding.summary,
    path: finding.evidence.path ?? null,
    line: finding.evidence.line ?? null,
    contentHash: finding.evidence.contentHash ?? null,
  };
}

// The private row keeps the finding, its class, severity, line and content hash. Its location and
// any prose that can quote a location are withheld.
function privateFinding(finding) {
  return {
    class: findingClass(finding),
    severity: finding.severity,
    path: null,
    pathWithheld: true,
    line: finding.evidence.line ?? null,
    contentHash: finding.evidence.contentHash ?? null,
  };
}

export function summarizeReport(report, visibility) {
  const isPrivate = visibility === 'private';
  const a2 = targetCriterion(report);
  const findings = secretScanFindings(report);
  const normalizedReport = isPrivate
    ? { ...report, repo: { visibility: 'private', headSha: report.repo?.headSha } }
    : report;
  const limitations = report.scanLimitations ?? [];
  return {
    reportSha256: sha256(canonicalJson(normalizedReport)),
    rubricVersion: report.rubricVersion,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    verdict: report.verdict,
    coverage: computeCoverage(report),
    a2: a2
      ? {
          score: a2.score,
          status: a2.status,
          metrics: isPrivate
            ? (a2.metrics ?? []).map(({ name, value, max }) => ({ name, value, max: max ?? null }))
            : a2.metrics ?? [],
          secretScan: {
            count: findings.length,
            kind: secretScanKind(findings),
            findings: findings.map(isPrivate ? privateFinding : publicFinding),
          },
        }
      : null,
    scanLimitations: isPrivate
      ? { withheld: true, count: limitations.length, sha256: limitations.map((entry) => sha256(entry)) }
      : limitations,
  };
}

export function assignPlacements(scoredRows, arm) {
  const rankable = scoredRows
    .filter(
      (row) =>
        !PUBLISHER_OWNED.has(row.name) &&
        row[arm].report.overallScore !== null &&
        !row[arm].summary.coverage.lowConfidence,
    )
    .sort((left, right) => {
      const scoreDelta = right[arm].comparableScore - left[arm].comparableScore;
      return scoreDelta === 0 ? left.name.localeCompare(right.name) : scoreDelta;
    });
  const rank = new Map(rankable.map((row, index) => [row.name, index + 1]));
  for (const row of scoredRows) {
    const report = row[arm].report;
    row[arm].summary.placement = PUBLISHER_OWNED.has(row.name)
      ? 'transparency'
      : report.overallScore === null
        ? 'unrated'
        : row[arm].summary.coverage.lowConfidence
          ? 'unranked'
          : String(rank.get(row.name));
  }
}

export function scoreEntry(entry, checkout, scoreRepoWithPublicCejel, generatedAt) {
  const common = {
    repoPath: checkout.path,
    productSlug: entry.name,
    productDisplayName: entry.name,
    generatedAt,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  };
  const baselineReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: BASELINE_RUBRIC });
  const candidateReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: CANDIDATE_RUBRIC });
  const changedCriteria = changedNonA2Criteria(baselineReport, candidateReport);
  return {
    baseline: {
      report: baselineReport,
      summary: summarizeReport(baselineReport, entry.visibility),
      comparableScore: comparableScore(baselineReport),
    },
    candidate: {
      report: candidateReport,
      summary: summarizeReport(candidateReport, entry.visibility),
      comparableScore: comparableScore(candidateReport),
    },
    nonA2CriteriaByteIdentical: changedCriteria.length === 0,
    nonA2ChangedCriteria: changedCriteria,
    criticalSecretDelta: criticalSecretDelta(baselineReport, candidateReport),
  };
}

export function sanitizeError(error, options) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(options.checkoutRoot, '[checkout-root]')
    .replaceAll(options.privateAlfredSource, '[private-source]');
}

// One attempt per row, in corpus order. A failure is recorded as an error row; there is no
// second attempt, no alternative commit and no rerun mode.
export function measureRows(entries, { prepare, score, options, alfredCommit = ALFRED_COMMIT }) {
  const rows = [];
  for (const [corpusIndex, entry] of entries.entries()) {
    process.stdout.write(`${entry.name}: resolving pinned source\n`);
    try {
      const checkout = prepare(entry);
      const scored = score(entry, checkout);
      rows.push({
        name: entry.name,
        visibility: entry.visibility,
        corpusIndex,
        sourceCommit: checkout.commit,
        sourceTree: checkout.tree,
        ...scored,
      });
    } catch (error) {
      const message = sanitizeError(error, options);
      rows.push({
        name: entry.name,
        visibility: entry.visibility,
        corpusIndex,
        expectedSourceCommit: entry.visibility === 'private' ? alfredCommit : entry.commit,
        error:
          entry.visibility === 'private'
            ? { code: message.split(/[:\s]/)[0] || 'error', sha256: sha256(message), detailWithheld: true }
            : message,
      });
    }
  }
  return rows;
}

function changed(left, right) {
  return canonicalJson(left) !== canonicalJson(right);
}

// Every band from "Prediction and decision rule". The decision is computed, never asserted: two
// bands can only be settled by the operator's hand review, so the GO/NO-GO line stays empty here.
export function buildDecision(rows) {
  const successful = rows.filter((row) => !row.error);
  const names = (list) => list.map((row) => row.name);
  const nonA2 = successful.filter((row) => !row.nonA2CriteriaByteIdentical);
  const a2 = successful.filter((row) => {
    const left = row.baseline.summary.a2;
    const right = row.candidate.summary.a2;
    return (
      left?.score !== right?.score ||
      left?.status !== right?.status ||
      left?.secretScan.count !== right?.secretScan.count ||
      left?.secretScan.kind !== right?.secretScan.kind
    );
  });
  const headline = successful.filter((row) =>
    ['overallScore', 'codeTrustScore', 'processTrustScore'].some((field) =>
      changed(row.baseline.summary[field], row.candidate.summary[field]),
    ),
  );
  const placement = successful.filter(
    (row) => row.baseline.summary.placement !== row.candidate.summary.placement,
  );
  const verdict = successful.filter(
    (row) => row.baseline.summary.verdict !== row.candidate.summary.verdict,
  );
  const coverage = successful.filter((row) =>
    changed(row.baseline.summary.coverage, row.candidate.summary.coverage),
  );
  const newCriticals = successful.filter((row) => row.criticalSecretDelta.added.length > 0);
  const lostCriticals = successful.filter((row) => row.criticalSecretDelta.lost.length > 0);
  const errors = rows.length - successful.length;

  const band = (id, rule, measuredRows, limit) => ({
    id,
    rule,
    measured: measuredRows.length,
    limit,
    withinLimit: measuredRows.length <= limit,
    dependsOnHandReview: false,
    rows: names(measuredRows),
  });
  // A hand-review band's measured count is an upper bound until review: every row listed holds a
  // candidate the operator must judge. With no candidates the band is settled at zero.
  const reviewBand = (id, rule, candidateRows) => ({
    id,
    rule,
    measured: candidateRows.length === 0 ? 0 : null,
    upperBound: candidateRows.length,
    limit: 0,
    withinLimit: candidateRows.length === 0 ? true : null,
    dependsOnHandReview: candidateRows.length > 0,
    rows: names(candidateRows),
  });
  const bands = [
    {
      id: 'completion',
      rule: `all ${CORPUS_ROWS} rows complete with no error row`,
      measured: successful.length,
      limit: CORPUS_ROWS,
      withinLimit: rows.length === CORPUS_ROWS && successful.length === CORPUS_ROWS && errors === 0,
      dependsOnHandReview: false,
      rows: names(rows.filter((row) => row.error)),
    },
    band('nonA2CriterionChanges', 'rows changing any criterion other than A2 (implementation failure)', nonA2, 0),
    reviewBand(
      'newCriticalFalseAssertions',
      'rows gaining a new critical committed-secret finding that is not a genuine committed credential',
      newCriticals,
    ),
    band('a2Changes', 'rows changing A2 score, status, or secret_scan finding count/kind', a2, 8),
    band('headlineScoreChanges', 'rows changing overall, code-trust or process-trust score', headline, 4),
    band('placementChanges', 'rows changing comparative board placement', placement, 2),
    band('verdictChanges', 'rows changing verdict', verdict, 1),
    reviewBand(
      'lostConfirmedTruePositives',
      'rows losing a committed-secret finding v22 reported that hand review confirms is genuine',
      lostCriticals,
    ),
  ];
  const mechanical = bands.filter((entry) => !entry.dependsOnHandReview);
  return {
    protocolDecision: null,
    protocolDecisionStatus: HAND_REVIEW_STATUS,
    mechanicalBandsWithinLimits: mechanical.every((entry) => entry.withinLimit === true),
    handReviewPending: bands.some((entry) => entry.dependsOnHandReview),
    counts: {
      rows: rows.length,
      completed: successful.length,
      errors,
      retriedRows: 0,
      coverageChanges: coverage.length,
    },
    bands,
    informational: { coverageChanges: names(coverage) },
  };
}

function criticalEntries(rows, field) {
  return rows
    .filter((row) => !row.error)
    .flatMap((row) =>
      row.criticalSecretDelta[field].map((finding) => ({
        row: row.name,
        visibility: row.visibility,
        ...(row.visibility === 'private' ? privateFinding(finding) : publicFinding(finding)),
        handReview: HAND_REVIEW_STATUS,
        handReviewOutcome: null,
      })),
    );
}

export function projectRows(internalRows) {
  return internalRows.map((row) =>
    row.error
      ? {
          name: row.name,
          visibility: row.visibility,
          expectedSourceCommit: row.expectedSourceCommit,
          error: row.error,
        }
      : {
          name: row.name,
          visibility: row.visibility,
          sourceCommit: row.sourceCommit,
          sourceTree: row.sourceTree,
          baseline: row.baseline.summary,
          candidate: row.candidate.summary,
          nonA2CriteriaByteIdentical: row.nonA2CriteriaByteIdentical,
          nonA2ChangedCriteria: row.nonA2ChangedCriteria,
          nonA2CriteriaSha256: {
            baseline: sha256(canonicalJson(nonA2Criteria(row.baseline.report))),
            candidate: sha256(canonicalJson(nonA2Criteria(row.candidate.report))),
          },
        },
  );
}

export function buildResult(internalRows, bindings) {
  const successful = internalRows.filter((row) => !row.error);
  assignPlacements(successful, 'baseline');
  assignPlacements(successful, 'candidate');
  return {
    schemaVersion: 'cejel-a2-v24-paired-rescore-v1',
    bindings,
    protocol: {
      sealedPublicScoring: true,
      explicitIngest: false,
      autoDiscoveredIngest: false,
      repositoryCodeExecuted: false,
      privateSourcePathsPublished: false,
      retriedRows: 0,
      acquisition: {
        public: `git fetch --depth=${PUBLIC_FETCH_DEPTH} of the corpus-pinned commit over https, detached checkout`,
        publicFetchDepth: PUBLIC_FETCH_DEPTH,
        private: 'git clone --local --no-hardlinks --no-checkout of the operator-supplied source, detached checkout of the pinned commit',
      },
    },
    decision: buildDecision(internalRows),
    newCriticalSecretFindings: criticalEntries(internalRows, 'added'),
    lostCriticalSecretFindings: criticalEntries(internalRows, 'lost'),
    rows: projectRows(internalRows),
  };
}

function collectPaths(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectPaths(entry, found);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'path' && typeof entry === 'string' && entry !== '') found.add(entry);
      else collectPaths(entry, found);
    }
  }
  return found;
}

function collectStrings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, found);
  else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStrings(entry, found);
  }
  return found;
}

// Every repository-relative path either private report carries, checked against every string the
// published private-row material contains. The projection already withholds them; this proves it.
// A bare top-level name with no separator or extension (`LICENSE`) is too generic to identify
// anything and could collide with a fixed vocabulary word, so only paths with a `/` or `.` count.
export function assertPrivateRowsPathFree(internalRows, result) {
  for (const row of internalRows.filter((entry) => entry.visibility === 'private' && !entry.error)) {
    const privatePaths = [
      ...collectPaths(row.baseline.report),
      ...collectPaths(row.candidate.report),
    ];
    const published = collectStrings([
      result.rows.filter((entry) => entry.name === row.name),
      result.newCriticalSecretFindings.filter((entry) => entry.row === row.name),
      result.lostCriticalSecretFindings.filter((entry) => entry.row === row.name),
    ]);
    for (const path of privatePaths.filter((entry) => entry.includes('/') || entry.includes('.'))) {
      if (published.some((value) => value === path || (path.includes('/') && value.includes(path)))) {
        throw new Error(`private_path_emitted:${row.name}`);
      }
    }
  }
}

function assertNoOperatorPaths(outputs, options) {
  for (const [name, bytes] of Object.entries(outputs)) {
    if (bytes.includes(options.privateAlfredSource) || bytes.includes(options.checkoutRoot)) {
      throw new Error(`private_path_emitted:${name}`);
    }
  }
}

function cell(value) {
  return value === null || value === undefined ? 'scoreless' : String(value);
}

function coverageCell(coverage) {
  return coverage.byCategory.map((entry) => `${entry.category} ${entry.measured}/${entry.total}`).join('; ');
}

function a2Cell(summary) {
  return summary.a2 ? `${summary.a2.score}/${summary.a2.status}` : 'absent';
}

function secretCell(summary) {
  return summary.a2 ? `${summary.a2.secretScan.count} ${summary.a2.secretScan.kind}` : 'absent';
}

function findingLine(entry) {
  const location = entry.pathWithheld
    ? `path withheld (private row), line ${cell(entry.line)}`
    : `\`${entry.path}\`:${cell(entry.line)}`;
  return `- ${entry.row}: ${location}; class ${entry.class}; content hash \`${cell(entry.contentHash)}\` — **${entry.handReview}**`;
}

export function renderMarkdown(result) {
  const { decision } = result;
  const lines = [
    '# A2 secret-posture content-context rubric v24 paired rescore — result',
    '',
    'Protocol decision: ________ (left blank by the harness: recorded by the operator after the hand review of every new and lost critical below)',
    '',
    `- Mechanical bands all within preregistered limits: ${decision.mechanicalBandsWithinLimits ? 'yes' : 'NO'}`,
    `- Hand review pending: ${decision.handReviewPending ? 'yes' : 'no'}`,
    `- Preregistration commit: \`${result.bindings.preregistrationCommit}\``,
    `- Execution commit: \`${result.bindings.executionCommit}\``,
    `- Baseline rubric: \`${result.bindings.baselineRubric}\`; candidate rubric: \`${result.bindings.candidateRubric}\``,
    `- Fixed generatedAt: \`${result.bindings.generatedAt}\``,
    `- Corpus: blob \`${result.bindings.corpus.gitBlob}\`, SHA-256 \`${result.bindings.corpus.sha256}\``,
    `- Private row commit: \`${result.bindings.privateAlfredCommit}\``,
    `- Acquisition: ${result.protocol.acquisition.public}; ${result.protocol.acquisition.private}`,
    `- Completed rows: ${decision.counts.completed}/${decision.counts.rows}; errors: ${decision.counts.errors}; retried rows: ${decision.counts.retriedRows}`,
    '',
    'The public default remains `witan-rubric-v17-2026-07-24`. This result neither promotes v24 nor rewrites any historical report.',
    '',
    '| Band | Measured | Preregistered limit | Within limit |',
    '|---|---:|---:|---|',
  ];
  for (const entry of decision.bands) {
    const measured =
      entry.measured === null ? `≤ ${entry.upperBound} (${HAND_REVIEW_STATUS})` : String(entry.measured);
    const within =
      entry.withinLimit === null ? HAND_REVIEW_STATUS : entry.withinLimit ? 'yes' : 'NO';
    const limit = entry.id === 'completion' ? `${entry.limit} of ${entry.limit}` : `≤ ${entry.limit}`;
    lines.push(`| ${entry.rule} | ${measured} | ${limit} | ${within} |`);
  }
  lines.push(
    '',
    '| Repository | A2 score/status | secret_scan count/kind | Overall | Code | Process | Verdict | Coverage | Placement | Non-A2 |',
    '|---|---|---|---:|---:|---:|---|---|---|---|',
  );
  for (const row of result.rows) {
    if (row.error) {
      const error = typeof row.error === 'string' ? row.error : `${row.error.code} (detail withheld)`;
      lines.push(`| ${row.name} | error: ${error.replaceAll('|', '\\|').replaceAll('\n', ' ')} | error | error | error | error | error | error | error | error |`);
      continue;
    }
    const { baseline: left, candidate: right } = row;
    lines.push(
      `| ${row.name} | ${a2Cell(left)} to ${a2Cell(right)} | ${secretCell(left)} to ${secretCell(right)} | ${cell(left.overallScore)} to ${cell(right.overallScore)} | ${cell(left.codeTrustScore)} to ${cell(right.codeTrustScore)} | ${cell(left.processTrustScore)} to ${cell(right.processTrustScore)} | ${left.verdict} to ${right.verdict} | ${coverageCell(left.coverage)} to ${coverageCell(right.coverage)} | ${left.placement} to ${right.placement} | ${row.nonA2CriteriaByteIdentical ? 'identical' : `CHANGED (${row.nonA2ChangedCriteria.join(', ')}): implementation failure`} |`,
    );
  }
  lines.push('', '## New critical committed-secret findings (v24 only)', '');
  if (result.newCriticalSecretFindings.length === 0) lines.push('None.');
  for (const entry of result.newCriticalSecretFindings) lines.push(findingLine(entry));
  lines.push('', '## Critical committed-secret findings v22 reported and v24 does not', '');
  if (result.lostCriticalSecretFindings.length === 0) lines.push('None.');
  for (const entry of result.lostCriticalSecretFindings) lines.push(findingLine(entry));
  lines.push('', 'Source bindings:', '');
  for (const [path, binding] of Object.entries(result.bindings.candidateSources)) {
    lines.push(`- \`${path}\`: blob \`${binding.gitBlob}\`; SHA-256 \`${binding.sha256}\``);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

// Refuses before any corpus source is read when the two arms already disagree outside A2 on the
// committed synthetic behaviour corpus. Under the preregistration such a change is an
// implementation failure, and spending the one paired run to rediscover it would forfeit it.
export function syntheticParityPreflight({ fixtures, headShas, build, headSha, score, generatedAt }) {
  const divergent = [];
  for (const fixture of fixtures) {
    const dir = build(fixture);
    if (headSha(dir) !== headShas[fixture.name]) {
      throw new Error(`preflight_fixture_not_reproducible:${fixture.name}`);
    }
    const common = {
      repoPath: dir,
      productSlug: fixture.name,
      productDisplayName: fixture.name,
      generatedAt,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    };
    const changedCriteria = changedNonA2Criteria(
      score({ ...common, rubricVersion: BASELINE_RUBRIC }),
      score({ ...common, rubricVersion: CANDIDATE_RUBRIC }),
    );
    if (changedCriteria.length > 0) divergent.push(`${fixture.name}[${changedCriteria.join(',')}]`);
  }
  if (divergent.length > 0) {
    throw new Error(`preflight_non_a2_divergence:${divergent.join(';')}`);
  }
  return { fixtures: fixtures.length, nonA2CriteriaIdentical: true };
}

async function loadScoringModules() {
  // Plain `node` cannot load the TypeScript sources; register the repository-pinned tsx loader.
  const { register } = await import('tsx/esm/api');
  register();
  const { scoreRepoWithPublicCejel } = await import('../src/witan/index.ts');
  const corpus = await import('../src/witan/__tests__/fixtures/behaviour-corpus.ts');
  return { scoreRepoWithPublicCejel, corpus };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  try {
    // This ancestry proof intentionally precedes the first read of corpus.json and every source
    // checkout. The hard-coded anchor is the immutable merged preregistration commit.
    const executionCommit = assertStrictPreregistrationAncestry();
    const generatedAt = executionGeneratedAt(executionCommit);
    const candidateSources = sourceBindings(executionCommit);
    if (existsSync(options.checkoutRoot)) throw new Error('checkout_root_must_not_exist');

    const { scoreRepoWithPublicCejel, corpus: behaviour } = await loadScoringModules();
    const preflight = syntheticParityPreflight({
      fixtures: behaviour.BEHAVIOUR_CORPUS,
      headShas: behaviour.BEHAVIOUR_CORPUS_HEAD_SHAS,
      build: behaviour.buildBehaviourFixture,
      headSha: behaviour.fixtureHeadSha,
      score: scoreRepoWithPublicCejel,
      generatedAt,
    });

    const corpusBytes = readFileSync(join(ROOT, 'leaderboard/corpus.json'));
    assertFrozenCorpusBindings(executionCommit, corpusBytes);
    const corpus = JSON.parse(corpusBytes.toString('utf8'));
    if (!Array.isArray(corpus.entries) || corpus.entries.length !== CORPUS_ROWS) {
      throw new Error(`corpus_denominator_mismatch:${corpus.entries?.length ?? 'missing'}`);
    }
    mkdirSync(options.checkoutRoot, { recursive: false });

    const internalRows = measureRows(corpus.entries, {
      prepare: (entry) => prepareCheckout(entry, options),
      score: (entry, checkout) => scoreEntry(entry, checkout, scoreRepoWithPublicCejel, generatedAt),
      options,
    });
    const result = buildResult(internalRows, {
      preregistrationCommit: PREREGISTRATION_COMMIT,
      executionCommit,
      baselineRubric: BASELINE_RUBRIC,
      candidateRubric: CANDIDATE_RUBRIC,
      generatedAt,
      corpus: { gitBlob: CORPUS_BLOB, sha256: CORPUS_SHA256, rows: CORPUS_ROWS },
      privateAlfredCommit: ALFRED_COMMIT,
      candidateSources,
      syntheticParityPreflight: preflight,
    });
    assertPrivateRowsPathFree(internalRows, result);
    const outputs = { json: canonicalJson(result), markdown: renderMarkdown(result) };
    assertNoOperatorPaths(outputs, options);
    mkdirSync(dirname(options.jsonPath), { recursive: true });
    mkdirSync(dirname(options.markdownPath), { recursive: true });
    writeFileSync(options.jsonPath, outputs.json, 'utf8');
    writeFileSync(options.markdownPath, outputs.markdown, 'utf8');
    process.stdout.write(
      `decision=${HAND_REVIEW_STATUS} mechanicalBandsWithinLimits=${result.decision.mechanicalBandsWithinLimits} json=${options.jsonPath} markdown=${options.markdownPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`Cejel v24 paired rescore refused or failed: ${sanitizeError(error, options)}\n`);
    process.exitCode = 1;
  }
}

// realpath: invoked through a symlinked path (macOS /var -> /private/var) the plain comparison is
// false and the run would exit 0 having done nothing.
if (process.argv[1] && pathToFileURL(realpathSync(resolve(process.argv[1]))).href === import.meta.url) {
  await main();
}
