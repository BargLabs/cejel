import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const PREREGISTRATION_COMMIT = '9eefecbc1c7f83ec2ba795ea823a3edb43b12bf1';
const BASELINE_RUBRIC = 'witan-rubric-v18-prospective-2026-07-25';
const CANDIDATE_RUBRIC = 'witan-rubric-v19-prospective-2026-08-09';
const GENERATED_AT = '2026-08-09T00:00:00.000Z';
const ALFRED_COMMIT = 'be2b4325a317fdfaafb68abf9c920a7d6242a830';
const CORPUS_BLOB = 'd563653c6f1d7ee733693c0e9612fa52c323b162';
const CORPUS_SHA256 = 'dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00';
const REPORTS_TREE = '2658da4382b8219d3208902c050878890975ff85';
const SOURCE_PATHS = [
  'src/witan/git-exec.ts',
  'src/witan/public-scan.ts',
  'src/witan/repo-signals.ts',
  'src/witan/rubric-version.ts',
  'src/witan/scoring.ts',
  'scripts/b4-commit-year-v19-paired-rescore.mjs',
];
const PUBLISHER_OWNED = new Set(['alfred', 'cejel']);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sha256(value) {
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

function canonicalJson(value) {
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
  'protocol.https.allow=always',
  '-c',
  'protocol.file.allow=never',
  '-c',
  'protocol.ext.allow=never',
];

function git(argv, cwd = ROOT) {
  return execFileSync('git', [...SAFE_GIT_ARGUMENTS, ...argv], {
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

function assertStrictPreregistrationAncestry() {
  const executionCommit = git(['rev-parse', 'HEAD']);
  if (executionCommit === PREREGISTRATION_COMMIT) {
    throw new Error('execution_commit_is_not_a_strict_descendant');
  }
  try {
    git(['merge-base', '--is-ancestor', PREREGISTRATION_COMMIT, executionCommit]);
  } catch {
    throw new Error('preregistration_commit_is_not_an_ancestor');
  }
  const trackedChanges = git(['status', '--porcelain', '--untracked-files=no']);
  if (trackedChanges !== '') throw new Error('tracked_worktree_is_not_clean');
  return executionCommit;
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
  const reportsTree = git(['rev-parse', `${executionCommit}:leaderboard/reports`]);
  if (corpusBlob !== CORPUS_BLOB) throw new Error(`corpus_blob_mismatch:${corpusBlob}`);
  if (sha256(corpusBytes) !== CORPUS_SHA256) throw new Error('corpus_sha256_mismatch');
  if (reportsTree !== REPORTS_TREE) throw new Error(`reports_tree_mismatch:${reportsTree}`);
}

function preparePublicCheckout(entry, target) {
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(entry.url ?? '')) {
    throw new Error('unapproved_public_source_url');
  }
  mkdirSync(target);
  git(['init', '--quiet'], target);
  git(['remote', 'add', 'origin', entry.url], target);
  git(['fetch', '--quiet', '--depth=1', 'origin', entry.commit], target);
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], target);
}

function preparePrivateCheckout(source, target) {
  if (!existsSync(source)) throw new Error('private_source_unavailable');
  git(['clone', '--quiet', '--local', '--no-hardlinks', '--no-checkout', source, target], ROOT);
  git(['checkout', '--quiet', '--detach', ALFRED_COMMIT], target);
}

function prepareCheckout(entry, options) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.name)) throw new Error('unsafe_corpus_name');
  const target = join(options.checkoutRoot, entry.name);
  if (existsSync(target)) throw new Error('checkout_target_already_exists');
  if (entry.visibility === 'private') preparePrivateCheckout(options.privateAlfredSource, target);
  else preparePublicCheckout(entry, target);
  const actualCommit = git(['rev-parse', 'HEAD'], target);
  const expectedCommit = entry.visibility === 'private' ? ALFRED_COMMIT : entry.commit;
  if (actualCommit !== expectedCommit) throw new Error(`source_commit_mismatch:${actualCommit}`);
  return {
    path: target,
    commit: actualCommit,
    tree: git(['rev-parse', 'HEAD^{tree}'], target),
  };
}

function metric(report, name) {
  return report.criteria
    .find((criterion) => criterion.id === 'B4')
    ?.metrics.find((entry) => entry.name === name);
}

function summarizeReport(report, visibility) {
  const b4 = report.criteria.find((criterion) => criterion.id === 'B4');
  const coverage = computeCoverage(report);
  const normalizedReport = visibility === 'private'
    ? { ...report, repo: { visibility: 'private', headSha: report.repo.headSha } }
    : report;
  return {
    reportSha256: sha256(canonicalJson(normalizedReport)),
    rubricVersion: report.rubricVersion,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    verdict: report.verdict,
    coverage,
    b4: b4
      ? { score: b4.score, status: b4.status, metrics: b4.metrics }
      : null,
    scanLimitations: report.scanLimitations ?? [],
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

function stripNonB4Criteria(report) {
  return report.criteria.filter((criterion) => criterion.id !== 'B4');
}

function scoreEntry(entry, checkout, scoreRepoWithPublicCejel) {
  const common = {
    repoPath: checkout.path,
    productSlug: entry.name,
    productDisplayName: entry.name,
    generatedAt: GENERATED_AT,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  };
  const baselineReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: BASELINE_RUBRIC });
  const candidateReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: CANDIDATE_RUBRIC });
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
    nonB4CriteriaByteIdentical:
      canonicalJson(stripNonB4Criteria(baselineReport)) ===
      canonicalJson(stripNonB4Criteria(candidateReport)),
  };
}

