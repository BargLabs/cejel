import { WITAN_ABSTENTION_LABELS } from './abstention.js';
import { WITAN_CRITERION_IDS, WITAN_TRADING_RUBRIC_V0_CRITERION_IDS } from './schemas.js';

// goal_cejel_four_question_summary_2026-11-02, item A: the "What to check next" sentence for each
// item the plain first page lists as wrong or not known. Every sentence is fixed, reviewed text,
// looked up by a key; nothing here is generated and nothing calls a model. A key with no entry gets
// the "See <section> in the certificate below." fallback, and listNextCheckFallbackKeys() names
// every such key so a test can pin the list.
//
// The sentences are first-page text: they use none of the words the card keeps off that page
// (engine words such as rubric, band or a criterion id, and assurance words such as safe or
// correct). Presentation only: no score, status, verdict or report field reads this table.

/** The kinds of item a check-next line can serve. A kind is qualified by a criterion id, an
 * abstention label or a disclosure kind where the advice depends on it. */
export type NextCheckKind =
  | 'finding'
  | 'finding-overall'
  | 'low-score'
  | 'not-applicable'
  | 'not-measured'
  | 'no-evidence'
  | 'no-measurement'
  | 'unrecognised-status'
  | 'abstention'
  | 'verdict-capped'
  | 'scan-limitation'
  | 'history-limitation'
  | 'disclosure'
  | 'settling'
  | 'coverage-not-measured'
  | 'coverage-unpublished'
  | 'git-history-unavailable'
  | 'skipped-content'
  | 'lfs-pointers'
  | 'excluded-file-types'
  | 'withheld-content';

/** Disclosure kinds the plain summary recognises by their fixed prefix (abstention.ts). */
export const PLAIN_DISCLOSURE_KINDS = [
  'placeholder-set-aside',
  'unshown-check',
  'history-applicability',
  'uncredited-ci',
  'publishing-ci',
  'lockfile-not-computed',
  'lockfile-requirement-not-determined',
  'other',
] as const;
export type PlainDisclosureKind = (typeof PLAIN_DISCLOSURE_KINDS)[number];

/** The criteria whose notes can carry a "cannot be settled from static evidence" sentence. */
export const SETTLING_CRITERIA = ['A2', 'A3', 'A5'] as const;

export const NEXT_CHECK_FALLBACK_PREFIX = 'See ';

const FULL_CLONE =
  'scan a full clone (run git fetch --unshallow, or set fetch-depth: 0 in actions/checkout)';

const NEXT_CHECKS: Readonly<Record<string, string>> = {
  // A finding in one area. Qualified by the criterion id the finding belongs to.
  'finding:A1':
    'Open the file named here and make sure the tests it points to can run and can fail; add tests where there are none.',
  'finding:A2':
    "Open the file named here: if it holds a real password, key or token, remove it, revoke it and issue a new one; if it names a data table, check how one tenant's data is kept apart from another's.",
  'finding:A3':
    'Open the file named here and add the build, health check, error handling or deployment step it says is missing.',
  'finding:A4':
    'Open the dependency file named here and fix what it describes, for example by committing the lockfile your package manager writes.',
  'finding:A5':
    'Compare what the README and other documents promise with what the code does, and keep a written record of that comparison in the repository.',
  'finding:B1': 'Check that each automated work dispatch leaves a record in the repository.',
  'finding:B2':
    'Check that changes reach the main branch through pull requests whose numbers appear in the commit messages.',
  'finding:B3': 'Check that a CI workflow runs your tests, lint or type checks on every pull request.',
  'finding:B4': 'Add or update a changelog, security policy or incident record so changes can be traced.',
  'finding:B5': 'Check that lessons from past work are recorded, with their evidence, in the repository.',
  'finding:B6':
    "Check that privileged operations (database roles, credentials, production access) need a person's approval and stop when that check is missing.",
  // An area whose measurements together scored low, with no single finding behind it.
  'finding-overall':
    "Look at this area's weakest measurements in the certificate below and add the evidence they look for.",
  'low-score':
    "Look at this area's weakest measurements in the certificate below and add the evidence they look for.",
  'not-applicable':
    'If you expected this area to apply here, read the reason given in the certificate below; Cejel did not examine it.',
  'not-measured':
    'Check that the files this area reads are in the repository and readable, then scan again.',
  'no-evidence': 'Supply the evidence this area asks for, then scan again; until then it counts as zero.',
  'no-measurement':
    'Treat this area as unchecked; the certificate below shows what was recorded for it.',
  'abstention:Insufficient source':
    'Point Cejel at a folder that holds source code in a language it reads, then scan again.',
  'abstention:Insufficient evidence':
    'Check that the repository holds the files Cejel reads (tests, CI workflows, dependency files), then scan again.',
  'abstention:Unrated: shallow clone':
    'Run git fetch --unshallow (or check out with fetch-depth: 0 in actions/checkout), then scan again.',
  'abstention:Unrated: history depth unknown':
    'Make sure git is installed and can open this repository (git rev-parse --is-shallow-repository prints true or false), then scan again.',
  'verdict-capped': `To get a result that is not lowered, ${FULL_CLONE}.`,
  'scan-limitation': 'Fix what this limit describes, for example by making the files readable, then scan again.',
  'history-limitation': `To see results over the whole history, ${FULL_CLONE} and compare.`,
  'disclosure:placeholder-set-aside':
    'Look at the values listed in the certificate below and confirm they are examples, not real credentials.',
  'disclosure:unshown-check':
    'Open the workflows named in the certificate below and confirm each one runs a test, lint or build step.',
  'disclosure:history-applicability': `Before relying on this area being out of scope here, ${FULL_CLONE}.`,
  'disclosure:uncredited-ci':
    'Open the workflows named in the certificate below; if they do run checks, make the check step visible in the workflow file.',
  'disclosure:publishing-ci':
    'If a publishing workflow should count as a check, make it run a test before it publishes, or give it a pull request trigger.',
  'disclosure:lockfile-not-computed': 'Commit the lockfile your CI expects, then scan again.',
  'disclosure:lockfile-requirement-not-determined':
    'Check whether your CI needs a lockfile; if it does, commit it, then scan again.',
  'settling:A2':
    "Check how one tenant's data is kept apart from another's outside the database, for example in the application code or the hosting setup.",
  'settling:A3': 'Check whether this package has a build or type-check step somewhere Cejel did not read.',
  'settling:A5': "Compare the documentation's claims with the code yourself; Cejel makes no finding on it.",
  'coverage-not-measured':
    'Publish a test coverage report or set a coverage threshold in the repository, then scan again.',
  'coverage-unpublished':
    'Make the coverage tool publish a percentage (a report or a threshold) in the repository, then scan again.',
  'git-history-unavailable':
    'Scan a Git clone rather than a copy of the files, so the commit history can be read.',
  'skipped-content':
    'Look at the skipped files counted in the certificate below (unreadable, too large, a denied path or not a regular file), then scan again.',
  'lfs-pointers': 'Run git lfs pull so the real file contents are present, then scan again.',
  'excluded-file-types':
    'Nothing to fix in the repository: these file types are outside what Cejel reads.',
  'withheld-content':
    'If the results that would have read the held-back files matter to you, look at those files yourself.',
};

