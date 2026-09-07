import { describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { serializeWitanReport } from '../attestation.js';
import {
  buildRelyingPartySummary,
  CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE,
  CERTIFICATE_GLOSSARY,
  CERTIFICATE_METRIC_REGISTRY,
} from '../certificate-presentation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import type { WitanCriterionScore, WitanFinding, WitanReport } from '../schemas.js';

function criterion(
  overrides: Partial<WitanCriterionScore> & Pick<WitanCriterionScore, 'id' | 'category'>,
): WitanCriterionScore {
  return {
    title: overrides.id,
    score: 3,
    status: 'info',
    evidence: [],
    findings: [],
    metrics: [],
    ...overrides,
  };
}

function reportFixture(criteria: WitanCriterionScore[]): WitanReport {
  return {
    productSlug: 'legibility-fixture',
    productDisplayName: 'Legibility fixture',
    repo: { path: '/tmp/legibility-fixture', headSha: 'a'.repeat(40) },
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria,
  };
}

function humanReadableOutputs(report: WitanReport): string[] {
  return [
    renderWitanHtmlReport(report),
    renderWitanMarkdownReport(report),
    renderTerminalCertificate(buildWitanCliSummary(report), report),
  ].map((output) => output.replaceAll('&#39;', "'"));
}

function finding(overrides: Partial<WitanFinding> & Pick<WitanFinding, 'severity'>): WitanFinding {
  return {
    summary: `${overrides.severity} finding`,
    evidence: { kind: 'artifact', label: 'fixture evidence', path: 'src/example.ts' },
    ...overrides,
  };
}

describe('certificate metric glossary guard', () => {
  it('requires exactly one glossary entry whose term matches every registered metric label', () => {
    const registeredNames = Object.keys(CERTIFICATE_METRIC_REGISTRY).sort();
    const glossaryNames = CERTIFICATE_GLOSSARY.flatMap((entry) => entry.metricNames).sort();

    expect(glossaryNames).toEqual(registeredNames);
    for (const [name, registration] of Object.entries(CERTIFICATE_METRIC_REGISTRY)) {
      const entries = CERTIFICATE_GLOSSARY.filter((entry) => entry.metricNames.includes(name));
      expect(entries, `${name} must have exactly one glossary entry`).toHaveLength(1);
      expect(entries[0]?.term).toBe(registration.displayLabel);
    }
  });
});

describe('caller-context product identity label', () => {
  it('appears on HTML, Markdown, and terminal certificate surfaces', () => {
    for (const output of humanReadableOutputs(reportFixture([]))) {
      expect(output).toContain(CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE);
    }
  });
});

describe('certificate metric self-explanation', () => {
  it('names actual verification and counted-practice members in every certificate format', () => {
    const report = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        metrics: [
          {
            name: 'verification_script_ratio',
            label: 'Verification script ratio',
            value: 1,
            max: 4,
            weight: 1,
            unit: 'ratio',
            kind: 'saturating_count',
            presentation: {
              components: [
                { label: 'test command', count: 1 },
                { label: 'coverage command', count: 0 },
                { label: 'lint command', count: 0 },
                { label: 'type-check command', count: 0 },
                { label: 'test-runner configuration', count: 0 },
              ],
            },
          },
        ],
      }),
      criterion({
        id: 'A2',
        category: 'code_trust',
        metrics: [
          {
            name: 'env_handling_depth',
            label: 'Environment handling depth',
            value: 1,
            max: 3,
            weight: 1,
            unit: 'practices',
            presentation: {
              components: [
                { label: 'environment template file', count: 1 },
                { label: '.gitignore environment-file rule', count: 0 },
                { label: 'environment reads in implementation code', count: 0 },
              ],
            },
          },
        ],
      }),
    ]);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain(
        '1/4 — present: test command; missing: coverage command, lint command, type-check command, test-runner configuration',
      );
      expect(output).toContain(
        '1/3 — present: environment template file; missing: .gitignore environment-file rule, environment reads in implementation code',
      );
      expect(output).toContain('Build is not measured by this metric');
    }
  });

  it('renders binary outcomes without fractions and states conditional scope inline', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        metrics: [
          {
            name: 'secret_cleanliness',
            label: 'Secret cleanliness',
            value: 1,
            max: 1,
            weight: 0.5,
            unit: 'clean',
          },
          {
            name: 'crypto_comparison_hygiene',
            label: 'Crypto comparison hygiene',
            value: 1,
            max: 1,
            weight: 0.5,
            unit: 'clean',
          },
        ],
      }),
      criterion({
        id: 'B6',
        category: 'process_trust',
        metrics: [
          {
            name: 'human_gate_documented',
            label: 'Human gate documented',
            value: 0,
            max: 1,
            weight: 0.5,
            unit: 'present',
          },
          {
            name: 'fail_closed_privilege_check',
            label: 'Fail-closed privilege check present',
            value: 1,
            max: 1,
            weight: 0.5,
            unit: 'present',
          },
          {
            name: 'privilege_escalation_cleanliness',
            label: 'Privilege-escalation cleanliness',
            value: 1,
            max: 1,
            weight: 0.5,
            unit: 'clean',
          },
          {
            name: 'protected_path_review_gate',
            label: 'Protected-path review gate',
            value: 0,
            max: 1,
            weight: 0.5,
            unit: 'present',
          },
        ],
      }),
    ]);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain('clean — no critical secret findings detected');
      expect(output).toContain(
        'clean — no insecure comparison or serialization pattern detected; scored because a signing, HMAC, or secret-comparison surface was detected',
      );
      expect(output).toContain(
        'missing — no human-gate documentation detected; scored because a privileged-operation-shaped surface was detected',
      );
      expect(output).toContain(
        'present — role membership is checked fail-closed before elevation; scored because a privileged-operation-shaped surface was detected',
      );
      expect(output).toContain(
        'clean — no ungated production privilege-escalation pattern detected',
      );
      expect(output).toContain(
        'missing — no CODEOWNERS or documented required-review policy detected',
      );
      expect(output).not.toMatch(/(?:Secret cleanliness|Crypto comparison hygiene)[^\n<]*1\/1/);
    }
  });

  it('names members for every other fixed enumerable scoring input', () => {
    const report = reportFixture([
      criterion({
        id: 'A3',
        category: 'code_trust',
        metrics: [
          {
            name: 'prod_readiness_primitives',
            label: 'Production-readiness basic checks',
            value: 2,
            max: 6,
            weight: 1,
            kind: 'saturating_count',
            presentation: {
              components: [
                { label: 'build or type-check command', count: 1 },
                { label: 'CI workflow', count: 1 },
                { label: 'deployment configuration', count: 0 },
                { label: 'environment template', count: 0 },
                { label: 'health or readiness signal', count: 0 },
                { label: 'error boundary', count: 0 },
              ],
            },
          },
        ],
      }),
      criterion({
        id: 'A4',
        category: 'code_trust',
        metrics: [
          {
            name: 'dependency_automation_ratio',
            label: 'Dependency automation ratio',
            value: 1,
            max: 2,
            weight: 1,
            presentation: {
              components: [
                { label: 'automated dependency-update configuration', count: 1 },
                { label: 'package-manager audit hook', count: 0 },
              ],
            },
          },
        ],
      }),
      criterion({
        id: 'B2',
        category: 'process_trust',
        metrics: [
          {
            name: 'pr_trace_primitives',
            label: 'PR trace basic checks',
            value: 2,
            max: 2,
            weight: 1,
            kind: 'saturating_count',
            presentation: {
              components: [
                { label: 'CI workflow', count: 2 },
                { label: 'pull-request template', count: 0 },
                { label: 'review-gate record', count: 0 },
              ],
            },
          },
        ],
      }),
      criterion({
        id: 'B3',
        category: 'process_trust',
        metrics: [
          {
            name: 'ci_script_depth',
            label: 'CI verification depth',
            value: 2,
            max: 4,
            weight: 1,
            kind: 'saturating_count',
            presentation: {
              components: [
                { label: 'package script: test', count: 1 },
                { label: 'package script: lint', count: 0 },
                { label: 'repository CI command: test', count: 1 },
                { label: 'repository CI command: lint', count: 0 },
              ],
            },
          },
        ],
      }),
    ]);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain(
        '2/6 — present: build or type-check command, CI workflow; missing: deployment configuration, environment template, health or readiness signal, error boundary',
      );
      expect(output).toContain(
        '1/2 — present: automated dependency-update configuration; missing: package-manager audit hook',
      );
      expect(output).toContain(
        '2/2 — present: CI workflow (2 detected); missing: pull-request template, review-gate record',
      );
      expect(output).toContain(
        '2/4 — present: package script: test, repository CI command: test; missing: package script: lint, repository CI command: lint',
      );
    }
  });

  it('states what the recent-commit proxy actually matched', () => {
    const report = reportFixture([
      criterion({
        id: 'B2',
        category: 'process_trust',
        metrics: [
          {
            name: 'pr_merge_ratio',
            label: 'Recent PR merge ratio',
            value: 0,
            max: 1,
            weight: 1,
            unit: 'ratio',
          },
        ],
      }),
    ]);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain('Recent commits with recognizable PR references');
      expect(output).toContain(
        'none found in bounded recent commit subjects (scoring value 0/1)',
      );
      expect(output).toContain('A zero means no recognizable reference was found');
      expect(output).not.toContain('Recent PR merge ratio');
    }
  });
});

