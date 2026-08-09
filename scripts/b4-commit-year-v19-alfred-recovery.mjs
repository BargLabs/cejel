import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RECOVERY_PREREGISTRATION_COMMIT = '8f937a6d326d9aacc1c0fd607f79f815e148c165';
const FIRST_RUN_COMMIT = '0edfe067813593292d4ba67f8f640cf71d05f0ec';
const FIRST_RUN_EXECUTION_COMMIT = 'ce6af76376264540a4d12494a8ac8d4ab92082ee';
const FIRST_RUN_JSON_PATH =
  'docs/experiments/b4-commit-year-v19-2026-08-09/paired-result.json';
const FIRST_RUN_JSON_BLOB = '2e6bd9c707a8ff3410e8737d71fa49c06feee97c';
const FIRST_RUN_JSON_SHA256 =
  '65e2229f2252c246af0023e764fed718ef2dc5ccd4795c70678e0f457279497b';
const BASELINE_RUBRIC = 'witan-rubric-v18-prospective-2026-07-25';
const CANDIDATE_RUBRIC = 'witan-rubric-v19-prospective-2026-08-09';
const GENERATED_AT = '2026-08-09T00:00:00.000Z';
const ALFRED_COMMIT = 'be2b4325a317fdfaafb68abf9c920a7d6242a830';
const EXPECTED_NAMES = [
  'react',
  'vue',
  'svelte',
  'django',
  'flask',
  'fastapi',
  'express',
  'vite',
  'esbuild',
  'biomejs',
  'requests',
  'pydantic',
  'axios',
  'zod',
  'scorecard',
  'ripgrep',
  'guava',
  'cobra',
  'sinatra',
  'automapper',
  'fmt',
  'carddemo',
  'alfred',
  'cejel',
];
const SCORING_SOURCE_PATHS = [
  'src/witan/git-exec.ts',
  'src/witan/public-scan.ts',
  'src/witan/repo-signals.ts',
  'src/witan/rubric-version.ts',
  'src/witan/scoring.ts',
];
const RECOVERY_HARNESS_PATH = 'scripts/b4-commit-year-v19-alfred-recovery.mjs';
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

export function hardenedGitArguments(argv, { allowFixedLocalClone = false } = {}) {
  const localOverride = allowFixedLocalClone ? ['-c', 'protocol.file.allow=always'] : [];
  return [...SAFE_GIT_ARGUMENTS, ...localOverride, ...argv];
}

function git(argv, cwd = ROOT, { allowFixedLocalClone = false } = {}) {
  return execFileSync('git', hardenedGitArguments(argv, { allowFixedLocalClone }), {
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
  const required = [
    '--checkout-root',
    '--private-alfred-source',
    '--recovery-json',
    '--recovery-markdown',
    '--combined-json',
    '--combined-markdown',
  ];
  for (const key of required) {
    if (!values.has(key)) throw new Error(`missing_argument:${key}`);
  }
  return {
    checkoutRoot: resolve(values.get('--checkout-root')),
    privateAlfredSource: resolve(values.get('--private-alfred-source')),
    recoveryJsonPath: resolve(values.get('--recovery-json')),
    recoveryMarkdownPath: resolve(values.get('--recovery-markdown')),
    combinedJsonPath: resolve(values.get('--combined-json')),
    combinedMarkdownPath: resolve(values.get('--combined-markdown')),
  };
}

export function sanitizePrivateError(error, options) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(options.privateAlfredSource, '[private-source]')
    .replaceAll(options.checkoutRoot, '[checkout-root]');
}

function assertRecoveryAncestry() {
  const executionCommit = git(['rev-parse', 'HEAD']);
  if (executionCommit === RECOVERY_PREREGISTRATION_COMMIT) {
    throw new Error('execution_commit_is_not_a_strict_descendant');
  }
  try {
    git(['merge-base', '--is-ancestor', RECOVERY_PREREGISTRATION_COMMIT, executionCommit]);
  } catch {
    throw new Error('recovery_preregistration_is_not_an_ancestor');
  }
  if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
    throw new Error('tracked_worktree_is_not_clean');
  }
  return executionCommit;
}