function sanitizeError(error, options) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(options.checkoutRoot, '[checkout-root]')
    .replaceAll(options.privateAlfredSource, '[private-source]');
}

function changed(left, right) {
  return canonicalJson(left) !== canonicalJson(right);
}

export function buildDecision(rows) {
  const successful = rows.filter((row) => !row.error);
  const headlineChanges = successful.filter((row) =>
    [
      'overallScore',
      'codeTrustScore',
      'processTrustScore',
      'verdict',
      'coverage',
    ].some((field) => changed(row.baseline.summary[field], row.candidate.summary[field])),
  );
  const b4ScoreOrStatusChanges = successful.filter((row) =>
    ['score', 'status'].some(
      (field) => row.baseline.summary.b4?.[field] !== row.candidate.summary.b4?.[field],
    ),
  );
  const rawFreshnessChanges = successful.filter(
    (row) =>
      metric(row.baseline.report, 'audit_freshness_depth')?.value !==
      metric(row.candidate.report, 'audit_freshness_depth')?.value,
  );
  const placementChanges = successful.filter(
    (row) => row.baseline.summary.placement !== row.candidate.summary.placement,
  );
  const nonB4Changes = successful.filter((row) => !row.nonB4CriteriaByteIdentical);
  const counts = {
    rows: rows.length,
    completed: successful.length,
    errors: rows.length - successful.length,
    headlineChanges: headlineChanges.length,
    b4ScoreOrStatusChanges: b4ScoreOrStatusChanges.length,
    rawFreshnessChanges: rawFreshnessChanges.length,
    placementChanges: placementChanges.length,
    nonB4Changes: nonB4Changes.length,
  };
  return {
    protocolDecision:
      counts.rows === 24 &&
      counts.completed === 24 &&
      counts.errors === 0 &&
      counts.headlineChanges === 0 &&
      counts.b4ScoreOrStatusChanges === 0 &&
      counts.rawFreshnessChanges <= 3 &&
      counts.placementChanges === 0 &&
      counts.nonB4Changes === 0
        ? 'GO'
        : 'NO-GO',
    counts,
    changedRows: {
      headline: headlineChanges.map((row) => row.name),
      b4ScoreOrStatus: b4ScoreOrStatusChanges.map((row) => row.name),
      rawFreshness: rawFreshnessChanges.map((row) => row.name),
      placement: placementChanges.map((row) => row.name),
      nonB4: nonB4Changes.map((row) => row.name),
    },
  };
}

function cell(value) {
  return value === null ? 'scoreless' : String(value);
}

function coverageCell(coverage) {
  return coverage.byCategory.map((entry) => `${entry.category} ${entry.measured}/${entry.total}`).join('; ');
}

