// #612 guard, part 3 (settling-criteria-disclosure-budget-612.test.ts): fixtures that reach an A2,
// A3 or A5 producer at its reviewed `most`, where no settling-evidence, build-step or Git LFS
// fixture did. Each REVIEWED producer names the fixture that reaches it (`reachedBy`), so making its
// site write one disclosure more moves a scored report. Synthetic: no fixture derives from any real
// repository.

import { buildBehaviourFixture } from './behaviour-corpus.js';
import { disclosureGapFixture } from './disclosure-gap-fixtures.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './shallow-a2-shapes.js';

export interface SettlingBudgetFixture {
  /** The name REVIEWED's `reachedBy` uses. */
  readonly name: string;
  /** The producer it reaches, and how. */
  readonly purpose: string;
  /** Builds the repository to scan and returns its path. */
  readonly build: () => string;
}

export const SETTLING_BUDGET_FIXTURES: readonly SettlingBudgetFixture[] = [
  {
    name: 'a2-scored-with-set-aside',
    purpose:
      "A2 scored (a committed env file beside a .gitignore .env rule, no confirmed secret) with documentation placeholders set aside: collectA2IsolationEvidence's scored return carries the placeholder sentence, its one collector disclosure.",
    build: () =>
      buildBehaviourFixture({
        name: 'a2-scored-with-set-aside',
        purpose: 'settling-criteria disclosure budget',
        files: disclosureGapFixture('a2-doc-example-pair-in-committed-env-file').files,
      }),
  },
  {
    name: 'a2-set-aside-treeless-clone',
    purpose:
      "A2 not applicable with a placeholder set aside, on a complete-depth treeless clone: the history reads cannot fetch the first commit's tree, so every rubric before v27 keeps A2 not applicable and adds the history-applicability sentence, two collector disclosures. v27 abstains on the incomplete read.",
    build: () => {
      const origin = buildA2HistoryOrigin('settling-budget-treeless', [
        { write: disclosureGapFixture('a2-not-applicable-with-set-aside').files },
        { write: { 'CHANGELOG.md': '# Changelog\n' } },
      ]);
      return cloneShallowA2Origin(origin, 'treeless');
    },
  },
];

/** Removes what the treeless fixture built beside its clone (its origin). */
export function removeSettlingBudgetFixtures(): void {
  removeShallowA2Fixtures();
}
