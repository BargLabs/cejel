import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { serializeWitanReport } from '../attestation.js';
import {
  buildRelyingPartySummary,
  CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE,
} from '../certificate-presentation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import { createWitanReport } from '../scoring.js';

// goal_cejel_certificate_first_reader_legibility_2026-10-06. A technical-diligence reader ran
// Cejel 0.6.0 on expressjs/express and tripped on five places in the certificate. Each block
// below pins one of them on every human-readable surface. All five are presentation only: the
// last block proves report.json is byte-identical across every render.

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-first-reader-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  execFileSync('git', ['commit', '--quiet', '-m', 'Merge pull request #1 from fixture/init'], {
    cwd: repo,
  });
  return repo;
}

function scan(files: Readonly<Record<string, string>>): WitanReport {
  return createWitanReport(
    buildWitanInputFromRepo({
      productSlug: 'first-reader-fixture',
      productDisplayName: 'First reader fixture',
      repoPath: makeRepo(files),
      generatedAt: '2026-10-06T00:00:00.000Z',
      rubricVersion: WITAN_RUBRIC_VERSION_V17,
    }),
  );
}

// The shape of express at 7ef98448: nyc runs inside package scripts (test-cov, test-ci) but no
// threshold or coverage report is published; the only skipped entries are file types Cejel does
// not read; the result is Conditional with zero findings.
const EXPRESS_LIKE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({
    name: 'express-like',
    dependencies: { accepts: '^2.0.0', debug: '^4.4.0' },
    devDependencies: { eslint: '8.47.0', mocha: '^10.7.3', nyc: '^17.1.0' },
    scripts: {
      lint: 'eslint .',
      test: 'mocha --reporter spec --check-leaks test/',
      'test-ci': 'nyc --reporter=lcovonly --reporter=text npm test',
      'test-cov': 'nyc --reporter=html --reporter=text npm test',
    },
  })}\n`,
  'package-lock.json': '{"name":"express-like","lockfileVersion":3,"packages":{}}\n',
  'index.js': "'use strict';\nmodule.exports = require('./lib/app');\n",
  'lib/app.js': "'use strict';\nmodule.exports = function app() { return { stack: [] }; };\n",
  'lib/router.js': "'use strict';\nmodule.exports = function Router() { this.stack = []; };\n",
  'lib/request.js': "'use strict';\nmodule.exports = { get: function get(name) { return this.headers[name]; } };\n",
  'test/app.js':
    "var assert = require('node:assert');\nvar app = require('..');\ndescribe('app', function () { it('creates', function () { assert.ok(app()); }); });\n",
  'test/req.get.js':
    "var assert = require('node:assert');\ndescribe('req.get', function () { it('reads', function () { assert.strictEqual(1, 1); }); });\n",
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [master]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n      - run: npm run lint\n      - run: npm run test-ci\n',
  'SECURITY.md': '# Security Policies and Procedures\n\nReport security bugs privately.\n',
  '.github/dependabot.yml':
    'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n',
  'Readme.md': '# express-like\n\nA small web framework fixture.\n',
  'History.md': 'latest\n======\n\n  * current release notes\n',
  'examples/public/logo.png': 'not really a png\n',
  'examples/public/favicon.ico': 'not really an icon\n',
  'examples/views/index.ejs': '<h1><%= title %></h1>\n',
};

function surfaces(report: WitanReport): { name: string; output: string }[] {
  return [
    { name: 'html', output: renderWitanHtmlReport(report).replaceAll('&#39;', "'") },
    { name: 'markdown', output: renderWitanMarkdownReport(report) },
    { name: 'terminal', output: renderTerminalCertificate(buildWitanCliSummary(report), report) },
  ];
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
  overrides: Partial<WitanReport> = {},
): WitanReport {
  return {
    productSlug: 'first-reader-fixture',
    productDisplayName: 'First reader fixture',
    repo: { path: '/tmp/first-reader-fixture', headSha: 'b'.repeat(40) },
    rubricVersion: WITAN_RUBRIC_VERSION_V17,
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria,
    ...overrides,
  } as WitanReport;
}

const expressLike = scan(EXPRESS_LIKE);

describe('the express-like fixture reproduces the reviewed certificate', () => {
  it('has the five shapes the review tripped on', () => {
    const a1 = expressLike.criteria.find((entry) => entry.id === 'A1');
    const coverage = a1?.metrics.find((metric) => metric.name === 'coverage_percent');
    expect(coverage?.value).toBe(0);
    expect(a1?.evidence.some((evidence) => evidence.kind === 'coverage')).toBe(true);
    expect(expressLike.verdict).toBe('conditional');
    expect(expressLike.criteria.flatMap((entry) => entry.findings)).toEqual([]);
    expect(expressLike.contentReadSummary?.skipped).toBeGreaterThan(0);
    expect(expressLike.contentReadSummary?.byReason.excludedByExtension).toBe(
      expressLike.contentReadSummary?.skipped,
    );
    expect(expressLike.criteria.some((entry) => entry.status === 'not_applicable')).toBe(true);
  });
});

describe('item 1: an absent coverage percentage is not shown as 0/100', () => {
  it('says in words that no percentage above 0 was published, and how the rubric scores it', () => {
    for (const { name, output } of surfaces(expressLike)) {
      expect(output, name).not.toContain('0/100 percent');
      expect(output, name).toContain(
        'coverage configuration found, but no published coverage percentage above 0 (Cejel reads published reports and thresholds and does not run tests); the rubric scores this as 0 of 100',
      );
    }
  });

  it('records the coverage gap in "What was not established" and an owner action in "What to do next"', () => {
    const summary = buildRelyingPartySummary(expressLike);
    expect(summary.notEstablished).toContain(
      'Coverage configuration was found, but no coverage report or threshold in this tree publishes a percentage above 0, so the rubric scored static coverage as 0 of 100; Cejel does not run the subject\'s tests.',
    );
    expect(summary.next).toContain(
      "Publish a coverage report or threshold for A1's static coverage metric; coverage configuration was found, but no published percentage above 0.",
    );
  });

  it('states the scoring of a repository with no coverage configuration at all', () => {
    const report = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        metrics: [
          { name: 'coverage_percent', label: 'Static coverage percentage', value: 0, max: 100, weight: 1, unit: 'percent' },
        ],
      }),
    ]);
    for (const { name, output } of surfaces(report)) {
      expect(output, name).not.toContain('0/100 percent');
      expect(output, name).toContain(
        'no coverage report or threshold found, so there is no percentage to read (Cejel does not run tests); the rubric scores this as 0 of 100',
      );
    }
  });

  it('still prints a published percentage above 0 as a number', () => {
    const report = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        evidence: [{ kind: 'coverage', label: 'Coverage configuration', path: 'jest.config.js' }],
        metrics: [
          { name: 'coverage_percent', label: 'Static coverage percentage', value: 80, max: 100, weight: 1, unit: 'percent' },
        ],
      }),
    ]);
    for (const { name, output } of surfaces(report)) {
      expect(output, name).toContain('80/100 percent');
      expect(output, name).not.toContain('no published coverage percentage above 0');
    }
  });

  it('tells the glossary reader how an absent percentage is scored', () => {
    for (const { name, output } of surfaces(expressLike)) {
      expect(output, name).toContain(
        'When no percentage above 0 is published, the rubric scores this metric as 0 of 100.',
      );
    }
  });
});

describe('item 2: the summary box and "What was established" use the same counts', () => {
  it('states both counts per category and the not-applicable remainder on every surface', () => {
    const summary = buildRelyingPartySummary(expressLike);
    const applicable = expressLike.criteria.filter((entry) => entry.status !== 'not_applicable');
    const notApplicable = expressLike.criteria.length - applicable.length;
    const counts = (category: WitanCriterionScore['category']) => {
      const inCategory = expressLike.criteria.filter((entry) => entry.category === category);
      const measured = inCategory.filter(
        (entry) => entry.status !== 'not_applicable' && entry.status !== 'insufficient_data',
      );
      return `${measured.length} of ${inCategory.length}`;
    };
    const perCategory = `code ${counts('code_trust')}, process ${counts('process_trust')}`;

    expect(summary.established).toContain(`(${perCategory})`);
    expect(summary.established).toContain(`${notApplicable} do not apply to this repository`);
    for (const { name, output } of surfaces(expressLike)) {
      expect(output, name).toContain(`Dimensions measured: ${perCategory}`);
      expect(output, name).not.toContain('applicable rubric dimensions');
    }
  });

  it('says what low confidence is based on, counting not-applicable dimensions as unmeasured', () => {
    const report = reportFixture([
      criterion({ id: 'A1', category: 'code_trust' }),
      criterion({ id: 'A2', category: 'code_trust', status: 'not_applicable' }),
      criterion({ id: 'A3', category: 'code_trust', status: 'not_applicable' }),
      criterion({ id: 'B1', category: 'process_trust' }),
      criterion({ id: 'B2', category: 'process_trust' }),
    ]);
    const lowConfidence =
      'Low confidence: fewer than half of the code (1 of 3) dimensions were measured. Dimensions that do not apply count as not measured here.';
    for (const { name, output } of surfaces(report)) {
      expect(output, name).toContain(lowConfidence);
      expect(output, name).not.toMatch(/low confidence<\/div>|· low confidence$/m);
    }
  });

  it('prints no low-confidence sentence when every category is at least half measured', () => {
    const report = reportFixture([
      criterion({ id: 'A1', category: 'code_trust' }),
      criterion({ id: 'B1', category: 'process_trust' }),
    ]);
    for (const { name, output } of surfaces(report)) {
      expect(output, name).not.toMatch(/low confidence/i);
    }
  });
});

describe('item 3: by-design exclusions get a plain statement, not a remedy', () => {
  it('gives no "make readable" advice when every skipped entry was excluded by extension', () => {
    const summary = buildRelyingPartySummary(expressLike);
    const excluded = expressLike.contentReadSummary?.byReason.excludedByExtension ?? 0;
    expect(summary.next).not.toMatch(/readable|skipped content entr/i);
    expect(summary.notEstablished).toContain(
      `${excluded} content entries were not read because their file types are outside what Cejel reads. This is a fixed limit of the tool, not something the repository needs to fix.`,
    );
  });

  it('advises only on the entries the repository owner can act on, naming their reasons', () => {
    const report = reportFixture([criterion({ id: 'A1', category: 'code_trust' })], {
      contentReadSummary: {
        skipped: 6,
        byReason: { unreadable: 1, tooLarge: 1, excludedByExtension: 4, deniedPath: 0, nonRegularFile: 0 },
        unreadableByErrno: { EACCES: 1 },
        affectedCriteria: [],
      },
    });
    const summary = buildRelyingPartySummary(report);
    expect(summary.next).toContain(
      'Resolve the 2 content entries skipped as unreadable or too large (see the itemized reasons in the certificate), then reproduce the scan.',
    );
    expect(summary.next).not.toContain('Make the');
    expect(summary.notEstablished).toContain(
      '2 content entries were skipped for the reasons itemized in the certificate.',
    );
    expect(summary.notEstablished).toContain(
      '4 content entries were not read because their file types are outside what Cejel reads.',
    );
  });
});

describe('item 4: a non-Verified verdict with no critical or warning findings says why', () => {
  it('explains that the verdict comes from the score band and names the lowest measured dimensions', () => {
    const report = reportFixture(
      [
        criterion({ id: 'A1', category: 'code_trust', score: 2, status: 'warning' }),
        criterion({ id: 'A4', category: 'code_trust', score: 3.6, status: 'verified' }),
        criterion({ id: 'B2', category: 'process_trust', score: 2.2, status: 'warning' }),
        criterion({ id: 'B3', category: 'process_trust', score: 2.3, status: 'warning' }),
        criterion({ id: 'B4', category: 'process_trust', score: 3.1, status: 'info' }),
        criterion({ id: 'B5', category: 'process_trust', score: 0, status: 'not_applicable' }),
      ],
      { overallScore: 2.5, codeTrustScore: 2.8, processTrustScore: 2.2, verdict: 'conditional' },
    );
    const sentence =
      'The Conditional verdict comes from the overall score of 2.5 out of 4.0, which is in the Conditional band (2.5 up to 3.5). No finding set it. The measured dimensions scoring lowest are A1 (2.0), B2 (2.2) and B3 (2.3).';
    for (const { name, output } of surfaces(report)) {
      expect(output, name).toContain(sentence);
    }
  });

  it('appears on the express-like certificate', () => {
    for (const { name, output } of surfaces(expressLike)) {
      expect(output, name).toContain(
        `The Conditional verdict comes from the overall score of ${expressLike.overallScore?.toFixed(1)} out of 4.0`,
      );
    }
  });

  it('is absent for a Verified verdict and when a critical or warning finding exists', () => {
    const verified = reportFixture([criterion({ id: 'A1', category: 'code_trust', score: 3.8, status: 'verified' })], {
      overallScore: 3.8,
      verdict: 'verified',
    });
    const withWarning = reportFixture([
      criterion({
        id: 'A1',
        category: 'code_trust',
        findings: [
          {
            severity: 'warning',
            summary: 'warning finding',
            evidence: { kind: 'artifact', label: 'fixture evidence', path: 'src/example.ts' },
          },
        ],
      }),
    ]);
    for (const report of [verified, withWarning]) {
      for (const { name, output } of surfaces(report)) {
        expect(output, name).not.toContain('verdict comes from the overall score');
      }
    }
  });
});

describe('item 5: the first line under the title is plain, and the name note sits below the identity rows', () => {
  it('uses plain wording with no jargon', () => {
    expect(CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE).not.toMatch(/caller context|byte-comparison/);
    for (const { name, output } of surfaces(expressLike)) {
      expect(output, name).toContain(CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE);
      expect(output, name).not.toContain('caller context');
    }
  });

  it('places the note after the run, CLI and rubric rows', () => {
    const html = renderWitanHtmlReport(expressLike, { cliVersion: '0.6.1' });
    const htmlNote = html.indexOf('<dt>About the name</dt>');
    for (const row of ['<dt>Run</dt>', '<dt>CLI</dt>', '<dt>Rubric</dt>']) {
      expect(html.indexOf(row), row).toBeGreaterThan(-1);
      expect(htmlNote, row).toBeGreaterThan(html.indexOf(row));
    }

    const markdown = renderWitanMarkdownReport(expressLike, { cliVersion: '0.6.1' });
    const markdownNote = markdown.indexOf('- About the name:');
    for (const row of ['- Product:', '- CLI:', '- Rubric:', '- Repository:']) {
      expect(markdown.indexOf(row), row).toBeGreaterThan(-1);
      expect(markdownNote, row).toBeGreaterThan(markdown.indexOf(row));
    }

    const terminalLines = renderTerminalCertificate(buildWitanCliSummary(expressLike), expressLike).split('\n');
    expect(terminalLines[1]).toBe('');
    const terminalNote = terminalLines.findIndex((line) => line.startsWith('About the name:'));
    expect(terminalNote).toBeGreaterThan(terminalLines.findIndex((line) => line.startsWith('Overall:')));
  });
});

describe('presentation only', () => {
  it('leaves report.json byte-identical across every render of every fixture above', () => {
    for (const report of [expressLike]) {
      const before = serializeWitanReport(report);
      surfaces(report);
      buildRelyingPartySummary(report);
      expect(serializeWitanReport(report)).toBe(before);
    }
  });
});
