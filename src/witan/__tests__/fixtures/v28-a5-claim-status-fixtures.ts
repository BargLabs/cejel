// goal_cejel_v28_a5_claim_status_reading_2026-11-20: synthetic repositories for v28's A5 reading. A
// limitations, status or known-issues section, or a feature-status table, in a claim source
// reconciles that source's claims. Every fixture is synthetic; none is modelled on a named
// repository.

import type { V28A1Fixture } from './v28-a1-readings-fixtures.js';

const JS_SOURCE = { 'src/index.js': 'export function add(a, b) {\n  return a + b;\n}\n' };
const README_INTRO = '# Synthetic\n\nAdds two numbers and returns the sum.\n\n## Usage\n\nCall `add(1, 2)`.\n';

/** Shapes the reading reconciles: under v28 no A5 finding, the section or table cited at its line. */
export const V28_A5_RECONCILING_FIXTURES: readonly V28A1Fixture[] = [
  {
    name: 'v28a5-known-limitations-section',
    files: {
      'README.md': `${README_INTRO}\n## Known limitations\n\n- Integers only; floats are rounded.\n- No overflow check.\n`,
      ...JS_SOURCE,
    },
  },
  {
    name: 'v28a5-feature-status-table',
    files: {
      'README.md':
        `${README_INTRO}\n## Features\n\n` +
        '| Feature | Status |\n| --- | --- |\n| Integer addition | Done |\n| Float addition | Planned |\n',
      ...JS_SOURCE,
    },
  },
  {
    name: 'v28a5-status-marks-table',
    files: {
      'README.md':
        `${README_INTRO}\n## Platforms\n\n` +
        '| Platform | Node 20 | Node 22 |\n| :-- | :-: | :-: |\n| Linux | ✅ | ✅ |\n| Windows | ✅ | ❌ |\n',
      ...JS_SOURCE,
    },
  },
  {
    name: 'v28a5-known-issues-in-top-level-doc',
    files: {
      'README.md': README_INTRO,
      'docs/known-issues.md': '# Known issues\n\nThe sum of two very large integers is not exact.\n',
      ...JS_SOURCE,
    },
  },
];

/** Shapes the reading does not reconcile: under v28 the finding fires as under v27. */
export const V28_A5_NOT_RECONCILING_FIXTURES: readonly V28A1Fixture[] = [
  {
    name: 'v28a5-status-heading-empty',
    files: { 'README.md': `# Synthetic\n\nAdds two numbers.\n\n## Status\n\n## Usage\n\nCall \`add(1, 2)\`.\n`, ...JS_SOURCE },
  },
  {
    name: 'v28a5-ordinary-table',
    files: {
      'README.md':
        `${README_INTRO}\n## Options\n\n` +
        '| Option | Default | Meaning |\n| --- | --- | --- |\n| `base` | `10` | The radix |\n| `strict` | `false` | Reject floats |\n',
      ...JS_SOURCE,
    },
  },
  {
    name: 'v28a5-nested-limitations-only',
    files: {
      'README.md': README_INTRO,
      'docs/nested/limitations.md': '# Limitations\n\n- Integers only.\n- No overflow check.\n',
      ...JS_SOURCE,
    },
  },
  {
    name: 'v28a5-status-heading-in-code-fence',
    files: {
      'README.md': `${README_INTRO}\n\`\`\`markdown\n## Status\n\n| Feature | Status |\n| --- | --- |\n| add | Done |\n\`\`\`\n`,
      ...JS_SOURCE,
    },
  },
];

export const V28_A5_FIXTURES: readonly V28A1Fixture[] = [
  ...V28_A5_RECONCILING_FIXTURES,
  ...V28_A5_NOT_RECONCILING_FIXTURES,
];