// 0.4.7 Track A discipline (ADR-0022): every item in this workstream is presentation-only.
// The certificate may change; report.json (and every other machine-readable surface) may not.
// This is a mechanical, reusable guard for that boundary — add to it, don't bypass it, as later
// Track A items land.
describe('Track A presentation-only guard', () => {
  it('leaves report.json byte-identical across every human-readable render', () => {
    // Extend this fixture as later Track A items land, rather than adding parallel guard tests —
    // one growing fixture keeps the byte-identity check exercising every kind of report content
    // Track A has touched (findings here for A1; multi-weighted metrics here for A2; an
    // unmeasured + a not-applicable criterion here for A4's remediation-output gap detection).
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [
          finding({ severity: 'critical', summary: 'critical finding fixture' }),
          finding({ severity: 'warning', summary: 'warning finding fixture' }),
          finding({ severity: 'info', summary: 'info finding fixture' }),
        ],
        metrics: [
          {
            name: 'secret_cleanliness',
            label: 'Secret cleanliness',
            value: 1,
            max: 1,
            weight: 1,
            unit: 'clean',
          },
          {
            name: 'crypto_comparison_hygiene',
            label: 'Crypto comparison hygiene',
            value: 1,
            max: 1,
            weight: 3,
            unit: 'clean',
          },
        ],
      }),
      criterion({ id: 'B4', category: 'process_trust', status: 'insufficient_data' }),
      criterion({ id: 'B5', category: 'process_trust', status: 'not_applicable' }),
    ]);
    const before = serializeWitanReport(report);

    renderWitanHtmlReport(report);
    renderWitanMarkdownReport(report);
    renderTerminalCertificate(buildWitanCliSummary(report), report);

    expect(serializeWitanReport(report)).toBe(before);
  });
});