export function renderMarkdown(result) {
  const lines = [
    '# B4 commit-year rubric v19 paired rescore — result',
    '',
    `Protocol decision: **${result.decision.protocolDecision}**`,
    '',
    `- Preregistration commit: \`${result.bindings.preregistrationCommit}\``,
    `- Execution commit: \`${result.bindings.executionCommit}\``,
    `- Fixed generatedAt: \`${result.bindings.generatedAt}\``,
    `- Corpus: blob \`${result.bindings.corpus.gitBlob}\`, SHA-256 \`${result.bindings.corpus.sha256}\``,
    `- Completed rows: ${result.decision.counts.completed}/24; errors: ${result.decision.counts.errors}`,
    `- Raw freshness numerator changes: ${result.decision.counts.rawFreshnessChanges}/24`,
    `- B4 score/status changes: ${result.decision.counts.b4ScoreOrStatusChanges}/24`,
    `- Headline/coverage changes: ${result.decision.counts.headlineChanges}/24`,
    `- Placement changes: ${result.decision.counts.placementChanges}/24`,
    `- Non-B4 criterion changes: ${result.decision.counts.nonB4Changes}/24`,
    '',
    'The public default remains `witan-rubric-v17-2026-07-24`. This result neither promotes v19 nor rewrites any historical report.',
    '',
    '| Repository | B4 freshness | B4 score/status | Overall | Code | Process | Verdict | Coverage | Placement | Non-B4 |',
    '|---|---:|---|---:|---:|---:|---|---|---|---|',
  ];
  for (const row of result.rows) {
    if (row.error) {
      lines.push(`| ${row.name} | error | error | error | error | error | error | error | error | error |`);
      continue;
    }
    const baselineFreshness = row.baseline.b4?.metrics.find((entry) => entry.name === 'audit_freshness_depth')?.value;
    const candidateFreshness = row.candidate.b4?.metrics.find((entry) => entry.name === 'audit_freshness_depth')?.value;
    lines.push(
      `| ${row.name} | ${baselineFreshness} to ${candidateFreshness} | ${row.baseline.b4.score}/${row.baseline.b4.status} to ${row.candidate.b4.score}/${row.candidate.b4.status} | ${cell(row.baseline.overallScore)} to ${cell(row.candidate.overallScore)} | ${cell(row.baseline.codeTrustScore)} to ${cell(row.candidate.codeTrustScore)} | ${cell(row.baseline.processTrustScore)} to ${cell(row.candidate.processTrustScore)} | ${row.baseline.verdict} to ${row.candidate.verdict} | ${coverageCell(row.baseline.coverage)} to ${coverageCell(row.candidate.coverage)} | ${row.baseline.placement} to ${row.candidate.placement} | ${row.nonB4CriteriaByteIdentical ? 'identical' : 'CHANGED'} |`,
    );
  }
  lines.push('', 'Source bindings:', '');
  for (const [path, binding] of Object.entries(result.bindings.candidateSources)) {
    lines.push(`- \`${path}\`: blob \`${binding.gitBlob}\`; SHA-256 \`${binding.sha256}\``);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  // This ancestry proof intentionally precedes the first read of corpus.json and every source
  // checkout. The hard-coded anchor is the immutable merged preregistration commit.
  const executionCommit = assertStrictPreregistrationAncestry();
  const candidateSources = sourceBindings(executionCommit);

  const corpusBytes = readFileSync(join(ROOT, 'leaderboard/corpus.json'));
  assertFrozenCorpusBindings(executionCommit, corpusBytes);
  const corpus = JSON.parse(corpusBytes.toString('utf8'));
  if (!Array.isArray(corpus.entries) || corpus.entries.length !== 24) {
    throw new Error(`corpus_denominator_mismatch:${corpus.entries?.length ?? 'missing'}`);
  }
  if (existsSync(options.checkoutRoot)) throw new Error('checkout_root_must_not_exist');
  mkdirSync(options.checkoutRoot, { recursive: false });

  // Invoke this committed harness with the repository-pinned `tsx` binary. Loading the sealed
  // entry directly from TypeScript avoids an untracked dist bundle becoming part of the result.
  const { scoreRepoWithPublicCejel } = await import('../src/witan/index.ts');
  const internalRows = [];
  for (const [corpusIndex, entry] of corpus.entries.entries()) {
    process.stdout.write(`${entry.name}: resolving pinned source\n`);
    try {
      const checkout = prepareCheckout(entry, options);
      const scored = scoreEntry(entry, checkout, scoreRepoWithPublicCejel);
      internalRows.push({
        name: entry.name,
        visibility: entry.visibility,
        corpusIndex,
        sourceCommit: checkout.commit,
        sourceTree: checkout.tree,
        ...scored,
      });
    } catch (error) {
      internalRows.push({
        name: entry.name,
        visibility: entry.visibility,
        corpusIndex,
        expectedSourceCommit: entry.visibility === 'private' ? ALFRED_COMMIT : entry.commit,
        error: sanitizeError(error, options),
      });
    }
  }

  const successful = internalRows.filter((row) => !row.error);
  assignPlacements(successful, 'baseline');
  assignPlacements(successful, 'candidate');
  const decision = buildDecision(internalRows);
  const rows = internalRows.map((row) =>
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
          nonB4CriteriaByteIdentical: row.nonB4CriteriaByteIdentical,
          nonB4CriteriaSha256: {
            baseline: sha256(canonicalJson(stripNonB4Criteria(row.baseline.report))),
            candidate: sha256(canonicalJson(stripNonB4Criteria(row.candidate.report))),
          },
        },
  );
  const result = {
    schemaVersion: 'cejel-b4-commit-year-v19-paired-rescore-v1',
    bindings: {
      preregistrationCommit: PREREGISTRATION_COMMIT,
      executionCommit,
      baselineRubric: BASELINE_RUBRIC,
      candidateRubric: CANDIDATE_RUBRIC,
      generatedAt: GENERATED_AT,
      corpus: { gitBlob: CORPUS_BLOB, sha256: CORPUS_SHA256, rows: 24 },
      reportsTree: REPORTS_TREE,
      privateAlfredCommit: ALFRED_COMMIT,
      candidateSources,
    },
    protocol: {
      sealedPublicScoring: true,
      explicitIngest: false,
      autoDiscoveredIngest: false,
      repositoryCodeExecuted: false,
      privateSourcePathsPublished: false,
      retriedRows: 0,
    },
    decision,
    rows,
  };
  mkdirSync(dirname(options.jsonPath), { recursive: true });
  mkdirSync(dirname(options.markdownPath), { recursive: true });
  writeFileSync(options.jsonPath, canonicalJson(result), 'utf8');
  writeFileSync(options.markdownPath, renderMarkdown(result), 'utf8');
  process.stdout.write(`decision=${decision.protocolDecision} json=${options.jsonPath} markdown=${options.markdownPath}\n`);
  if (decision.protocolDecision !== 'GO') process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
