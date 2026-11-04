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
  | 'not-read'
  | 'score-not-given'
  | 'imported-status'
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

/**
 * Why an area was not fully read, as its check-next advice sees it (#654 review, should-fix 2): the
 * files it reads could not be read ('unreadable'), are Git LFS pointers ('lfs'), could not be read
 * for more than one counted cause ('read-failure'), were left out under Cejel's own size limit or
 * rules ('stated-limit'), or a scan limitation names the area ('limit'); 'mixed' is more than one
 * of these. Each is qualified by the area's own cause, never by the report-wide counts alone.
 */
export const PLAIN_READ_GAP_FILE_ADVICE = ['unreadable', 'lfs', 'read-failure', 'stated-limit', 'limit', 'mixed'] as const;
export type PlainReadGapFileAdvice = (typeof PLAIN_READ_GAP_FILE_ADVICE)[number];

/**
 * The not-read qualifiers: a file advice alone, a shallow clone alone ('history'), another history
 * limitation alone ('history-other'), or a file advice with a shallow clone ('<advice>-and-history').
 * A file advice with another history limitation takes the file advice alone: no table line covers
 * the other history limitation, which the area's own sentence still names.
 */
export const PLAIN_READ_GAP_QUALIFIERS = [
  ...PLAIN_READ_GAP_FILE_ADVICE,
  'history',
  'history-other',
  ...PLAIN_READ_GAP_FILE_ADVICE.map((advice) => `${advice}-and-history` as const),
] as const;

/**
 * The kinds of insufficientSourceReason the engine produces (goal_cejel_four_question_summary_v2_2026-11-03,
 * item B). Each is recognised by its producer's fixed wording (plain-summary.ts,
 * INSUFFICIENT_SOURCE_TABLE); a reason no entry matches is 'other'. The producers:
 * repo-signals.ts (classifyRepoArchetype, the readable-source and semantic-source gates,
 * explainIgnoredScanTarget, explainNoMeasurementSourceCoverage), scoring.ts
 * (WITAN_NO_MEASUREMENT_REASON) and history-depth.ts (the two v27 history reasons).
 */
export const PLAIN_INSUFFICIENT_SOURCE_KINDS = [
  'empty',
  'ignored-target',
  'generated-only',
  'independent-catalog',
  'docs-source-role',
  'artifact-dominance',
  'binary-distribution',
  'docs-distribution',
  'readable-representation',
  'semantic-auxiliary-only',
  'semantic-auxiliary-dominant',
  'unrecognised-ecosystem',
  'no-measurement',
  'no-measurement-source-coverage',
  'shallow-history',
  'history-depth-unknown',
] as const;
export type PlainInsufficientSourceKind = (typeof PLAIN_INSUFFICIENT_SOURCE_KINDS)[number] | 'other';

/** The criteria whose notes can carry a "cannot be settled from static evidence" sentence. */
export const SETTLING_CRITERIA = ['A2', 'A3', 'A5'] as const;

export const NEXT_CHECK_FALLBACK_PREFIX = 'See ';

const FULL_CLONE =
  'scan a full clone (run git fetch --unshallow, or set fetch-depth: 0 in actions/checkout)';

const FULL_CLONE_SENTENCE = `${FULL_CLONE.charAt(0).toUpperCase()}${FULL_CLONE.slice(1)}`;
const LFS_PULL = 'Run git lfs pull so the real file contents are present, then scan again.';
const STATED_LIMIT =
  'Nothing in the repository stops these files being read: Cejel leaves them out under its own size limit or rules. If what this area would read in them matters, look at those files yourself.';
const LIMIT_LISTED =
  'Read the limit listed under Reading the repository; where it names something in the repository you can change, change it and scan again.';