describe('Track A1 — findings-first restructure', () => {
  it('shows critical and warning findings, ordered critical-first, before the relying-party summary', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [
          finding({ severity: 'warning', summary: 'warning finding fixture' }),
          finding({ severity: 'critical', summary: 'critical finding fixture' }),
          finding({ severity: 'info', summary: 'info finding fixture' }),
        ],
      }),
    ]);
    const html = renderWitanHtmlReport(report);

    const findingsHeadingIndex = html.indexOf('id="findings-first-heading"');
    const relyingPartyHeadingIndex = html.indexOf('id="relying-party-heading"');
    const criticalIndex = html.indexOf('critical finding fixture');
    const warningIndex = html.indexOf('warning finding fixture');

    expect(findingsHeadingIndex).toBeGreaterThan(-1);
    // The heading names exactly the two severities promoted here — not the bare word
    // "Findings", which would overclaim relative to what this section actually contains
    // (info-severity findings are deliberately excluded; see below).
    expect(html).toContain('id="findings-first-heading">Critical and warning findings</h2>');
    expect(relyingPartyHeadingIndex).toBeGreaterThan(findingsHeadingIndex);
    expect(criticalIndex).toBeGreaterThan(findingsHeadingIndex);
    expect(criticalIndex).toBeLessThan(relyingPartyHeadingIndex);
    expect(warningIndex).toBeGreaterThan(criticalIndex);
    expect(warningIndex).toBeLessThan(relyingPartyHeadingIndex);
    // The info-severity finding is not promoted into the findings-first section — it still
    // renders inside its criterion card, further down the document, not ahead of it.
    const infoIndexInFindingsFirst = html
      .slice(findingsHeadingIndex, relyingPartyHeadingIndex)
      .includes('info finding fixture');
    expect(infoIndexInFindingsFirst).toBe(false);
  });

  it('states plainly, before the relying-party summary, when there are no critical or warning findings', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [finding({ severity: 'info', summary: 'info finding fixture' })],
      }),
    ]);
    const html = renderWitanHtmlReport(report);

    const findingsHeadingIndex = html.indexOf('id="findings-first-heading"');
    const relyingPartyHeadingIndex = html.indexOf('id="relying-party-heading"');
    const emptyStatementIndex = html.indexOf(
      'No critical or warning findings were identified across any criterion in this scan.',
    );

    expect(findingsHeadingIndex).toBeGreaterThan(-1);
    expect(emptyStatementIndex).toBeGreaterThan(findingsHeadingIndex);
    expect(emptyStatementIndex).toBeLessThan(relyingPartyHeadingIndex);
  });

  it('does not change report.json, attestation-relevant fields, or badge-relevant scores', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [finding({ severity: 'critical', summary: 'critical finding fixture' })],
      }),
    ]);
    const before = serializeWitanReport(report);
    renderWitanHtmlReport(report);
    expect(serializeWitanReport(report)).toBe(before);
  });
});

