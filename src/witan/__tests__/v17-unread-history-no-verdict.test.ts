import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { handleCejelHttpRequest } from '../../http/server.js';
import { runWitanFreeCli } from '../../index.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { renderWitanBadgeEndpoint } from '../badge.js';
import { SHALLOW_HISTORY_FETCH_INSTRUCTION, WITAN_V27_SHALLOW_HISTORY_REASON } from '../history-depth.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { rubricBehaviourFingerprint } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { criterionOf } from './fixtures/shallow-history-matrix.js';
import {
  type UnreadHistoryCase,
  buildUnreadHistoryCases,
  removeUnreadHistoryFixtures,
} from './fixtures/unread-history-cases.js';

// Operator ruling of 2 Nov (goal_cejel_v17_unread_history_no_verdict_2026-11-02): under every
// rubric, a scan whose git history Cejel could not read gives no composite and no verdict, as v27
// has done for a shallow clone since the ruling of 1 Nov. Under the default v17 rubric that now
// covers a shallow clone and a checkout whose history depth cannot be read; under every rubric,
// v27 included, a directory with no .git. Each criterion is still read and shown, a confirmed
// critical A2 finding in the checked-out tree is still reported, and a complete clone is scored
// exactly as before, byte for byte.
//
// Measured before the change on these fixtures (v17): the depth-1 clone of the C1 shape (a secret
// committed and later deleted, beside a data layer) scored overall 2.5, Conditional, A2 warning
// 2.8; the full clone of the same commit scored 2.4, At risk, A2 critical 1.4. A --min-score 2.45
// gate passed the shallow clone and failed the full one.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const ACTION_RUNNER_URL = pathToFileURL(fileURLToPath(new URL('../../../action/run.mjs', import.meta.url))).href;

let cases: UnreadHistoryCase[];
const reports = new Map<string, WitanReport>();
const caseOf = (label: string) => cases.find((entry) => entry.label === label)!;
const reportOf = (label: string, rubric: string): WitanReport => {
  const key = `${label}\u0000${rubric}`;
  let report = reports.get(key);
  if (!report) {
    report = caseOf(label).scan(rubric);
    reports.set(key, report);
  }
  return report;
};
const sha256 = (report: WitanReport) => createHash('sha256').update(JSON.stringify(report)).digest('hex');
const labelOf = (report: WitanReport) => buildWitanCliSummary(report).verdict;

/** The Action's outputs for a report, as run.mjs writes them from summary.json. */
function actionOutputs(report: WitanReport): Map<string, string> {
  const evaluation = `
    import { renderActionOutputs } from ${JSON.stringify(ACTION_RUNNER_URL)};
    const summary = JSON.parse(Buffer.from(process.env.CEJEL_ACTION_SUMMARY, 'base64').toString('utf8'));
    process.stdout.write(renderActionOutputs(summary));
  `;
  const rendered = execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CEJEL_ACTION_SUMMARY: Buffer.from(JSON.stringify(buildWitanCliSummary(report))).toString('base64'),
    },
  });
  const outputs = new Map<string, string>();
  const pattern = /^([a-z-]+)<<(cejel_[0-9a-f-]+)\n([\s\S]*?)\n\2\n/gm;
  for (const match of rendered.matchAll(pattern)) outputs.set(match[1]!, match[3]!);
  return outputs;
}

function expectUnrated(report: WitanReport, label: string, expectedLabel: string, instruction: string): void {
  expect(report.verdict, label).toBe('insufficient_source');
  expect(report.overallScore, label).toBeNull();
  expect(report.codeTrustScore, label).toBeNull();
  expect(report.processTrustScore, label).toBeNull();
  expect(labelOf(report), label).toBe(expectedLabel);
  expect(report.insufficientSourceReason, label).toContain('no composite score and no verdict');
  expect(report.insufficientSourceReason, label).toContain(instruction);
  // Each criterion is still read and shown.
  expect(report.criteria.length, label).toBeGreaterThanOrEqual(11);
  expect(
    report.criteria.some(({ status }) => status !== 'not_applicable' && status !== 'insufficient_data'),
    label,
  ).toBe(true);
  // A workflow gating on the Action's `limited` output sees it.
  const outputs = actionOutputs(report);
  expect(outputs.get('limited'), label).toBe('true');
  expect(Number(outputs.get('limitation-count')), label).toBeGreaterThanOrEqual(1);
  const limitations = JSON.parse(outputs.get('limitations') ?? '[]') as string[];
  expect(limitations.some((entry) => entry.startsWith(`${expectedLabel}:`)), label).toBe(true);
}

