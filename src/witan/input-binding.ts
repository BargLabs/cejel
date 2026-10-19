import { createHash } from 'node:crypto';

import type {
  WitanIngestProvenance,
  WitanInputBinding,
  WitanInputBindingRecord,
  WitanInputBindingStatus,
} from './schemas.js';

import { sanitizePresentationLine } from '../presentation-safety.js';

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
  readonly repository?: string;
  readonly commit?: string;
}

/** Identity a document's own format carries. Every field is optional: formats differ. */
export interface IngestDocumentIdentity {
  readonly producers: readonly IngestProducerIdentity[];
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
  const path = pathParts
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\.git$/i, '')
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
  if (dateOnly) {
    const millis = Date.parse(`${trimmed}T23:59:59Z`);
    return Number.isNaN(millis) ? undefined : new Date(millis).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return undefined;
  }
  const millis = Date.parse(trimmed);
  return Number.isNaN(millis) ? undefined : new Date(millis).toISOString();
}

function earliest(values: readonly (string | undefined)[]): string | undefined {
  const defined = values.filter((value): value is string => value !== undefined).sort();
  return defined[0];
}

function pushUnique<T>(items: T[], item: T): void {
  if (items.length >= MAX_IDENTITIES_PER_INPUT) return;
  const key = JSON.stringify(item);
  if (!items.some((existing) => JSON.stringify(existing) === key)) items.push(item);
}

function subjectFrom(repository: unknown, commit: unknown): IngestSubjectIdentity | undefined {
  const normalizedRepository =
    typeof repository === 'string' ? normalizeRepositoryIdentity(repository) : undefined;
  const rawRepository =
    normalizedRepository ?? boundedText(repository, MAX_REPOSITORY_LENGTH);
  const normalizedCommit = normalizeCommit(commit);
  if (rawRepository === undefined && normalizedCommit === undefined) return undefined;
  return {
    ...(rawRepository !== undefined ? { repository: rawRepository } : {}),
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
  const subjects: IngestSubjectIdentity[] = [];
  const times: (string | undefined)[] = [];
  for (const rawRun of runs) {
    const run = asRecord(rawRun) ?? {};
    const driver = asRecord(asRecord(run.tool)?.driver) ?? {};
    const name = boundedText(driver.name, MAX_PRODUCER_NAME_LENGTH) ?? 'unknown';
    const version = boundedText(driver.semanticVersion ?? driver.version, MAX_PRODUCER_VERSION_LENGTH);
    pushUnique(producers, { name, ...(version !== undefined ? { version } : {}) });
    const provenance = Array.isArray(run.versionControlProvenance) ? run.versionControlProvenance : [];
    for (const rawEntry of provenance) {
      const entry = asRecord(rawEntry) ?? {};
      const subject = subjectFrom(entry.repositoryUri, entry.revisionId);
      if (subject) pushUnique(subjects, subject);
    }
    const invocations = Array.isArray(run.invocations) ? run.invocations : [];
    for (const rawInvocation of invocations) {
      const invocation = asRecord(rawInvocation) ?? {};
      times.push(parseObservedAt(invocation.startTimeUtc), parseObservedAt(invocation.endTimeUtc));
    }
  }
  const observedAt = earliest(times);
  return { producers, subjects, ...(observedAt !== undefined ? { observedAt } : {}) };
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

function checkRepository(
  subjects: readonly IngestSubjectIdentity[],
  scanned: ScannedSubject,
): CheckResult['repository'] {
  const repositories = subjects
    .map((subject) => subject.repository)
    .filter((repository): repository is string => repository !== undefined);
  if (repositories.length === 0) return 'absent';
  if (scanned.repository === undefined) return 'unverifiable';
  return repositories.every((repository) => repository === scanned.repository)
    ? 'matched'
    : 'mismatched';
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
export function bindingStatusForChecks(checks: CheckResult): WitanInputBindingStatus {
  if (checks.repository === 'mismatched') return 'mismatched-repository';
  if (checks.commit === 'mismatched') return 'mismatched-commit';
  if (checks.freshness === 'stale') return 'stale';
  if (checks.commit === 'matched') return 'matched';
  if (checks.commit === 'unverifiable') return 'unverifiable';
  return 'unbound';
}

export function evaluateInputBindingRecord(
  document: IngestDocumentRecord,
  scanned: ScannedSubject,
  windowSeconds: number = INGEST_FRESHNESS_WINDOW_SECONDS,
): WitanInputBindingRecord {
  const checks: CheckResult = {
    repository: checkRepository(document.identity.subjects, scanned),
    commit: checkCommit(document.identity.subjects, scanned),
    freshness: checkFreshness(document.identity.observedAt, scanned, windowSeconds),
  };
  return {
    sha256: document.sha256,
    format: document.format,
    provenance: document.provenance,
    producers: [...document.identity.producers],
    subjects: [...document.identity.subjects],
    ...(document.identity.observedAt !== undefined
      ? { observedAt: document.identity.observedAt }
      : {}),
    status: bindingStatusForChecks(checks),
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

function describeSubjects(subjects: readonly IngestSubjectIdentity[]): string {
  if (subjects.length === 0) return 'no subject';
  return subjects
    .map((subject) => `${subject.repository ?? '?'}@${subject.commit ?? '?'}`)
    .join(', ');
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
      `  - ${document.displayPath} (sha256:${record.sha256.slice(0, 12)}, ${record.format}): ${reasons.join(', ')}; input subject ${describeSubjects(record.subjects)}${record.observedAt ? `, observed ${record.observedAt}` : ''}`,
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