describe('Track A2 — per-criterion cards show applied weight', () => {
  it('shows each metric renormalized to the share actually applied to this report, on every surface', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        metrics: [
          {
            name: 'secret_cleanliness',
            label: 'Secret cleanliness',
            value: 1,
            max: 1,
            weight: 1,
            unit: 'clean',
          },
          {
            name: 'crypto_comparison_hygiene',
            label: 'Crypto comparison hygiene',
            value: 1,
            max: 1,
            weight: 3,
            unit: 'clean',
          },
        ],
      }),
    ]);

    // Weights 1 and 3 renormalize to 25% and 75% of this criterion — not their nominal 1 and 3,
    // and not a naive 1/1=100%/3/1=300% misread. This is the exact renormalization scoreMetrics()
    // (scoring.ts) already applies to compute the score; the certificate now shows the reader the
    // same number, it does not compute a new one.
    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain('weight 25% of A2');
      expect(output).toContain('weight 75% of A2');
    }
  });

  it('shows 100% for a criterion with a single surviving metric, not its nominal declared weight', () => {
    const report = reportFixture([
      criterion({
        id: 'B6',
        category: 'process_trust',
        metrics: [
          {
            name: 'human_gate_documented',
            label: 'Human gate documented',
            value: 1,
            max: 1,
            weight: 0.2,
            unit: 'present',
          },
        ],
      }),
    ]);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain('weight 100% of B6');
      expect(output).not.toContain('weight 20% of B6');
    }
  });

  it('keeps the named 21-workflow alarm-delivery case auditable with weight, method, and evidence', () => {
    const report = reportFixture([
      criterion({
        id: 'B3',
        category: 'process_trust',
        evidence: [
          {
            kind: 'artifact',
            label: 'Workflow inventory',
            path: '.github/workflows',
          },
        ],
        findings: [
          finding({
            severity: 'warning',
            summary: 'Alarm delivery is not wired for 21 workflows',
            evidence: {
              kind: 'artifact',
              label: 'Workflow inventory',
              path: '.github/workflows',
            },
          }),
        ],
        metrics: [
          {
            name: 'default_branch_ci_depth',
            label: 'PR-gate CI workflow count',
            value: 21,
            max: 4,
            weight: 1,
            kind: 'saturating_count',
            unit: 'workflows',
          },
        ],
      }),
    ]);

    // The issue's secondary acceptance target names the certificate specifically. The tests
    // above separately enforce the new weight on all three human-readable renderers.
    const certificate = renderWitanHtmlReport(report);
    expect(certificate).toContain('Alarm delivery is not wired for 21 workflows');
    expect(certificate).toContain('PR-gate CI workflow count');
    expect(certificate).toContain('4 workflows (capped; 21 raw)');
    expect(certificate).toContain('weight 100% of B3');
    expect(certificate).toContain(
      'The number of detected CI workflow files configured for pull requests or the main or master branch',
    );
    expect(certificate).toContain('.github/workflows');
  });

  it('does not change report.json across a render with multi-weighted metrics', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        metrics: [
          {
            name: 'secret_cleanliness',
            label: 'Secret cleanliness',
            value: 1,
            max: 1,
            weight: 1,
            unit: 'clean',
          },
          {
            name: 'crypto_comparison_hygiene',
            label: 'Crypto comparison hygiene',
            value: 0,
            max: 1,
            weight: 3,
            unit: 'clean',
          },
        ],
      }),
    ]);
    const before = serializeWitanReport(report);
    for (const render of [
      () => renderWitanHtmlReport(report),
      () => renderWitanMarkdownReport(report),
      () => renderTerminalCertificate(buildWitanCliSummary(report), report),
    ]) {
      render();
    }
    expect(serializeWitanReport(report)).toBe(before);
  });
});