const SHALLOW_INSTRUCTION = 'git fetch --unshallow';
const DEPTH_INSTRUCTION = 'git rev-parse --is-shallow-repository';
const NO_GIT_INSTRUCTION = 'an uploaded snapshot or archive carries no history';
const ALL_HISTORY_CLAIM = 'covers all reachable git history';

beforeAll(() => {
  cases = buildUnreadHistoryCases();
}, 300_000);

afterAll(() => removeUnreadHistoryFixtures());

describe('v17 on a shallow clone: no composite, no verdict, and how to fetch the history', () => {
  it.each(['mixed history, depth 1', 'mixed history, depth 12', 'data layer clean, depth 1', '#556 deleted .env, depth 1'])(
    '%s',
    (label) => {
      const report = reportOf(label, V17);
      expectUnrated(report, label, 'Unrated: shallow clone', SHALLOW_INSTRUCTION);
      expect(report.insufficientSourceReason).toContain('(reason: shallow_history)');
      // A2 abstains, as v27's A2 does, with its shallow-clone note.
      const a2 = criterionOf(report, 'A2');
      expect(a2.status, label).toBe('insufficient_data');
      expect(a2.notes ?? '', label).toMatch(/^A2 abstained: this repository is a shallow clone/);
    },
  );

  it.each(['C1 secret deleted, depth 1, git missing', 'mixed history, depth 1, corrupt HEAD'])(
    'with a history read failure: %s',
    (label) => {
      const report = reportOf(label, V17);
      expectUnrated(report, label, 'Unrated: shallow clone', SHALLOW_INSTRUCTION);
      const a2 = criterionOf(report, 'A2');
      expect(a2.status, label).toBe('insufficient_data');
      expect(a2.notes ?? '', label).toMatch(new RegExp(`^${WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX}`));
    },
  );

  it.each(['mixed history, dangling .git symlink', 'mixed history, .git file with missing gitdir'])(
    'with an unknown history depth: %s',
    (label) => {
      const report = reportOf(label, V17);
      expectUnrated(report, label, 'Unrated: history depth unknown', DEPTH_INSTRUCTION);
      expect(report.insufficientSourceReason).toContain('(reason: history_depth_unknown)');
    },
  );

  it('names the rubric it ran under, never v27, and keeps v27\'s own reason byte for byte', () => {
    const v17 = reportOf('mixed history, depth 1', V17).insufficientSourceReason ?? '';
    expect(v17.startsWith(`Under ${V17} Cejel gives no composite score and no verdict`)).toBe(true);
    expect(v17).not.toContain('v27');
    expect(v17.endsWith(SHALLOW_HISTORY_FETCH_INSTRUCTION)).toBe(true);
    expect(reportOf('mixed history, depth 1', V27).insufficientSourceReason).toBe(WITAN_V27_SHALLOW_HISTORY_REASON);
    // v27's 1 Nov reason, as committed before the reasons took the rubric id.
    expect(WITAN_V27_SHALLOW_HISTORY_REASON).toBe(
      'Under witan-rubric-v27-prospective-2026-10-19 Cejel gives no composite score and no verdict for a ' +
        'shallow clone (reason: shallow_history). A2 and B2 read commit history, and a composite over a ' +
        "truncated history could fall below the same commit's composite over its full history. Each " +
        "criterion's reading is still shown. " +
        SHALLOW_HISTORY_FETCH_INSTRUCTION,
    );
  });

  it('the CLI output, the Markdown, the certificate and the badge carry the label and the instruction', () => {
    const report = reportOf('mixed history, depth 1', V17);
    const terminal = renderTerminalCertificate(buildWitanCliSummary(report), report);
    expect(terminal).toContain('Unrated: shallow clone — no composite score and no verdict.');
    expect(terminal).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
    expect(terminal).not.toMatch(/Overall: /);
    expect(renderWitanMarkdownReport(report)).toContain(`- Verdict: Unrated: shallow clone — ${report.insufficientSourceReason}`);
    expect(renderWitanHtmlReport(report)).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
    expect(renderWitanBadgeEndpoint(report).message).toBe('unrated: shallow clone');
  });
});