export interface ResolvedNextCheck {
  /** The table key the line came from, or the most specific key that was looked up. */
  readonly key: string;
  readonly text: string;
  readonly fromTable: boolean;
}

function lookupKeys(kind: NextCheckKind, qualifier: string | undefined): string[] {
  return qualifier === undefined ? [kind] : [`${kind}:${qualifier}`, kind];
}

/** The table line for an item, or the fallback pointing at `section` of the certificate. */
export function resolveNextCheck(
  kind: NextCheckKind,
  qualifier: string | undefined,
  section: string,
): ResolvedNextCheck {
  const keys = lookupKeys(kind, qualifier);
  for (const key of keys) {
    const text = NEXT_CHECKS[key];
    if (text !== undefined) return { key, text, fromTable: true };
  }
  return { key: keys[0] ?? kind, text: `${NEXT_CHECK_FALLBACK_PREFIX}${section} in the certificate below.`, fromTable: false };
}

const ALL_CRITERION_IDS: readonly string[] = [...WITAN_CRITERION_IDS, ...WITAN_TRADING_RUBRIC_V0_CRITERION_IDS];

/** Every (kind, qualifier) pair buildPlainSummary can look up. */
export function nextCheckKeySpace(): ReadonlyArray<{ kind: NextCheckKind; qualifier?: string }> {
  const perCriterion: NextCheckKind[] = [
    'finding',
    'finding-overall',
    'low-score',
    'not-applicable',
    'not-measured',
    'no-evidence',
    'no-measurement',
  ];
  return [
    ...perCriterion.flatMap((kind) => ALL_CRITERION_IDS.map((qualifier) => ({ kind, qualifier }))),
    ...WITAN_ABSTENTION_LABELS.map((qualifier) => ({ kind: 'abstention' as const, qualifier })),
    ...PLAIN_DISCLOSURE_KINDS.map((qualifier) => ({ kind: 'disclosure' as const, qualifier })),
    ...SETTLING_CRITERIA.map((qualifier) => ({ kind: 'settling' as const, qualifier })),
    ...(
      [
        'unrecognised-status',
        'verdict-capped',
        'scan-limitation',
        'history-limitation',
        'coverage-not-measured',
        'coverage-unpublished',
        'git-history-unavailable',
        'skipped-content',
        'lfs-pointers',
        'excluded-file-types',
        'withheld-content',
      ] as const
    ).map((kind) => ({ kind })),
  ];
}

/** The keys with no table entry, which therefore print "See <section> in the certificate below.",
 * sorted. A qualified key whose unqualified kind has an entry is not listed: it has a line. */
export function listNextCheckFallbackKeys(): string[] {
  const fallbacks = new Set<string>();
  for (const { kind, qualifier } of nextCheckKeySpace()) {
    const keys = lookupKeys(kind, qualifier);
    if (keys.every((key) => NEXT_CHECKS[key] === undefined)) fallbacks.add(keys[0] ?? kind);
  }
  return [...fallbacks].sort();
}
