import { createHash } from 'node:crypto';

import type {
  WitanIngestProvenance,
  WitanInputBinding,
  WitanInputBindingRecord,
  WitanInputBindingStatus,
} from './schemas.js';

import { sanitizePresentationLine, stripTerminalControls } from '../presentation-safety.js';

// INPUT BINDING — is an ingested scanner document about the thing this certificate is about?
//
// An ingested SARIF, Scorecard or generic document is evidence about SOME repository at SOME
// commit, observed at SOME time, by SOME producer. Before this module, Cejel read none of that:
// a Scorecard result for another repository, for an older commit, or from a run long before the
// scanned revision existed was folded into the scores exactly like a matching one, and the
// certificate called it `operator_supplied`. Attribution named the tool, never the subject.
//
// This module reads whatever subject and producer identity the format itself carries, compares it
// to the scanned revision, and records the result per input. Recording only: under the default
// policy nothing here can reach a score, a status or an abstention (the record is attached after
// scoring, like historyLimitations). `--strict-ingest` refuses mismatched, stale and duplicate
// inputs before scoring. The comparison is deterministic and offline: freshness is measured
// against the scanned HEAD commit's committer time, never against the wall clock, so two runs of
// one version on one revision with the same inputs produce the same bytes.

export type IngestFormat = WitanInputBindingRecord['format'];

/** The policy recorded on the certificate. `record-only` is the default and scores identically. */
export type IngestBindingPolicy = WitanInputBinding['policy'];

/**
 * An input observed this long before the scanned HEAD commit's committer time is stale. One day
 * absorbs ordinary clock skew and time-zone mistakes between a scanner host and a committer's
 * machine; an input older than that was produced before the scanned code existed. The value is
 * recorded on every certificate that ingests anything, so a reader never has to know this constant.
 */
export const INGEST_FRESHNESS_WINDOW_SECONDS = 86_400;

/** Recorded per input; every declared subject is still checked (see evaluateInputBindingRecord). */
const MAX_IDENTITIES_PER_INPUT = 8;
const MAX_PRODUCER_NAME_LENGTH = 120;
const MAX_PRODUCER_VERSION_LENGTH = 80;
const MAX_REPOSITORY_LENGTH = 300;
const MAX_COMMIT_LENGTH = 80;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/;
const FULL_COMMIT_LENGTHS = new Set([40, 64]);

export interface IngestProducerIdentity {
  readonly name: string;
  readonly version?: string;
  readonly commit?: string;
}

export interface IngestSubjectIdentity {
  /** Normalized `host/path`. Only ever a value normalizeRepositoryIdentity returned. */
  readonly repository?: string;
  /**
   * The input declared a repository Cejel could not normalize (an IP or single-label host, a URL
   * with no path, a control character). The declared text is withheld, never recorded: it may
   * carry credentials or terminal controls that normalization exists to drop. A withheld
   * repository is never treated as the named subject repository.
   */
  readonly repositoryWithheld?: true;
  readonly commit?: string;
}

/** Identity a document's own format carries. Every field is optional: formats differ. */
export interface IngestDocumentIdentity {
  readonly producers: readonly IngestProducerIdentity[];
  /**
   * EVERY distinct subject the document declares, uncapped, in declaration order. The binding
   * checks run over all of them; only the record written to report.json is capped.
   */
  readonly subjects: readonly IngestSubjectIdentity[];
  /** Earliest observation time the document states, as ISO 8601 UTC. */
  readonly observedAt?: string;
}

/** What the scan knows about its own subject. */
export interface ScannedSubject {
  /** Normalized repository identity, from an explicit `--subject-repository` only. */
  readonly repository?: string;
  readonly commit?: string;
  /** HEAD committer time, ISO 8601 UTC. */
  readonly commitTime?: string;
}

/** One document as the ingest funnel read it, before binding is evaluated. */
export interface IngestDocumentRecord {
  readonly sha256: string;
  readonly format: IngestFormat;
  readonly provenance: WitanIngestProvenance;
  readonly identity: IngestDocumentIdentity;
  readonly duplicate?: 'same-path' | 'same-content';
  /** Path as given, for operator-facing errors only. Never written to report.json. */
  readonly displayPath: string;
}