function assertCommittedPath(executionCommit, path) {
  const committedBlob = git(['rev-parse', `${executionCommit}:${path}`]);
  const workingBlob = git(['hash-object', path]);
  if (committedBlob !== workingBlob) throw new Error(`source_not_bound_to_execution_commit:${path}`);
  return { gitBlob: committedBlob, sha256: sha256(readFileSync(join(ROOT, path))) };
}

export function validateFirstRun(firstRun) {
  if (firstRun.schemaVersion !== 'cejel-b4-commit-year-v19-paired-rescore-v1') {
    throw new Error('first_run_schema_mismatch');
  }
  if (firstRun.bindings?.executionCommit !== FIRST_RUN_EXECUTION_COMMIT) {
    throw new Error('first_run_execution_commit_mismatch');
  }
  if (
    firstRun.decision?.protocolDecision !== 'NO-GO' ||
    firstRun.decision?.counts?.completed !== 23 ||
    firstRun.decision?.counts?.errors !== 1
  ) {
    throw new Error('first_run_decision_mismatch');
  }
  if (canonicalJson(firstRun.rows.map((row) => row.name)) !== canonicalJson(EXPECTED_NAMES)) {
    throw new Error('first_run_row_order_mismatch');
  }
  const errors = firstRun.rows.filter((row) => row.error);
  if (errors.length !== 1 || errors[0]?.name !== 'alfred') {
    throw new Error('first_run_error_set_mismatch');
  }
  const successful = firstRun.rows.filter((row) => !row.error);
  if (
    successful.some(
      (row) =>
        row.nonB4CriteriaByteIdentical !== true ||
        row.nonB4CriteriaSha256?.baseline !== row.nonB4CriteriaSha256?.candidate,
    )
  ) {
    throw new Error('first_run_success_row_mismatch');
  }
  for (const count of [
    'headlineChanges',
    'b4ScoreOrStatusChanges',
    'rawFreshnessChanges',
    'placementChanges',
    'nonB4Changes',
  ]) {
    if (firstRun.decision.counts[count] !== 0) throw new Error(`first_run_changed:${count}`);
  }
  return firstRun;
}

function readAndValidateFirstRun(executionCommit) {
  const committedBlob = git(['rev-parse', `${executionCommit}:${FIRST_RUN_JSON_PATH}`]);
  if (committedBlob !== FIRST_RUN_JSON_BLOB) throw new Error('first_run_blob_mismatch');
  const bytes = readFileSync(join(ROOT, FIRST_RUN_JSON_PATH));
  if (sha256(bytes) !== FIRST_RUN_JSON_SHA256) throw new Error('first_run_sha256_mismatch');
  return validateFirstRun(JSON.parse(bytes.toString('utf8')));
}

function assertScoringSourcesUnchanged(executionCommit, firstRun) {
  return Object.fromEntries(
    SCORING_SOURCE_PATHS.map((path) => {
      const current = assertCommittedPath(executionCommit, path);
      const frozen = firstRun.bindings?.candidateSources?.[path];
      if (canonicalJson(current) !== canonicalJson(frozen)) {
        throw new Error(`scoring_source_changed:${path}`);
      }
      return [path, current];
    }),
  );
}