const MIXED_CAUSES =
  'Each cause named here needs its own step: fix what stopped files being read (the certificate below counts them by cause), then scan again; a file left out under Cejel\'s size limit or rules needs no fix.';

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
  // v2 (#635 review): an area with no measurement is not always missing files, so this line no
  // longer sends the reader to check that files are present and readable.
  'not-measured': "Read this area's notes in the certificate below to see why it has no measurement.",
  // #654 review, should-fix 2: each line follows the area's own cause. A Git LFS pointer takes the
  // same line as the Files not read item; a stated limit is never called unreadable or told to be
  // made readable.
  'not-read:unreadable':
    'Make the files that could not be read readable (the certificate below counts them by cause), then scan again.',
  'not-read:lfs': LFS_PULL,
  'not-read:read-failure':
    'Look at the files the certificate below counts by cause and fix what stopped each one being read, then scan again.',
  'not-read:stated-limit': STATED_LIMIT,
  'not-read:limit': LIMIT_LISTED,
  'not-read:mixed': MIXED_CAUSES,
  'not-read:history': `${FULL_CLONE_SENTENCE}, then scan again.`,
  'not-read:unreadable-and-history': `Make the files that could not be read readable and ${FULL_CLONE}, then scan again.`,
  'not-read:lfs-and-history': `Run git lfs pull so the real file contents are present and ${FULL_CLONE}, then scan again.`,
  'not-read:read-failure-and-history': `Fix what stopped each file the certificate below counts by cause being read and ${FULL_CLONE}, then scan again.`,
  'not-read:stated-limit-and-history': `${FULL_CLONE_SENTENCE}, then scan again. ${STATED_LIMIT}`,
  'not-read:limit-and-history': `${FULL_CLONE_SENTENCE}, then scan again. ${LIMIT_LISTED}`,
  'not-read:mixed-and-history': `${FULL_CLONE_SENTENCE}, then scan again. ${MIXED_CAUSES}`,
  'score-not-given':
    "Fix the problem listed under What is wrong, and read this area's notes in the certificate below for why it has no score.",
  'imported-status':
    "Look at the imported findings in this area's card in the certificate below; they, not Cejel's own reading, set its label.",
  'no-evidence': 'Supply the evidence this area asks for, then scan again; until then it counts as zero.',
  'no-measurement':
    'Treat this area as unchecked; the certificate below shows what was recorded for it.',
  // No overall result, keyed by the kind of reason the report gives (v2 item B). A reason of no
  // known kind ('abstention:other') falls back to the summary panel.
  'abstention:empty': 'Point Cejel at a folder whose files are committed to Git, then scan again.',
  'abstention:ignored-target':
    'Scan a folder that Git tracks, or add this folder to version control on purpose, then scan again.',
  'abstention:generated-only':
    'Point Cejel at the source written by hand rather than at generated, vendored or built output, then scan again.',
  'abstention:independent-catalog':
    "Scan one product's folder rather than a collection of separate exercises or solutions, then scan again.",
  'abstention:docs-source-role': 'Point Cejel at a repository that holds product source code, then scan again.',
  'abstention:artifact-dominance': 'Point Cejel at a repository that holds product source code, then scan again.',
  'abstention:binary-distribution':
    "Scan the tool's source instead, or give Cejel a scanner's output file with --ingest.",
  'abstention:docs-distribution': 'Point Cejel at a repository that holds product source code, then scan again.',
  'abstention:readable-representation':
    'Check that the source files are plain text (not compressed, minified into one line, or binary), then scan again.',
  'abstention:semantic-auxiliary-only':
    "Point Cejel at the product's code rather than translation, style, package-recipe or redirect files, then scan again.",
  'abstention:semantic-auxiliary-dominant':
    "Point Cejel at the product's code rather than translation, style, package-recipe or redirect files, then scan again.",
  'abstention:unrecognised-ecosystem':
    "Cejel does not read this language yet; to assess the code, give Cejel a scanner's output file with --ingest.",
  'abstention:no-measurement':
    'Check that the repository holds the files Cejel reads (tests, CI workflows, dependency files), then scan again.',
  'abstention:no-measurement-source-coverage':
    'Check that the repository holds source files in a language Cejel reads, outside generated or vendored folders, then scan again.',
  'abstention:shallow-history':
    'Run git fetch --unshallow (or check out with fetch-depth: 0 in actions/checkout), then scan again.',
  'abstention:history-depth-unknown':
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
  'lfs-pointers': LFS_PULL,
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
    ...PLAIN_READ_GAP_QUALIFIERS.map((qualifier) => ({ kind: 'not-read' as const, qualifier })),
    ...[...PLAIN_INSUFFICIENT_SOURCE_KINDS, 'other'].map((qualifier) => ({ kind: 'abstention' as const, qualifier })),
    ...PLAIN_DISCLOSURE_KINDS.map((qualifier) => ({ kind: 'disclosure' as const, qualifier })),
    ...SETTLING_CRITERIA.map((qualifier) => ({ kind: 'settling' as const, qualifier })),
    ...(
      [
        'unrecognised-status',
        'score-not-given',
        'imported-status',
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