export function sha256OfBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Normalize a repository identity to `host/path`, lowercase, without scheme, credentials, port,
 * `.git` suffix or trailing slash. `git@host:owner/repo.git`, `https://user@host/owner/repo`, and
 * `host/owner/repo` all normalize to `host/owner/repo`. Returns undefined when nothing
 * host-and-path-shaped remains: an identity Cejel cannot normalize is not compared.
 *
 * Case is folded because the hosts this is meant for (GitHub, GitLab, Bitbucket) resolve owner and
 * repository names case-insensitively. Credentials in a URL's userinfo are dropped by the parse,
 * never recorded.
 */
export function normalizeRepositoryIdentity(value: string): string | undefined {
  let text = value.trim();
  if (text.length === 0 || text.length > 2048) return undefined;
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(text);
  if (scp) text = `${scp[1]}/${scp[2]}`;
  else {
    const scheme = /^[a-z][a-z0-9+.-]*:\/\/(.*)$/i.exec(text);
    if (scheme) text = scheme[1] ?? '';
    const at = text.indexOf('@');
    const slash = text.indexOf('/');
    if (at !== -1 && (slash === -1 || at < slash)) text = text.slice(at + 1);
  }
  text = text.replace(/[?#].*$/, '');
  const [hostWithPort, ...pathParts] = text.split('/');
  const host = (hostWithPort ?? '').replace(/:\d+$/, '').toLowerCase();
  // Empty segments, then every trailing `.git` and slash together, so that the output is a fixed
  // point: `o/r/.git` and `o/r.git.git` reach `o/r` in one pass, never in two.
  const path = pathParts
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/(?:\/|\.git)+$/i, '')
    .toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(host) || path.length === 0) return undefined;
  if (/[\p{Cc}\p{Cf}\s]/u.test(path)) return undefined;
  const normalized = `${host}/${path}`;
  return normalized.length <= MAX_REPOSITORY_LENGTH ? normalized : undefined;
}

function normalizeCommit(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return undefined;
  return sanitizePresentationLine(trimmed, { fallback: 'unknown', maxLength: MAX_COMMIT_LENGTH });
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return sanitizePresentationLine(value, { fallback: 'unknown', maxLength });
}

/**
 * Parse a document timestamp to ISO 8601 UTC. A date-only value (`2026-10-01`, as older Scorecard
 * releases emit) means "some time that UTC day" and is read as that day's last second, so day
 * granularity can never make an input look older than it is.
 */
export function parseObservedAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) return plainIsoInstant(Date.parse(`${trimmed}T23:59:59Z`));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return undefined;
  }
  return plainIsoInstant(Date.parse(trimmed));
}

const PLAIN_ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * An instant as ISO 8601 UTC, only when its year is a plain four digits (0000-9999) AFTER offset
 * normalization. `9999-12-31T23:00:00-02:00` is year 10000 in UTC, which toISOString writes as an
 * expanded year (`+010000-...`) that report.json's datetime fields reject; such a value is treated
 * as absent, so a scan can never write a report its own verifier refuses. Undefined for NaN and for
 * instants outside the Date range (where toISOString would throw).
 */
export function plainIsoInstant(millis: number): string | undefined {
  if (!Number.isFinite(millis)) return undefined;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return undefined;
  const iso = date.toISOString();
  return PLAIN_ISO_INSTANT.test(iso) ? iso : undefined;
}

/** The earliest instant, compared as instants (never as strings). */
function earliest(values: readonly (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestMillis = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (value === undefined) continue;
    const millis = Date.parse(value);
    if (Number.isNaN(millis)) continue;
    if (millis < bestMillis) {
      best = value;
      bestMillis = millis;
    }
  }
  return best;
}

/** Distinct subjects in declaration order. Keyed, so a document with many entries stays linear. */
class SubjectSet {
  private readonly byKey = new Map<string, IngestSubjectIdentity>();
  add(subject: IngestSubjectIdentity): void {
    const key = JSON.stringify([subject.repository ?? null, subject.repositoryWithheld ?? false, subject.commit ?? null]);
    if (!this.byKey.has(key)) this.byKey.set(key, subject);
  }
  get size(): number {
    return this.byKey.size;
  }
  values(): IngestSubjectIdentity[] {
    return [...this.byKey.values()];
  }
}

function pushUnique<T>(items: T[], item: T): void {
  if (items.length >= MAX_IDENTITIES_PER_INPUT) return;
  const key = JSON.stringify(item);
  if (!items.some((existing) => JSON.stringify(existing) === key)) items.push(item);
}