function prepareAlfredCheckout(options) {
  if (existsSync(options.checkoutRoot)) throw new Error('checkout_root_must_not_exist');
  if (!existsSync(options.privateAlfredSource)) throw new Error('private_source_unavailable');
  mkdirSync(options.checkoutRoot, { recursive: false });
  const target = join(options.checkoutRoot, 'alfred');
  git(
    [
      'clone',
      '--quiet',
      '--local',
      '--no-hardlinks',
      '--no-checkout',
      options.privateAlfredSource,
      target,
    ],
    ROOT,
    { allowFixedLocalClone: true },
  );
  git(['checkout', '--quiet', '--detach', ALFRED_COMMIT], target);
  const commit = git(['rev-parse', 'HEAD'], target);
  if (commit !== ALFRED_COMMIT) throw new Error('alfred_commit_mismatch');
  return { path: target, commit, tree: git(['rev-parse', 'HEAD^{tree}'], target) };
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

function summarizePrivateReport(report) {
  const b4 = report.criteria.find((criterion) => criterion.id === 'B4');
  const normalized = { ...report, repo: { visibility: 'private', headSha: report.repo.headSha } };
  return {
    reportSha256: sha256(canonicalJson(normalized)),
    rubricVersion: report.rubricVersion,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    verdict: report.verdict,
    coverage: computeCoverage(report),
    placement: 'transparency',
    b4: b4 ? { score: b4.score, status: b4.status, metrics: b4.metrics } : null,
    scanLimitations: report.scanLimitations ?? [],
  };
}

function nonB4Criteria(report) {
  return report.criteria.filter((criterion) => criterion.id !== 'B4');
}

function scoreAlfred(checkout, scoreRepoWithPublicCejel) {
  const common = {
    repoPath: checkout.path,
    productSlug: 'alfred',
    productDisplayName: 'alfred',
    generatedAt: GENERATED_AT,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  };
  const baselineReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: BASELINE_RUBRIC });
  const candidateReport = scoreRepoWithPublicCejel({ ...common, rubricVersion: CANDIDATE_RUBRIC });
  const baselineHash = sha256(canonicalJson(nonB4Criteria(baselineReport)));
  const candidateHash = sha256(canonicalJson(nonB4Criteria(candidateReport)));
  return {
    name: 'alfred',
    visibility: 'private',
    sourceCommit: checkout.commit,
    sourceTree: checkout.tree,
    baseline: summarizePrivateReport(baselineReport),
    candidate: summarizePrivateReport(candidateReport),
    nonB4CriteriaByteIdentical: baselineHash === candidateHash,
    nonB4CriteriaSha256: { baseline: baselineHash, candidate: candidateHash },
  };
}

function freshnessValue(summary) {
  return summary.b4?.metrics.find((entry) => entry.name === 'audit_freshness_depth')?.value;
}

function changed(left, right) {
  return canonicalJson(left) !== canonicalJson(right);
}

export function buildCombinedDecision(alfred) {
  const headlineChanged = [
    'overallScore',
    'codeTrustScore',
    'processTrustScore',
    'verdict',
    'coverage',
  ].some((field) => changed(alfred.baseline[field], alfred.candidate[field]));
  const b4ScoreOrStatusChanged = ['score', 'status'].some(
    (field) => alfred.baseline.b4?.[field] !== alfred.candidate.b4?.[field],
  );
  const rawFreshnessChanged = freshnessValue(alfred.baseline) !== freshnessValue(alfred.candidate);
  const placementChanged = alfred.baseline.placement !== alfred.candidate.placement;
  const nonB4Changed = !alfred.nonB4CriteriaByteIdentical;
  const counts = {
    rows: 24,
    completed: 24,
    errors: 0,
    headlineChanges: headlineChanged ? 1 : 0,
    b4ScoreOrStatusChanges: b4ScoreOrStatusChanged ? 1 : 0,
    rawFreshnessChanges: rawFreshnessChanged ? 1 : 0,
    placementChanges: placementChanged ? 1 : 0,
    nonB4Changes: nonB4Changed ? 1 : 0,
  };
  const changedRows = {
    headline: headlineChanged ? ['alfred'] : [],
    b4ScoreOrStatus: b4ScoreOrStatusChanged ? ['alfred'] : [],
    rawFreshness: rawFreshnessChanged ? ['alfred'] : [],
    placement: placementChanged ? ['alfred'] : [],
    nonB4: nonB4Changed ? ['alfred'] : [],
  };
  return {
    protocolDecision:
      counts.headlineChanges === 0 &&
      counts.b4ScoreOrStatusChanges === 0 &&
      counts.rawFreshnessChanges <= 3 &&
      counts.placementChanges === 0 &&
      counts.nonB4Changes === 0
        ? 'GO'
        : 'NO-GO',
    counts,
    changedRows,
  };
}