describe('v17, the C1 shape: a secret committed and later deleted', () => {
  it('the full clone is scored as before: A2 critical, overall 2.4, At risk', () => {
    const full = reportOf('C1 secret deleted, full', V17);
    expect(criterionOf(full, 'A2').status).toBe('critical');
    expect(full.overallScore).toBe(2.4);
    expect(full.verdict).toBe('at_risk');
  });

  it('the depth-1 clone no longer scores above the full clone: it is Unrated', () => {
    const shallow = reportOf('C1 secret deleted, depth 1', V17);
    expectUnrated(shallow, 'C1 depth 1', 'Unrated: shallow clone', SHALLOW_INSTRUCTION);
    expect(criterionOf(shallow, 'A2').status).not.toBe('verified');
  });

  it('--min-score refuses the shallow clone rather than passing it', async () => {
    const out = (name: string) => join(mkdtempSync(join(tmpdir(), 'cejel-v17-unread-cli-')), name);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const path = caseOf('C1 secret deleted, depth 1').path;
      expect(await runWitanFreeCli(['scan', path, '--out', out('gated'), '--quiet', '--min-score', '2.45'])).toBe(1);
      const printed = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(printed).toContain('unrated: shallow clone');
      expect(printed).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
      // Without --min-score the abstained scan exits 0, as every abstention does.
      expect(await runWitanFreeCli(['scan', path, '--out', out('plain'), '--quiet'])).toBe(0);
    } finally {
      stderr.mockRestore();
    }
  }, 120_000);
});

describe('no .git, under v17 and v27', () => {
  it.each(
    ['C1 secret deleted, no .git', 'mixed history, no .git', '#556 deleted .env, no .git'].flatMap((label) =>
      [V17, V27].map((rubric) => [label, rubric] as const),
    ),
  )('%s under %s', (label, rubric) => {
    const report = reportOf(label, rubric);
    expectUnrated(report, label, 'Unrated: no git history', NO_GIT_INSTRUCTION);
    expect(report.insufficientSourceReason).toContain('(reason: no_git_history)');
    const a2 = criterionOf(report, 'A2');
    expect(a2.status, label).toBe('insufficient_data');
    expect(a2.notes ?? '', label).toContain('no_git_history');
    expect(a2.notes ?? '', label).toContain('read no commit history');
    expect(JSON.stringify(report), label).not.toContain(ALL_HISTORY_CLAIM);
    expect(renderWitanBadgeEndpoint(report).message).toBe('unrated: no git history');
  });

  it('an HTTP or remote-MCP upload is a snapshot with no history: Unrated: no git history', async () => {
    const request = new Request('https://cejel-mcp.vercel.app/api/mcp', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'scan',
          arguments: {
            format: 'json',
            files: [
              { path: 'package.json', content: '{"name":"upload","version":"1.0.0","scripts":{"test":"vitest run"}}\n' },
              { path: 'src/index.ts', content: 'export const add = (a: number, b: number): number => a + b;\n' },
              { path: 'src/index.test.ts', content: "import { expect, it } from 'vitest';\nimport { add } from './index';\nit('adds', () => expect(add(1, 2)).toBe(3));\n" },
              { path: '.gitignore', content: '.env\nnode_modules/\n' },
              { path: '.env.example', content: 'DATABASE_URL=\n' },
            ],
          },
        },
      }),
    });
    const response = await handleCejelHttpRequest(request, { packageName: '@cejel/cejel', version: '0.0.0-test' });
    expect(response.status).toBe(200);
    const text = await response.text();
    const envelope = (JSON.parse(text) as { result?: { structuredContent?: { status: string; report?: WitanReport } } })
      .result?.structuredContent;
    expect(envelope?.status).toBe('success');
    const report = envelope!.report!;
    expect(report.verdict).toBe('insufficient_source');
    expect(report.overallScore).toBeNull();
    expect(labelOf(report)).toBe('Unrated: no git history');
    expect(report.insufficientSourceReason).toContain(NO_GIT_INSTRUCTION);
    expect(criterionOf(report, 'A2').notes ?? '').toContain('no_git_history');
    expect(text).not.toContain(ALL_HISTORY_CLAIM);
  });
});