describe('Track A5 — github.run_attempt rider', () => {
  it('shows the run attempt on HTML and Markdown when supplied', () => {
    const report = reportFixture([criterion({ id: 'A2', category: 'code_trust' })]);

    const html = renderWitanHtmlReport(report, { runAttempt: '2' });
    const markdown = renderWitanMarkdownReport(report, { runAttempt: '2' });

    expect(html).toContain('<dt>Run attempt</dt><dd>2</dd>');
    expect(markdown).toContain('- Run attempt: 2');
  });

  it('shows no run attempt line at all — never a fabricated default — when omitted', () => {
    const report = reportFixture([criterion({ id: 'A2', category: 'code_trust' })]);

    const html = renderWitanHtmlReport(report);
    const markdown = renderWitanMarkdownReport(report);

    expect(html).not.toContain('Run attempt');
    expect(markdown).not.toContain('Run attempt');
  });

  it('does not change report.json when a run attempt is rendered', () => {
    const report = reportFixture([criterion({ id: 'A2', category: 'code_trust' })]);
    const before = serializeWitanReport(report);

    renderWitanHtmlReport(report, { runAttempt: '3' });
    renderWitanMarkdownReport(report, { runAttempt: '3' });

    expect(serializeWitanReport(report)).toBe(before);
  });
});

// No-score-promise guard patterns. Track A4's "next" copy must name an absence — missing
// evidence, an unmeasured metric, a scan limitation — and never state or imply what score a
// repository would receive. Mirrors the discipline of the glossary guard above: an exhaustive
// check over generated copy, not a spot check, so a future edit can't silently reintroduce a
// score-promise.
const SCORE_PROMISE_PATTERNS = [
  /\bscore (would|will|could|can) (be|become)\b/i,
  /\brais(e|es|ing) (your|the|its) score\b/i,
  /\bimprov(e|es|ing) (your|the) score to\b/i,
  /\bbecomes? (a|an) \d/i,
  /\bresults? in a score of\b/i,
  /\bscore of \d(\.\d)?\/4/i,
];

function assertNoScorePromise(text: string): void {
  for (const pattern of SCORE_PROMISE_PATTERNS) {
    expect(text, `must not contain a score-promise matching ${pattern}: "${text}"`).not.toMatch(
      pattern,
    );
  }
}

