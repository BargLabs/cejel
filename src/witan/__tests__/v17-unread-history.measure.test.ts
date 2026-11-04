import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { criterionOf } from './fixtures/shallow-history-matrix.js';
import { buildUnreadHistoryCases, removeUnreadHistoryFixtures } from './fixtures/unread-history-cases.js';

// The before/after measurement for goal_cejel_v17_unread_history_no_verdict_2026-11-02 (item E).
// Runs only in vitest's 'measure' mode (`pnpm exec vitest run --mode measure <this file>`): it
// writes one JSON row per case and rubric (the overall score, the verdict, A2's and B2's status and
// score, and the sha256 of report.json's bytes) to a file in the temporary directory and prints its
// path. Run it on the base commit and on the change, and compare the two files: every complete
// clone's sha256 must match; the table in the PR is the shallow and no-git rows.
const measuring = import.meta.env.MODE === 'measure';
const out = join(tmpdir(), `cejel-v17-unread-measure-${Date.now()}.json`);

afterAll(() => removeUnreadHistoryFixtures());

describe.skipIf(!measuring)('unread-history measurement (vitest --mode measure)', () => {
  it('records every case under v17 and v27', () => {
    const rows = [];
    for (const entry of buildUnreadHistoryCases()) {
      for (const rubric of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27]) {
        const report = entry.scan(rubric);
        const a2 = criterionOf(report, 'A2');
        const b2 = criterionOf(report, 'B2');
        rows.push({
          label: entry.label,
          cause: entry.cause,
          rubric: rubric === WITAN_RUBRIC_VERSION_V17 ? 'v17' : 'v27',
          overall: report.overallScore,
          verdict: report.verdict,
          reason: report.verdict === 'insufficient_source' ? report.insufficientSourceReason.slice(0, 80) : null,
          a2: `${a2.status} ${a2.score}`,
          b2: `${b2.status} ${b2.score}`,
          sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'),
        });
      }
    }
    writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
    process.stdout.write(`unread-history measurement written to ${out}\n`);
    expect(rows.length).toBeGreaterThan(0);
  }, 900_000);
});