describe('a confirmed critical A2 finding in the checked-out tree is still reported critical', () => {
  it.each(
    ['secret in tree, depth 1', 'secret in tree, no .git'].flatMap((label) => [V17, V27].map((rubric) => [label, rubric] as const)),
  )('%s under %s', (label, rubric) => {
    const report = reportOf(label, rubric);
    expect(report.verdict, label).toBe('insufficient_source');
    expect(criterionOf(report, 'A2').status, label).toBe('critical');
  });
});

describe('complete clones are byte-identical under v17 and v27', () => {
  // report.json's sha256 for each complete clone, captured on origin/main 7ce3d4fa2 with this
  // file's fixtures (v17-unread-history.measure.test.ts).
  const PINS: ReadonlyArray<readonly [string, string, string]> = [
    ['C1 secret deleted, full', V17, '203c4c814ca48e81d2579319d3953bbaa82fe08f9272a543e1561299e72421fa'],
    ['C1 secret deleted, full', V27, 'f8743fa26373e9debe70cacda74713404124fa8cfccf320961bce0586c5fab47'],
    ['data layer clean, full', V17, '0c3403bada8dd7fd86cbe0cb9c15670cb5132ad67ab790f6c206dc9b1f13e6fd'],
    ['data layer clean, full', V27, '09ef927ed4053ee1ff79bdf1a703e0aa13eedc7e33c0b6352aac05c18dc9ca66'],
    ['mixed history, full', V17, 'b7b8204685e525c30c5581461eb169e9b53b34551e8a7325b87f0fea4763a0d3'],
    ['mixed history, full', V27, '00efaa4c61211b061a7b3f84c7b8d4fd080c8b743bd431b4f21d5e3900f33783'],
    ['#556 deleted .env, full', V17, 'cae61d387be9dc7f28043f76cec99b8833cc229e16dcb6cfeab9cff42a2f356e'],
    ['#556 deleted .env, full', V27, 'a030a635b6100d7d68032db2f87724bf04c82cfc798b4feb27f8758a6d9ea0a5'],
    ['secret in tree, full', V17, 'b076790994de7682117c31b2301ce1e93e59ebdcc3dd7d3bf0168bbcf88338ed'],
    ['secret in tree, full', V27, 'eca2829aee08a17a85b2f9c43b30a8591a52d39a4d9ceb5a80da372fee96100d'],
    // A complete partial clone whose history blobs are missing: a failed history read on a clone
    // whose depth reads complete. Not changed by this ruling (see the PR's "Left open" line).
    ['#556 deleted .env, missing blobs', V17, '8e28cafb789a62f45d0fd1f796c5b5d0fd4d2f36a3f48939116486f952db3bb3'],
    ['#556 deleted .env, missing blobs', V27, '98390b5da347c348f8089df14100b71e07b5fc6e9a610611d76f3d166d800782'],
  ];
  // #622 (2026-11-11): the behaviour corpus gained two specimens, so every rubric's fingerprint
  // moved and no score did. Each pin is still checked byte for byte, with only the fingerprint the
  // pin was captured under put back in place (key order unchanged).
  const FINGERPRINTS_BEFORE_622: Readonly<Record<string, string>> = {
    [V17]: 'sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4',
    [V27]: 'sha256:dfe4e7e9ba37666f60b1ebcee4eb44917110798e9038c81eef079718db9ee7b1',
  };
  it.each(PINS)('%s under %s', (label, rubric, pin) => {
    const report = reportOf(label, rubric);
    expect(report.rubricBehaviourFingerprint).toBe(rubricBehaviourFingerprint(rubric));
    expect(sha256({ ...report, rubricBehaviourFingerprint: FINGERPRINTS_BEFORE_622[rubric] })).toBe(pin);
  });
});
