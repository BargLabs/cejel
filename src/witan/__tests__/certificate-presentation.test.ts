import { describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { CERTIFICATE_GLOSSARY, formatCertificateMetricValue } from '../certificate-presentation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import { serializeWitanReport } from '../attestation.js';

// WCAG 2.x relative-luminance contrast ratio between two #rrggbb colors.
function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string): number => {
    const channel = (value: number): number => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const lumA = luminance(hexA);
  const lumB = luminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

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

function reportFixture(
  criteria: WitanCriterionScore[],
  options: { headSha?: string } = {},
): WitanReport {
  return {
    productSlug: 'certificate-fixture',
    productDisplayName: 'Certificate fixture',
    repo: {
      path: '/tmp/certificate-fixture',
      ...(options.headSha ? { headSha: options.headSha } : {}),
    },
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria,
  };
}

describe('certificate presentation regressions', () => {
  it('renders capped test/source counts identically in HTML, Markdown, and terminal', () => {
    const report = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        metrics: [
          {
            name: 'test_to_source_ratio',
            label: 'Test-to-source file ratio',
            value: 73,
            max: 57,
            weight: 0.3,
            unit: 'ratio',
            kind: 'saturating_count',
          },
        ],
      }),
    ]);
    const expected = '73 test files / 57 source files (credit capped at parity)';

    expect(renderWitanHtmlReport(report)).toContain(expected);
    expect(renderWitanMarkdownReport(report)).toContain(expected);
    expect(renderTerminalCertificate(buildWitanCliSummary(report), report)).toContain(expected);
  });

  it('distinguishes absent coverage from a measured zero in every renderer without changing score or report bytes', () => {
    const a1 = criterion({
      id: 'A1',
      category: 'code_trust',
      score: 2.4,
      status: 'warning',
      metrics: [
        {
          name: 'coverage_percent',
          label: 'Static coverage percentage',
          value: 0,
          max: 100,
          weight: 0.3,
          unit: 'percent',
        },
      ],
    });
    const absent = reportFixture([a1]);
    const measuredZero = reportFixture([
      {
        ...a1,
        evidence: [
          {
            kind: 'coverage',
            label: 'Measured coverage report',
            path: 'coverage/coverage-summary.json',
          },
        ],
      },
    ]);
    const before = serializeWitanReport(absent);
    const absentOutputs = [
      renderWitanHtmlReport(absent),
      renderWitanMarkdownReport(absent),
      renderTerminalCertificate(buildWitanCliSummary(absent), absent),
    ];
    const measuredOutputs = [
      renderWitanHtmlReport(measuredZero),
      renderWitanMarkdownReport(measuredZero),
      renderTerminalCertificate(buildWitanCliSummary(measuredZero), measuredZero),
    ];

    for (const output of absentOutputs) {
      expect(output).toContain('no coverage report found — not measured');
    }
    for (const output of measuredOutputs) {
      expect(output).toContain('0/100 percent');
      expect(output).not.toContain('no coverage report found — not measured');
    }
    expect(absent.overallScore).toBe(measuredZero.overallScore);
    expect(absent.criteria[0]?.score).toBe(measuredZero.criteria[0]?.score);
    expect(absent.criteria[0]?.metrics[0]?.value).toBe(0);
    expect(serializeWitanReport(absent)).toBe(before);
  });

  it('keeps relying-party sections ordered and operator-authored glossary copy verbatim', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })], {
      headSha: '0123456789abcdef0123456789abcdef01234567',
    });
    const outputs = [
      renderWitanHtmlReport(report),
      renderWitanMarkdownReport(report),
      renderTerminalCertificate(buildWitanCliSummary(report), report),
    ];

    for (const output of outputs) {
      expect(output.indexOf('What was examined')).toBeLessThan(
        output.indexOf('What was established'),
      );
      expect(output.indexOf('What was established')).toBeLessThan(
        output.indexOf('What was not established'),
      );
      expect(output.indexOf('What was not established')).toBeLessThan(
        output.indexOf('What to do next'),
      );
      expect(output).toContain(
        'test files that actually assert something rather than being empty or skipped',
      );
      expect(output).toContain('credentials like API keys and tokens');
      expect(output).toContain(
        'the checks that run automatically: tests, linting, type-checking, build',
      );
    }
    expect(CERTIFICATE_GLOSSARY).toHaveLength(33);
  });

  it('renders every glossary entry in every human-readable surface with the revision-2 style', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })]);
    const outputs = [
      renderWitanHtmlReport(report),
      renderWitanMarkdownReport(report),
      renderTerminalCertificate(buildWitanCliSummary(report), report),
    ];

    expect(CERTIFICATE_GLOSSARY).toHaveLength(33);
    for (const entry of CERTIFICATE_GLOSSARY) {
      expect(entry.definition.toLowerCase()).not.toContain('it matters');
      expect(entry.definition).not.toContain(';');
      for (const output of outputs) {
        const readableOutput = output.replaceAll('&#39;', "'");
        expect(readableOutput).toContain(entry.term);
        expect(readableOutput).toContain(entry.definition);
      }
    }
  });

  it('renders distinct basic-check and inline workflow definitions without user-facing primitive language', () => {
    const report = reportFixture([
      criterion({
        id: 'A3',
        category: 'code_trust',
        metrics: [
          {
            name: 'prod_readiness_primitives',
            label: 'Production-readiness primitive coverage',
            value: 4,
            max: 6,
            weight: 0.55,
            unit: 'primitives',
          },
          {
            name: 'prod_workflow_depth',
            label: 'Production workflow depth',
            value: 2,
            max: 6,
            weight: 0.2,
            unit: 'signals',
          },
        ],
      }),
      criterion({
        id: 'B2',
        category: 'process_trust',
        metrics: [
          {
            name: 'pr_trace_primitives',
            label: 'PR trace primitive coverage',
            value: 2,
            max: 2,
            weight: 0.8,
            unit: 'signals',
          },
        ],
      }),
      criterion({
        id: 'B3',
        category: 'process_trust',
        metrics: [
          {
            name: 'default_branch_ci_depth',
            label: 'PR-gate CI workflow count',
            value: 1,
            max: 4,
            weight: 0.5,
            unit: 'workflows',
          },
        ],
      }),
    ]);
    const outputs = [
      renderWitanHtmlReport(report),
      renderWitanMarkdownReport(report),
      renderTerminalCertificate(buildWitanCliSummary(report), report),
    ];

    for (const output of outputs) {
      expect(output).toContain('Production-readiness basic checks');
      expect(output).toContain('PR trace basic checks');
      expect(output).toContain('4/6 checks');
      expect(output).toContain('2/2 checks');
      expect(output).toContain(
        'Production workflow depth (automated build/test/release pipeline)',
      );
      expect(output).toContain(
        'PR-gate CI workflow count (automated build/test pipeline)',
      );
      expect(output.toLowerCase()).not.toContain('primitive');
    }
  });

  it('locks the external reviewer feedback copy', () => {
    const definitions = Object.fromEntries(
      CERTIFICATE_GLOSSARY.map((entry) => [entry.key, entry.definition]),
    );

    expect(definitions.labels).toBe(
      'Three labels can appear on one line because they answer three different questions. Finding severity describes how serious one issue is. The dimension band summarizes the criterion evidence. The numeric band comes from the weighted score.',
    );
    expect(definitions.capped).toBe(
      'Credit stops increasing after the maximum defined by the scoring rubric, even when the raw count is higher. Caps are fixed per rubric version because they are part of what was calibrated. Extra volume therefore cannot outweigh the rest of the rubric.',
    );
    expect(definitions['static-coverage']).toBe(
      'A percentage read from a coverage report or threshold that the repository itself publishes. Cejel does not run the repository\'s tests. The scoring rubric defines how much credit the published percentage receives.',
    );
    expect(definitions['crypto-comparison-hygiene']).toBe(
      'Comparisons of secret values that take the same time whether or not the values match. Attackers therefore cannot recover secrets by measuring response times.',
    );
    expect(definitions['dependency-count-sanity']).toBe(
      'A bounded check for an unusually long list of direct dependencies for a library. Every direct dependency adds maintenance and supply-chain exposure.',
    );
  });

  it('records both the producing CLI version and rubric version', () => {
    const html = renderWitanHtmlReport(
      reportFixture([criterion({ id: 'A1', category: 'code_trust' })]),
      { cliVersion: '0.2.2' },
    );

    expect(html).toContain('<dt>CLI</dt><dd>Cejel 0.2.2</dd>');
    expect(html).toContain(
      '<dt>Rubric</dt><dd>witan-rubric-v17-2026-07-24</dd>',
    );
  });

  it('explains a calibrated verified band beside a below-threshold weighted score', () => {
    const html = renderWitanHtmlReport(
      reportFixture([
        criterion({
          id: 'B3',
          category: 'process_trust',
          score: 1.9,
          status: 'verified',
          metrics: [
            {
              name: 'ci_script_depth',
              label: 'CI script depth',
              value: 2,
              max: 4,
              weight: 0.5,
            },
            {
              name: 'default_branch_ci_depth',
              label: 'Default branch CI depth',
              value: 1,
              max: 4,
              weight: 0.5,
            },
          ],
        }),
      ]),
      { cliVersion: '0.2.2' },
    );

    expect(html).toContain('Why the labels differ:');
    expect(html).toContain('verified dimension band');
    expect(html).toContain('1.9/4.0 weighted score');
    expect(html).toContain('warning numeric band');
  });

  it('warns that a tarball scan cannot measure the git-history PR proxy', () => {
    const b2 = criterion({
      id: 'B2',
      category: 'process_trust',
      score: 1.6,
      status: 'critical',
      metrics: [
        {
          name: 'pr_merge_ratio',
          label: 'Recent PR merge ratio',
          value: 0,
          max: 1,
          weight: 0.2,
          kind: 'ratio',
        },
      ],
    });

    const tarballHtml = renderWitanHtmlReport(reportFixture([b2]), {
      cliVersion: '0.2.2',
    });
    const cloneHtml = renderWitanHtmlReport(
      reportFixture([b2], { headSha: '0123456789abcdef0123456789abcdef01234567' }),
      { cliVersion: '0.2.2' },
    );

    expect(tarballHtml).toContain('Git history was unavailable');
    expect(tarballHtml).toContain('displayed zero may undercount B2');
    expect(tarballHtml).toContain('Re-scan a full Git clone');
    expect(cloneHtml).not.toContain('Git history was unavailable');
  });

  it('does not double the trailing word of a metric label with its own unit', () => {
    const b2 = criterion({
      id: 'B2',
      category: 'process_trust',
      metrics: [
        {
          name: 'pr_merge_ratio',
          label: 'Recent PR merge ratio',
          value: 0,
          max: 1,
          weight: 0.2,
          kind: 'ratio',
          unit: 'ratio',
        },
      ],
    });
    const [metric] = b2.metrics;
    if (!metric) throw new Error('fixture must supply a metric');

    // formatCertificateMetricValue is what every renderer (HTML/Markdown/terminal) composes
    // with the label as "<label>: <value>" or "<label> <value>" — assert directly on it so this
    // test fails on the doubling regardless of a given renderer's separator/markup.
    expect(formatCertificateMetricValue(b2, metric)).toBe('0/1');
    expect(formatCertificateMetricValue(b2, metric)).not.toContain('ratio');

    const markdown = renderWitanMarkdownReport(reportFixture([b2]));
    expect(markdown).toContain('Recent PR merge ratio: 0/1 |');
    expect(markdown).not.toContain('ratio: 0/1 ratio');
  });

  it('carries the CLI version in HTML and Markdown alike, so a stale cached CLI is visible in either format', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })]);

    const html = renderWitanHtmlReport(report, { cliVersion: '0.2.2' });
    const markdown = renderWitanMarkdownReport(report, { cliVersion: '0.2.2' });

    expect(html).toContain('Cejel 0.2.2');
    expect(markdown).toContain('- CLI: Cejel 0.2.2');
  });

  it('marks the CLI version as not recorded rather than silently omitting it when unset', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })]);

    expect(renderWitanHtmlReport(report)).toContain('Not recorded');
    expect(renderWitanMarkdownReport(report)).toContain('- CLI: Not recorded');
  });

  it('elevates the term tooltip so it never blends into the page behind it', () => {
    const html = renderWitanHtmlReport(reportFixture([criterion({ id: 'A1', category: 'code_trust' })]));

    const rule = html.match(/\.term-tooltip\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const declarations = rule?.[1] ?? '';

    const zIndex = Number(declarations.match(/z-index:\s*(\d+)/)?.[1]);
    expect(zIndex).toBeGreaterThanOrEqual(100);

    // A real elevation shadow, not just a hairline border, is what keeps the tooltip from
    // reading as part of the surface behind it.
    expect(declarations).toMatch(/box-shadow:\s*[^;]*rgba?\([^)]+\)/);

    // Reported by an external reviewer on 0.4.2: the tooltip "looks great but is hard to read
    // over the background text." Text-on-background contrast turned out fine (measured below);
    // the z-index/shadow above were the actual fix. This assertion locks in that the text color
    // stays at AAA contrast (>= 7:1) against the tooltip's own background regardless.
    const tooltipBackground = declarations.match(/background:\s*(#[0-9a-fA-F]{6})/)?.[1];
    const textColor = html.match(/--text:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(tooltipBackground).toBeDefined();
    expect(textColor).toBeDefined();
    const ratio = contrastRatio(textColor as string, tooltipBackground as string);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it('wraps tooltip text that has nowhere else to break, instead of overflowing the box', () => {
    // Reported by an external reviewer (Tom): the dark tooltip box renders, but text runs past
    // its edge. white-space: normal only creates break opportunities at spaces and hyphens -- a
    // single unbroken token (a commit SHA, a file path, a metric identifier) wider than the
    // tooltip's fixed width has nowhere else to break and overflows the box it's drawn on.
    const html = renderWitanHtmlReport(reportFixture([criterion({ id: 'A1', category: 'code_trust' })]));
    const rule = html.match(/\.term-tooltip\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const declarations = rule?.[1] ?? '';
    // overflow-wrap (anywhere/break-word) is what forces a break inside an unbreakable token
    // itself; white-space: normal alone cannot. overflow-wrap is inherited, so this single
    // declaration on .term-tooltip also covers any inline code/mono child a tooltip gains later,
    // the same way the page's existing `code { overflow-wrap: anywhere }` rule already does.
    expect(declarations).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);

    // Reproduce the actual failure surface through the real rendering pipeline, not just the
    // CSS in isolation. Today's curated CERTIFICATE_GLOSSARY text never contains an unbreakable
    // token -- but glossaryEntryForMetric's fallback (any metric name outside the glossary)
    // passes an arbitrary, schema-legal metric.description straight into a tooltip, and that
    // field permits up to 300 characters with no whitespace requirement
    // (WitanCriterionMetricSchema). A commit SHA or file path is exactly the shape both the
    // reporter's hypothesis and the schema allow.
    // Alphanumeric and underscore only, deliberately: no space, hyphen, slash, or dot -- none
    // of which this token contains -- so there is no CSS soft-break opportunity anywhere in it
    // without overflow-wrap. A hyphen or slash would already be breakable under plain
    // white-space: normal in most engines and would understate what this test needs to prove.
    const longUnbrokenToken =
      '9b3ef1d0f73cdb0ef7c2506a3d4e223c89647406_witan_anunusuallylongevidenceidentifierwithnobreakablecharactersanywhereinit';
    const withUnbrokenToken = renderWitanHtmlReport(
      reportFixture([
        criterion({
          id: 'A1',
          category: 'code_trust',
          metrics: [
            {
              name: 'not_in_the_curated_glossary',
              label: 'Evidence provenance depth',
              value: 2,
              max: 4,
              weight: 1,
              unit: 'signals',
              description: `Derived from ${longUnbrokenToken}`,
            },
          ],
        }),
      ]),
    );
    expect(withUnbrokenToken).toContain(longUnbrokenToken);
    const tooltipCarriesToken = new RegExp(`<span class="term-tooltip"[^>]*>[^<]*${longUnbrokenToken}`);
    expect(withUnbrokenToken).toMatch(tooltipCarriesToken);
  });
});