/**
 * A declared subject. The repository is recorded only in normalized form: a declared value that
 * does not normalize is withheld (see IngestSubjectIdentity.repositoryWithheld), never recorded
 * verbatim, because the verbatim text is exactly where URL userinfo credentials live.
 */
function subjectFrom(repository: unknown, commit: unknown): IngestSubjectIdentity | undefined {
  const declaredRepository = typeof repository === 'string' && repository.trim().length > 0;
  const normalizedRepository = declaredRepository
    ? normalizeRepositoryIdentity(repository)
    : undefined;
  const normalizedCommit = normalizeCommit(commit);
  if (!declaredRepository && normalizedCommit === undefined) return undefined;
  return {
    ...(normalizedRepository !== undefined
      ? { repository: normalizedRepository }
      : declaredRepository
        ? { repositoryWithheld: true as const }
        : {}),
    ...(normalizedCommit !== undefined ? { commit: normalizedCommit } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * OpenSSF Scorecard JSON: `repo.name` and `repo.commit` are the subject, `date` the observation,
 * `scorecard.version` and `scorecard.commit` the producer.
 */
export function extractScorecardIdentity(raw: unknown): IngestDocumentIdentity {
  const doc = asRecord(raw) ?? {};
  const repo = asRecord(doc.repo) ?? {};
  const scorecard = asRecord(doc.scorecard) ?? {};
  const subject = subjectFrom(repo.name, repo.commit);
  const version = boundedText(scorecard.version, MAX_PRODUCER_VERSION_LENGTH);
  const commit = normalizeCommit(scorecard.commit);
  const observedAt = parseObservedAt(doc.date);
  return {
    producers: [
      {
        name: 'scorecard',
        ...(version !== undefined ? { version } : {}),
        ...(commit !== undefined ? { commit } : {}),
      },
    ],
    subjects: subject ? [subject] : [],
    ...(observedAt !== undefined ? { observedAt } : {}),
  };
}

/**
 * SARIF 2.1.0: per run, `versionControlProvenance[].repositoryUri` and `.revisionId` are the
 * subject, `tool.driver.name` and `.semanticVersion`/`.version` the producer, and
 * `invocations[].startTimeUtc`/`.endTimeUtc` the observation. The earliest stated time is kept.
 */
export function extractSarifIdentity(raw: unknown): IngestDocumentIdentity {
  const doc = asRecord(raw) ?? {};
  const runs = Array.isArray(doc.runs) ? doc.runs : [];
  const producers: IngestProducerIdentity[] = [];
  const subjects = new SubjectSet();
  const times: (string | undefined)[] = [];
  let runWithoutSubject = false;
  for (const rawRun of runs) {
    const run = asRecord(rawRun) ?? {};
    const driver = asRecord(asRecord(run.tool)?.driver) ?? {};
    const name = boundedText(driver.name, MAX_PRODUCER_NAME_LENGTH) ?? 'unknown';
    const version = boundedText(driver.semanticVersion ?? driver.version, MAX_PRODUCER_VERSION_LENGTH);
    pushUnique(producers, { name, ...(version !== undefined ? { version } : {}) });
    const provenance = Array.isArray(run.versionControlProvenance) ? run.versionControlProvenance : [];
    let runDeclaredSubject = false;
    for (const rawEntry of provenance) {
      const entry = asRecord(rawEntry) ?? {};
      const subject = subjectFrom(entry.repositoryUri, entry.revisionId);
      if (subject) {
        subjects.add(subject);
        runDeclaredSubject = true;
      }
    }
    if (!runDeclaredSubject) runWithoutSubject = true;
    const invocations = Array.isArray(run.invocations) ? run.invocations : [];
    for (const rawInvocation of invocations) {
      const invocation = asRecord(rawInvocation) ?? {};
      times.push(parseObservedAt(invocation.startTimeUtc), parseObservedAt(invocation.endTimeUtc));
    }
  }
  // A run that declares no subject, beside runs that do, is recorded as an empty subject: its
  // findings are about no declared revision, so the document is not wholly bound to one (see
  // bindingStatusForChecks). A document in which no run declares anything keeps `subjects: []`.
  if (runWithoutSubject && subjects.size > 0) subjects.add({});
  const observedAt = earliest(times);
  return {
    producers,
    subjects: subjects.values(),
    ...(observedAt !== undefined ? { observedAt } : {}),
  };
}

/** Assemble a generic-contract identity from the v1.1 fields the adapter already validated. */
export function genericIdentity(fields: {
  tool: string;
  subject?: { repository?: string; commit?: string };
  producer?: { name?: string; version?: string };
  observedAt?: string;
}): IngestDocumentIdentity {
  const name = boundedText(fields.producer?.name ?? fields.tool, MAX_PRODUCER_NAME_LENGTH) ?? 'unknown';
  const version = boundedText(fields.producer?.version, MAX_PRODUCER_VERSION_LENGTH);
  const subject = fields.subject
    ? subjectFrom(fields.subject.repository, fields.subject.commit)
    : undefined;
  const observedAt = parseObservedAt(fields.observedAt);
  return {
    producers: [{ name, ...(version !== undefined ? { version } : {}) }],
    subjects: subject ? [subject] : [],
    ...(observedAt !== undefined ? { observedAt } : {}),
  };
}

type CheckResult = WitanInputBindingRecord['checks'];

function declaresRepository(subject: IngestSubjectIdentity): boolean {
  return subject.repository !== undefined || subject.repositoryWithheld === true;
}

function checkRepository(
  subjects: readonly IngestSubjectIdentity[],
  scanned: ScannedSubject,
): CheckResult['repository'] {
  const declared = subjects.filter(declaresRepository);
  if (declared.length === 0) return 'absent';
  if (scanned.repository === undefined) return 'unverifiable';
  // A withheld repository has no recorded value, so it can never equal the named one: an input
  // whose declared repository Cejel cannot establish is not taken as the subject repository.
  return declared.every((subject) => subject.repository === scanned.repository)
    ? 'matched'
    : 'mismatched';
}

/** True when this subject, on its own, disagrees with the scanned subject. */
function subjectDisagrees(subject: IngestSubjectIdentity, scanned: ScannedSubject): boolean {
  if (scanned.repository !== undefined && declaresRepository(subject)) {
    if (subject.repository !== scanned.repository) return true;
  }
  if (scanned.commit !== undefined && subject.commit !== undefined) {
    if (!commitMatches(subject.commit, scanned.commit)) return true;
  }
  return false;
}

function commitMatches(inputCommit: string, headSha: string): boolean {
  if (!COMMIT_PATTERN.test(inputCommit)) return false;
  const head = headSha.toLowerCase();
  if (FULL_COMMIT_LENGTHS.has(inputCommit.length)) return inputCommit === head;
  return head.startsWith(inputCommit);
}

function checkCommit(
  subjects: readonly IngestSubjectIdentity[],
  scanned: ScannedSubject,
): CheckResult['commit'] {
  const commits = subjects
    .map((subject) => subject.commit)
    .filter((commit): commit is string => commit !== undefined);
  if (commits.length === 0) return 'absent';
  if (scanned.commit === undefined) return 'unverifiable';
  const head = scanned.commit;
  return commits.every((commit) => commitMatches(commit, head)) ? 'matched' : 'mismatched';
}

function checkFreshness(
  observedAt: string | undefined,
  scanned: ScannedSubject,
  windowSeconds: number,
): CheckResult['freshness'] {
  if (observedAt === undefined) return 'absent';
  if (scanned.commitTime === undefined) return 'unverifiable';
  const observed = Date.parse(observedAt);
  const committed = Date.parse(scanned.commitTime);
  return observed < committed - windowSeconds * 1000 ? 'stale' : 'within-window';
}

/**
 * The single status a record carries, from its checks, worst first: a repository mismatch, then a
 * commit mismatch, then staleness. `matched` requires a matching commit: a repository name alone
 * does not bind an input to a revision. An input whose format carried no commit (it may still
 * name a repository) is `unbound`. One that carried a commit this scan has nothing to compare
 * against, because the scanned directory has no git HEAD, is `unverifiable` rather than guessed
 * either way.
 */
export function bindingStatusForChecks(
  checks: CheckResult,
  everySubjectDeclaresCommit = true,
): WitanInputBindingStatus {
  if (checks.repository === 'mismatched') return 'mismatched-repository';
  if (checks.commit === 'mismatched') return 'mismatched-commit';
  if (checks.freshness === 'stale') return 'stale';
  // Partially bound: every declared commit is HEAD, but some declared subject (a SARIF run with no
  // provenance, or a provenance entry with no revisionId) names no commit. Its findings are bound
  // to no revision, so the document as a whole is unbound, never matched.
  if (checks.commit === 'matched' && !everySubjectDeclaresCommit) return 'unbound';
  if (checks.commit === 'matched') return 'matched';
  if (checks.commit === 'unverifiable') return 'unverifiable';
  return 'unbound';
}

/**
 * The subjects written to report.json: all of them when they fit the cap, otherwise the first
 * subjects that on their own disagree with the scanned subject, then those declaring no commit,
 * then the rest, each group in declaration order. The checks have already seen every subject;
 * this ordering only makes the recorded excerpt show what decided the status.
 */
function recordedSubjects(
  subjects: readonly IngestSubjectIdentity[],
  scanned: ScannedSubject,
): { subjects: IngestSubjectIdentity[]; omitted: number } {
  if (subjects.length <= MAX_IDENTITIES_PER_INPUT) return { subjects: [...subjects], omitted: 0 };
  const rank = (subject: IngestSubjectIdentity): number =>
    subjectDisagrees(subject, scanned) ? 0 : subject.commit === undefined ? 1 : 2;
  const ordered = subjects
    .map((subject, index) => ({ subject, index, rank: rank(subject) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, MAX_IDENTITIES_PER_INPUT)
    .map((entry) => entry.subject);
  return { subjects: ordered, omitted: subjects.length - MAX_IDENTITIES_PER_INPUT };
}

export function evaluateInputBindingRecord(
  document: IngestDocumentRecord,
  scanned: ScannedSubject,
  windowSeconds: number = INGEST_FRESHNESS_WINDOW_SECONDS,
): WitanInputBindingRecord {
  // Every declared subject is checked, however many there are: a cap on what is recorded must
  // never become a cap on what is compared.
  const allSubjects = document.identity.subjects;
  const checks: CheckResult = {
    repository: checkRepository(allSubjects, scanned),
    commit: checkCommit(allSubjects, scanned),
    freshness: checkFreshness(document.identity.observedAt, scanned, windowSeconds),
  };
  const recorded = recordedSubjects(allSubjects, scanned);
  return {
    sha256: document.sha256,
    format: document.format,
    provenance: document.provenance,
    producers: [...document.identity.producers],
    subjects: recorded.subjects,
    ...(recorded.omitted > 0 ? { subjectsOmitted: recorded.omitted } : {}),
    ...(document.identity.observedAt !== undefined
      ? { observedAt: document.identity.observedAt }
      : {}),
    status: bindingStatusForChecks(
      checks,
      allSubjects.every((subject) => subject.commit !== undefined),
    ),
    checks,
    ...(document.duplicate !== undefined ? { duplicate: document.duplicate } : {}),
    scored: document.duplicate !== 'same-path',
  };
}

function compareRecords(a: WitanInputBindingRecord, b: WitanInputBindingRecord): number {
  return (
    a.sha256.localeCompare(b.sha256) ||
    (a.duplicate ?? '').localeCompare(b.duplicate ?? '') ||
    a.provenance.localeCompare(b.provenance)
  );
}

/**
 * The certificate's record. Inputs are ordered by digest, not by command-line order, so a
 * reproduction that supplies the same files in another order produces the same bytes.
 */
export function buildInputBinding(
  documents: readonly IngestDocumentRecord[],
  scanned: ScannedSubject,
  policy: IngestBindingPolicy,
  windowSeconds: number = INGEST_FRESHNESS_WINDOW_SECONDS,
): WitanInputBinding {
  return {
    policy,
    freshnessWindowSeconds: windowSeconds,
    scannedSubject: {
      ...(scanned.repository !== undefined ? { repository: scanned.repository } : {}),
      ...(scanned.commit !== undefined ? { commit: scanned.commit } : {}),
      ...(scanned.commitTime !== undefined ? { commitTime: scanned.commitTime } : {}),
    },
    inputs: documents
      .map((document) => evaluateInputBindingRecord(document, scanned, windowSeconds))
      .sort(compareRecords),
  };
}

/** Statuses `--strict-ingest` refuses. Unbound and unverifiable inputs are recorded, not refused. */
export const STRICT_INGEST_REFUSED_STATUSES: ReadonlySet<WitanInputBindingStatus> = new Set([
  'mismatched-repository',
  'mismatched-commit',
  'stale',
]);

export function strictIngestRefusalReasons(record: WitanInputBindingRecord): string[] {
  const reasons: string[] = [];
  if (STRICT_INGEST_REFUSED_STATUSES.has(record.status)) reasons.push(record.status);
  if (record.duplicate !== undefined) reasons.push(`duplicate (${record.duplicate})`);
  return reasons;
}

function describeSubjects(record: WitanInputBindingRecord): string {
  if (record.subjects.length === 0) return 'no subject';
  const listed = record.subjects
    .map(
      (subject) =>
        `${subject.repository ?? (subject.repositoryWithheld ? '(repository withheld: not normalizable)' : '?')}@${subject.commit ?? '?'}`,
    )
    .join(', ');
  return record.subjectsOmitted ? `${listed} and ${record.subjectsOmitted} more` : listed;
}

/**
 * Refuse, before scoring, every input `--strict-ingest` does not accept. The message names each
 * refused file, why, and what the scan compared it against, so the operator can fix the input
 * rather than guess.
 */
export function assertStrictIngestBinding(
  documents: readonly IngestDocumentRecord[],
  binding: WitanInputBinding,
): void {
  const problems: string[] = [];
  for (const document of documents) {
    const record = evaluateInputBindingRecord(
      document,
      binding.scannedSubject,
      binding.freshnessWindowSeconds,
    );
    const reasons = strictIngestRefusalReasons(record);
    if (reasons.length === 0) continue;
    problems.push(
      // displayPath is the operator's or repository's own path text; a committed file name can
      // carry terminal controls, and this message goes to stderr.
      `  - ${stripTerminalControls(document.displayPath)} (sha256:${record.sha256.slice(0, 12)}, ${record.format}): ${reasons.join(', ')}; input subject ${describeSubjects(record)}${record.observedAt ? `, observed ${record.observedAt}` : ''}`,
    );
  }
  if (problems.length === 0) return;
  const scanned = binding.scannedSubject;
  throw new Error(
    [
      `Cejel: --strict-ingest refused ${problems.length} ingest input${problems.length === 1 ? '' : 's'}; no certificate was written.`,
      ...problems,
      `  scanned subject: ${scanned.repository ?? '(repository not named; pass --subject-repository to compare it)'}@${scanned.commit ?? '(no git HEAD)'}${scanned.commitTime ? `, committed ${scanned.commitTime}` : ''}; freshness window ${binding.freshnessWindowSeconds}s before that commit time.`,
      '  Supply inputs produced for this repository at this commit, remove duplicates, or drop --strict-ingest to record the binding status without refusing.',
    ].join('\n'),
  );
}

export interface RecordedInputDigestVerification {
  valid: boolean;
  lines: string[];
}

/**
 * Check a set of input files against the digests a report records. The comparison is between
 * SETS of distinct digests: every supplied file must be a recorded input, and every recorded,
 * scored input must be supplied. A file swapped for another (even one with the same name, tool
 * and finding count) has a different digest and fails; so does an input left out or added.
 */
export function verifyRecordedInputDigests(
  report: { inputBinding?: WitanInputBinding },
  inputPaths: readonly string[],
  readFile: (path: string) => Buffer,
): RecordedInputDigestVerification {
  const binding = report.inputBinding;
  if (!binding) {
    return {
      valid: false,
      lines: [
        'Cejel: input digests not verified — report.json records no inputBinding (it ingested nothing, or predates report format 1.7).',
      ],
    };
  }
  const recorded = new Set(binding.inputs.filter((input) => input.scored).map((input) => input.sha256));
  const supplied = new Map<string, string>();
  for (const path of inputPaths) supplied.set(sha256OfBytes(readFile(path)), path);
  const lines: string[] = [];
  for (const [digest, path] of supplied) {
    if (!recorded.has(digest)) {
      lines.push(`Cejel: input ${path} (sha256:${digest}) is not an input report.json records.`);
    }
  }
  for (const digest of recorded) {
    if (!supplied.has(digest)) {
      lines.push(`Cejel: report.json records input sha256:${digest}, which no supplied --input matches.`);
    }
  }
  if (lines.length > 0) return { valid: false, lines };
  return {
    valid: true,
    lines: [`Cejel: ${recorded.size} ingested input digest${recorded.size === 1 ? '' : 's'} verified against report.json.`],
  };
}