function formatValue(value) {
  return value === null ? 'scoreless' : String(value);
}

function coverageText(coverage) {
  return coverage.byCategory
    .map((entry) => `${entry.category} ${entry.measured}/${entry.total}`)
    .join('; ');
}

function rowLine(row) {
  const baselineFreshness = freshnessValue(row.baseline) ?? 'n/a';
  const candidateFreshness = freshnessValue(row.candidate) ?? 'n/a';
  return `| ${row.name} | ${baselineFreshness} to ${candidateFreshness} | ${row.baseline.b4.score}/${row.baseline.b4.status} to ${row.candidate.b4.score}/${row.candidate.b4.status} | ${formatValue(row.baseline.overallScore)} to ${formatValue(row.candidate.overallScore)} | ${formatValue(row.baseline.codeTrustScore)} to ${formatValue(row.candidate.codeTrustScore)} | ${formatValue(row.baseline.processTrustScore)} to ${formatValue(row.candidate.processTrustScore)} | ${row.baseline.verdict} to ${row.candidate.verdict} | ${coverageText(row.baseline.coverage)} to ${coverageText(row.candidate.coverage)} | ${row.baseline.placement} to ${row.candidate.placement} | ${row.nonB4CriteriaByteIdentical ? 'identical' : 'CHANGED'} |`;
}

function renderTable(rows) {
  return [
    '| Repository | B4 freshness | B4 score/status | Overall | Code | Process | Verdict | Coverage | Placement | Non-B4 |',
    '|---|---:|---|---:|---:|---:|---|---|---|---|',
    ...rows.map(rowLine),
  ];
}

export function renderRecoveryMarkdown(result) {
  return [
    '# B4 commit-year v19 Alfred-row recovery — result',
    '',
    `Recovery decision: **${result.decision.protocolDecision}**`,
    '',
    `- Recovery preregistration: \`${result.bindings.recoveryPreregistrationCommit}\``,
    `- Recovery execution commit: \`${result.bindings.executionCommit}\``,
    `- Alfred source commit: \`${result.bindings.alfredCommit}\``,
    `- First-run NO-GO commit: \`${result.bindings.firstRunCommit}\``,
    '',
    ...renderTable([result.row]),
    '',
    'The first-run NO-GO remains unchanged. This recovery neither promotes v19 nor changes the public v17 default.',
    '',
  ].join('\n');
}

export function renderCombinedMarkdown(result) {
  return [
    '# B4 commit-year v19 paired rescore — combined recovery result',
    '',
    `Combined recovery decision: **${result.decision.protocolDecision}**`,
    '',
    `- Original first-run decision: **${result.provenance.firstRunDecision}**`,
    `- Original first-run commit: \`${result.bindings.firstRunCommit}\``,
    `- Recovery preregistration: \`${result.bindings.recoveryPreregistrationCommit}\``,
    `- Recovery execution commit: \`${result.bindings.executionCommit}\``,
    `- Completed rows: ${result.decision.counts.completed}/24; errors: ${result.decision.counts.errors}`,
    `- Raw freshness changes: ${result.decision.counts.rawFreshnessChanges}/24`,
    `- B4 score/status changes: ${result.decision.counts.b4ScoreOrStatusChanges}/24`,
    `- Headline/coverage changes: ${result.decision.counts.headlineChanges}/24`,
    `- Placement changes: ${result.decision.counts.placementChanges}/24`,
    `- Non-B4 changes: ${result.decision.counts.nonB4Changes}/24`,
    '',
    ...renderTable(result.rows),
    '',
    'The original failed run is retained as historical provenance. The public default remains `witan-rubric-v17-2026-07-24`; this recovery does not authorize default promotion.',
    '',
  ].join('\n');
}

