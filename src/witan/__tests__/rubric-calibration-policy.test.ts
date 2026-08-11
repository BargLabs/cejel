import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as rubricVersions from '../rubric-version.js';
import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_RUBRIC_VERSION_V17,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

describe('rubric calibration-claim policy', () => {
  it('keeps the public default on the last calibrated rubric', () => {
    expect(WITAN_LAST_CALIBRATED_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);
  });

  it('classifies every exported prospective rubric as explicit-only', () => {
    const exportedProspectiveRubrics = (Object.values(rubricVersions) as unknown[])
      .filter((value): value is string => typeof value === 'string')
      .filter((value) => /^witan-rubric-v\d+-prospective-/.test(value))
      .sort();

    expect([...WITAN_PROSPECTIVE_RUBRIC_VERSIONS].sort()).toEqual(exportedProspectiveRubrics);
    expect(WITAN_PROSPECTIVE_RUBRIC_VERSIONS).not.toContain(WITAN_RUBRIC_VERSION);
  });

  it('publishes the calibration scope and promotion rule', () => {
    const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
    const normalized = readme.replace(/\s+/g, ' ');

    expect(normalized).toContain('Published calibration figures apply only to that exact rubric');
    expect(normalized).toContain('Prospective rubrics inherit none of v17\'s calibration figures');
    expect(normalized).toContain('fresh authenticated untouched holdout');
  });
});