describe('Track A4 — remediation output: evidence-absence, prioritized', () => {
  it('prioritizes an unmeasured criterion above a not-applicable criterion', () => {
    const report = reportFixture([
      criterion({ id: 'A1', category: 'code_trust', status: 'insufficient_data' }),
      criterion({ id: 'B4', category: 'process_trust', status: 'not_applicable' }),
    ]);
    const summary = buildRelyingPartySummary(report);

    const unmeasuredIndex = summary.next.indexOf('Obtain measurable evidence for A1');
    const notApplicableIndex = summary.next.indexOf(
      'Confirm B4 is correctly marked not applicable',
    );

    expect(unmeasuredIndex).toBeGreaterThan(-1);
    expect(notApplicableIndex).toBeGreaterThan(-1);
    expect(unmeasuredIndex).toBeLessThan(notApplicableIndex);
  });

  it('states an evidence-absence next step per critical/warning finding, capped by severity then order, excluding info', () => {
    const report = reportFixture([
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [
          finding({ severity: 'critical', summary: 'critical finding one' }),
          finding({ severity: 'warning', summary: 'warning finding one' }),
          finding({ severity: 'info', summary: 'info finding one' }),
        ],
      }),
      criterion({
        id: 'A3',
        category: 'code_trust',
        findings: [
          finding({ severity: 'critical', summary: 'critical finding two' }),
          finding({ severity: 'warning', summary: 'warning finding two' }),
        ],
      }),
    ]);
    const summary = buildRelyingPartySummary(report);

    // 4 critical/warning findings total, sorted critical-first (stable within a severity),
    // capped at 3 individual statements plus one overflow sentence naming the remaining count —
    // the lowest-priority item (A3's warning) is never silently dropped.
    expect(summary.next).toContain(
      'Evidence is currently absent for the critical finding on A2: obtain independent verification',
    );
    expect(summary.next).toContain(
      'Evidence is currently absent for the critical finding on A3: obtain independent verification',
    );
    expect(summary.next).toContain(
      'Evidence is currently absent for the warning finding on A2: obtain independent verification',
    );
    expect(summary.next).toContain('1 more critical/warning finding(s) need the same');
    // The info-severity finding gets no next-step statement of its own.
    expect(summary.next).not.toContain('for the info finding');
  });

  it('produces different, specific next content for differently-gapped reports', () => {
    const missingCoverageReport = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        metrics: [
          { name: 'coverage_percent', label: 'Static coverage percentage', value: 0, max: 100, weight: 1 },
        ],
      }),
    ]);
    const notApplicableReport = reportFixture([
      criterion({ id: 'B4', category: 'process_trust', status: 'not_applicable' }),
    ]);

    const missingCoverageNext = buildRelyingPartySummary(missingCoverageReport).next;
    const notApplicableNext = buildRelyingPartySummary(notApplicableReport).next;

    expect(missingCoverageNext).not.toBe(notApplicableNext);
    expect(missingCoverageNext).toContain("A1's static coverage metric");
    expect(notApplicableNext).toContain('Confirm B4 is correctly marked not applicable');
  });

  it('states plainly, never silently, when no unresolved evidence gap was identified', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })]);
    const summary = buildRelyingPartySummary(report);

    expect(summary.next).toContain('No unresolved evidence gaps were identified');
  });

  it('never states or implies a score-promise, across every next-step branch', () => {
    const reports = [
      reportFixture([criterion({ id: 'A1', category: 'code_trust', status: 'insufficient_data' })]),
      reportFixture([criterion({ id: 'B4', category: 'process_trust', status: 'not_applicable' })]),
      reportFixture([
        criterion({
          id: 'A2',
          category: 'code_trust',
          findings: [
            finding({ severity: 'critical', summary: 'critical finding' }),
            finding({ severity: 'warning', summary: 'warning finding' }),
          ],
        }),
      ]),
      reportFixture([criterion({ id: 'A1', category: 'code_trust' })]),
      { ...reportFixture([criterion({ id: 'A1', category: 'code_trust' })]), scanLimitations: ['bounded directory walk'] },
      {
        ...reportFixture([criterion({ id: 'A1', category: 'code_trust' })]),
        contentReadSummary: {
          skipped: 2,
          byReason: { unreadable: 2, tooLarge: 0, excludedByExtension: 0, deniedPath: 0, nonRegularFile: 0 },
          unreadableByErrno: {},
          affectedCriteria: ['A1' as const],
        },
      },
    ];

    for (const report of reports) {
      const summary = buildRelyingPartySummary(report);
      assertNoScorePromise(summary.next);
      assertNoScorePromise(summary.notEstablished);
    }
  });

  it('does not change report.json across a render with an unmeasured criterion, findings, and a not-applicable criterion', () => {
    const report = reportFixture([
      criterion({ id: 'A1', category: 'code_trust', status: 'insufficient_data' }),
      criterion({
        id: 'A2',
        category: 'code_trust',
        findings: [finding({ severity: 'critical', summary: 'critical finding fixture' })],
      }),
      criterion({ id: 'B4', category: 'process_trust', status: 'not_applicable' }),
    ]);
    const before = serializeWitanReport(report);

    for (const output of humanReadableOutputs(report)) {
      expect(output).toContain('What to do next');
    }

    expect(serializeWitanReport(report)).toBe(before);
  });
});