function assertNoPrivatePaths(outputs, options) {
  for (const [name, bytes] of Object.entries(outputs)) {
    if (bytes.includes(options.privateAlfredSource) || bytes.includes(options.checkoutRoot)) {
      throw new Error(`private_path_emitted:${name}`);
    }
  }
}

function writeOutput(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  try {
    // This proof intentionally runs before the first-run JSON or Alfred repository is read.
    const executionCommit = assertRecoveryAncestry();
    const recoveryHarness = assertCommittedPath(executionCommit, RECOVERY_HARNESS_PATH);
    const firstRun = readAndValidateFirstRun(executionCommit);
    const scoringSources = assertScoringSourcesUnchanged(executionCommit, firstRun);

    const checkout = prepareAlfredCheckout(options);
    const { scoreRepoWithPublicCejel } = await import('../src/witan/index.ts');
    const alfred = scoreAlfred(checkout, scoreRepoWithPublicCejel);
    const decision = buildCombinedDecision(alfred);
    const bindings = {
      recoveryPreregistrationCommit: RECOVERY_PREREGISTRATION_COMMIT,
      executionCommit,
      firstRunCommit: FIRST_RUN_COMMIT,
      firstRunExecutionCommit: FIRST_RUN_EXECUTION_COMMIT,
      firstRunJson: { gitBlob: FIRST_RUN_JSON_BLOB, sha256: FIRST_RUN_JSON_SHA256 },
      alfredCommit: ALFRED_COMMIT,
      generatedAt: GENERATED_AT,
      baselineRubric: BASELINE_RUBRIC,
      candidateRubric: CANDIDATE_RUBRIC,
      scoringSources,
      recoveryHarness,
    };
    const recoveryResult = {
      schemaVersion: 'cejel-b4-commit-year-v19-alfred-recovery-v1',
      bindings,
      protocol: {
        sealedPublicScoring: true,
        explicitIngest: false,
        autoDiscoveredIngest: false,
        repositoryCodeExecuted: false,
        privateSourcePathsPublished: false,
        retriedFirstRunRows: 0,
      },
      decision,
      row: alfred,
    };
    const combinedRows = firstRun.rows.map((row) => (row.name === 'alfred' ? alfred : row));
    const combinedResult = {
      schemaVersion: 'cejel-b4-commit-year-v19-combined-recovery-v1',
      bindings,
      provenance: {
        firstRunDecision: firstRun.decision.protocolDecision,
        firstRunErrorRow: firstRun.rows.find((row) => row.name === 'alfred'),
        recoveryDecision: decision.protocolDecision,
        completedRowsReusedWithoutRescan: 23,
      },
      decision,
      rows: combinedRows,
    };
    const outputs = {
      recoveryJson: canonicalJson(recoveryResult),
      recoveryMarkdown: renderRecoveryMarkdown(recoveryResult),
      combinedJson: canonicalJson(combinedResult),
      combinedMarkdown: renderCombinedMarkdown(combinedResult),
    };
    assertNoPrivatePaths(outputs, options);
    writeOutput(options.recoveryJsonPath, outputs.recoveryJson);
    writeOutput(options.recoveryMarkdownPath, outputs.recoveryMarkdown);
    writeOutput(options.combinedJsonPath, outputs.combinedJson);
    writeOutput(options.combinedMarkdownPath, outputs.combinedMarkdown);
    process.stdout.write(`decision=${decision.protocolDecision}\n`);
    if (decision.protocolDecision !== 'GO') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`Cejel v19 Alfred recovery failed: ${sanitizePrivateError(error, options)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
