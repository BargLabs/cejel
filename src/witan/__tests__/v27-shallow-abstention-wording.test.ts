import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { runWitanFreeCli } from '../../index.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { renderWitanBadgeEndpoint, renderWitanBadgeSvg } from '../badge.js';
import { SHALLOW_HISTORY_FETCH_INSTRUCTION, WITAN_V27_SHALLOW_HISTORY_REASON } from '../history-depth.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildMatrixOrigin, cloneRepository, scanRepository } from './fixtures/shallow-history-matrix.js';

// A v27 scan of a shallow clone has source; what it lacks is the history. Every surface that names
// the abstention says "unrated: shallow clone", as the badge does, and never "insufficient source",
// which would tell the reader the repository has nothing to rate. The machine verdict in
// report.json stays `insufficient_source` (format stability); only the presentation changes. The
// gate message a quiet CI run prints carries the instruction to fetch the history, since with
// --quiet it is the only line the run shows.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const LABEL = 'Unrated: shallow clone';
const scratch: string[] = [];
let shallowPath = '';
let report: WitanReport;

beforeAll(() => {
  shallowPath = cloneRepository(buildMatrixOrigin('mixed', 'ci-and-template'), 1);
  report = scanRepository(shallowPath, V27);
}, 300_000);

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

function outDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-v27-shallow-wording-'));
  scratch.push(dir);
  return join(dir, name);
}

describe('v27 on a shallow clone is labelled "unrated: shallow clone" everywhere, never "insufficient source"', () => {
  it('report.json keeps the machine verdict insufficient_source', () => {
    expect(report.verdict).toBe('insufficient_source');
    expect(report.verdict === 'insufficient_source' && report.insufficientSourceReason).toBe(WITAN_V27_SHALLOW_HISTORY_REASON);
  });

  it('summary.json', () => {
    const summary = buildWitanCliSummary(report);
    expect(summary.verdict).toBe(LABEL);
    expect(JSON.stringify(summary)).not.toMatch(/insufficient source/i);
  });

  it('the terminal certificate', () => {
    const terminal = renderTerminalCertificate(buildWitanCliSummary(report), report);
    expect(terminal).toContain(`${LABEL} — no composite score and no verdict.\n  ${WITAN_V27_SHALLOW_HISTORY_REASON}\n`);
    expect(terminal).not.toMatch(/insufficient source/i);
    // The history-limitation heading must not say the scan was "scored as usual": it was not scored.
    expect(terminal).not.toContain('scored as usual');
  });

  it('certificate.html', () => {
    const html = renderWitanHtmlReport(report);
    expect(html).toContain(`<div class="verdict">${LABEL}</div>`);
    expect(html).not.toMatch(/insufficient source/i);
  });

  it('the Markdown report', () => {
    const markdown = renderWitanMarkdownReport(report);
    expect(markdown).toContain(`- Verdict: ${LABEL} — ${WITAN_V27_SHALLOW_HISTORY_REASON}`);
    expect(markdown).not.toMatch(/insufficient source/i);
  });

  it('the badge', () => {
    expect(renderWitanBadgeEndpoint(report)).toMatchObject({ message: 'unrated: shallow clone', color: 'lightgrey' });
    expect(renderWitanBadgeSvg(report)).toContain('unrated: shallow clone');
  });

  it('the --min-score gate under --quiet names the shallow clone and carries the fetch instruction', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const out = outDir('gated');
      expect(await runWitanFreeCli(['scan', shallowPath, '--out', out, '--quiet', '--rubric-pin', V27, '--min-score', '0'])).toBe(1);
      const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain('unrated: shallow clone');
      expect(written).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
      expect(written).not.toMatch(/insufficient source/i);
      expect(stdout).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')).verdict).toBe(LABEL);
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
  }, 120_000);

  it('v17 on the same shallow clone is still scored, with its usual history-limitation heading', () => {
    const v17 = scanRepository(shallowPath, V17);
    expect(v17.verdict).not.toBe('insufficient_source');
    const terminal = renderTerminalCertificate(buildWitanCliSummary(v17), v17);
    expect(terminal).toContain('HISTORY LIMITATION — scored as usual, but some criteria read truncated history:');
  });
});
