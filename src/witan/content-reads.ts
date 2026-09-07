import { closeSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { resolve } from 'node:path';

import { MAX_REPOSITORY_CONTENT_BYTES } from '../filesystem-limits.js';

import type { WitanContentReadSummary, WitanCriterionId } from './schemas.js';

export type ContentReadSkipReason =
  | 'unreadable'
  | 'too_large'
  | 'excluded_by_extension'
  | 'denied_path'
  | 'non_regular_file';

interface ContentReadSession {
  readonly counts: Record<ContentReadSkipReason, number>;
  readonly unreadableByErrno: Map<string, number>;
  readonly deduplicatedSkips: Set<string>;
  readonly affectedCriteria: Set<WitanCriterionId>;
  // Composite `${criterionId}:${signalId}` keys for skips attributed to a specific named
  // sub-computation within a criterion (set via withContentReadSignal), plus criterion ids that
  // had at least one skip NOT attributed to a signal — the latter is what forces the
  // conservative whole-criterion abstention fallback in buildWitanInputFromRepo, since an
  // unattributed skip could have tainted anything in that criterion's output.
  readonly affectedSignals: Set<string>;
  readonly unattributedCriteria: Set<WitanCriterionId>;
  criterion?: WitanCriterionId;
  // A single read can legitimately feed more than one named signal (e.g. A4 parses one
  // dependency manifest into three separate ratio metrics). Attributing that read to every
  // signal it feeds abstains all of them and leaves the rest of the criterion intact, which is
  // still strictly narrower than the whole-criterion fallback and never narrower than the truth.
  signals?: readonly string[];
}

export interface TrackedContentReads<T> {
  readonly value: T;
  readonly summary: WitanContentReadSummary;
  readonly affectedCriteria: ReadonlySet<WitanCriterionId>;
  readonly affectedSignals: ReadonlySet<string>;
  readonly unattributedCriteria: ReadonlySet<WitanCriterionId>;
}

/** Composite key used in affectedSignals; exported so callers never hand-format it. */
export function contentReadSignalKey(criterionId: WitanCriterionId, signalId: string): string {
  return [criterionId, signalId].join(':');
}

// Repository scans and their collectors are deliberately synchronous. A stack-scoped session
// therefore gives nested scans isolation without adding an async runtime capability to the
// offline scoring closure.
let activeSession: ContentReadSession | undefined;

function errnoClass(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code) ? code : null;
}

function recordSkip(
  path: string,
  reason: ContentReadSkipReason,
  errno?: string,
  affectsCurrentCriterion = false,
  deduplicate = false,
): void {
  const session = activeSession;
  if (!session) return;
  if (affectsCurrentCriterion && session.criterion) {
    session.affectedCriteria.add(session.criterion);
    const signals = session.signals;
    if (signals && signals.length > 0) {
      for (const signal of signals) {
        session.affectedSignals.add(contentReadSignalKey(session.criterion, signal));
      }
    } else {
      session.unattributedCriteria.add(session.criterion);
    }
  }
  if (deduplicate) {
    const key = `${resolve(path)}\u0000${reason}\u0000${errno ?? ''}`;
    if (session.deduplicatedSkips.has(key)) return;
    session.deduplicatedSkips.add(key);
  }
  session.counts[reason] += 1;
  if (reason === 'unreadable' && errno) {
    session.unreadableByErrno.set(errno, (session.unreadableByErrno.get(errno) ?? 0) + 1);
  }
}

function summaryFor(session: ContentReadSession): WitanContentReadSummary {
  const byReason = {
    unreadable: session.counts.unreadable,
    tooLarge: session.counts.too_large,
    excludedByExtension: session.counts.excluded_by_extension,
    deniedPath: session.counts.denied_path,
    nonRegularFile: session.counts.non_regular_file,
  };
  const sortedErrnos = Object.fromEntries(
    [...session.unreadableByErrno.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    skipped: Object.values(session.counts).reduce((total, count) => total + count, 0),
    byReason,
    unreadableByErrno: sortedErrnos,
    affectedCriteria: [...session.affectedCriteria].sort(),
  };
}

export function trackContentReads<T>(_repoPath: string, collect: () => T): TrackedContentReads<T> {
  const existing = activeSession;
  if (existing) {
    return {
      value: collect(),
      summary: summaryFor(existing),
      affectedCriteria: existing.affectedCriteria,
      affectedSignals: existing.affectedSignals,
      unattributedCriteria: existing.unattributedCriteria,
    };
  }
  const session: ContentReadSession = {
    counts: {
      unreadable: 0,
      too_large: 0,
      excluded_by_extension: 0,
      denied_path: 0,
      non_regular_file: 0,
    },
    unreadableByErrno: new Map(),
    deduplicatedSkips: new Set(),
    affectedCriteria: new Set(),
    affectedSignals: new Set(),
    unattributedCriteria: new Set(),
  };
  activeSession = session;
  try {
    const value = collect();
    return {
      value,
      summary: summaryFor(session),
      affectedCriteria: session.affectedCriteria,
      affectedSignals: session.affectedSignals,
      unattributedCriteria: session.unattributedCriteria,
    };
  } finally {
    activeSession = undefined;
  }
}

export function withContentReadCriterion<T>(
  criterion: WitanCriterionId,
  collect: () => T,
): T {
  const session = activeSession;
  if (!session) return collect();
  const previous = session.criterion;
  session.criterion = criterion;
  try {
    return collect();
  } finally {
    session.criterion = previous;
  }
}

/**
 * Narrows an in-progress withContentReadCriterion scope to a named sub-computation, so a skip
 * inside `collect` is attributed to this signal specifically rather than tainting every signal
 * under the enclosing criterion (goal_cejel_v23_per_signal_abstention_2026-09-06). Must be
 * nested inside withContentReadCriterion for the same criterion id — outside one, this is a
 * no-op passthrough, matching withContentReadCriterion's own no-session behavior.
 */
export function withContentReadSignal<T>(
  criterionId: WitanCriterionId,
  signalId: string,
  collect: () => T,
): T {
  return withContentReadSignals(criterionId, [signalId], collect);
}

/**
 * Multi-signal form of withContentReadSignal, for a read whose result genuinely feeds several
 * named signals of the same criterion and cannot be split further (A4 parses each dependency
 * manifest once and derives pinned_dependency_ratio, declared_version_range_ratio and
 * dependency_count_sanity from the same specs). A skip inside `collect` abstains every listed
 * signal — never fewer — so this can only ever narrow the abstention to a set that really did
 * depend on the unreadable file. Passing an empty list would silently mean "unattributed", which
 * is a caller mistake rather than a meaningful request, so it is rejected outright.
 */
export function withContentReadSignals<T>(
  criterionId: WitanCriterionId,
  signalIds: readonly string[],
  collect: () => T,
): T {
  if (signalIds.length === 0) {
    throw new Error('Cejel invariant: withContentReadSignals requires at least one signal id');
  }
  const session = activeSession;
  if (!session || session.criterion !== criterionId) return collect();
  const previous = session.signals;
  session.signals = signalIds;
  try {
    return collect();
  } finally {
    session.signals = previous;
  }
}

export function recordContentSkip(
  path: string,
  reason: Exclude<ContentReadSkipReason, 'unreadable'>,
  deduplicate = false,
): void {
  recordSkip(path, reason, undefined, false, deduplicate);
}

/** Record an inventory-time omission whose path shape identifies affected rubric criteria. */
export function recordContentSkipForCriteria(
  path: string,
  reason: Exclude<ContentReadSkipReason, 'unreadable'>,
  criteria: readonly WitanCriterionId[],
  deduplicate = false,
): void {
  const session = activeSession;
  if (session) {
    for (const criterion of criteria) {
      session.affectedCriteria.add(criterion);
      // This path names criteria directly from a path-shape heuristic, never from an active
      // withContentReadSignal scope — it can never be attributed to one signal, so it must force
      // the conservative whole-criterion fallback rather than silently leaving the criterion out
      // of unattributedCriteria (which would make v23 wrongly treat it as fully attributed).
      session.unattributedCriteria.add(criterion);
    }
  }
  recordSkip(path, reason, undefined, false, deduplicate);
}

export function recordFilesystemSkip(
  path: string,
  error: unknown,
  deniedContext = false,
  deduplicate = true,
): void {
  const errno = errnoClass(error);
  if (!errno) throw error;
  if (deniedContext && (errno === 'EACCES' || errno === 'EPERM')) {
    recordSkip(path, 'denied_path', errno, false, deduplicate);
    return;
  }
  recordSkip(path, 'unreadable', errno, true, deduplicate);
}

/**
 * Read repository text without letting an expected filesystem refusal end the scan. The empty
 * fallback is safe only because the active criterion is simultaneously marked insufficient_data.
 * Unexpected non-filesystem exceptions are rethrown so detector bugs remain visible.
 */
export function readRepoText(path: string, encoding: BufferEncoding = 'utf8'): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      recordSkip(path, 'non_regular_file', undefined, true, true);
      return '';
    }
    if (stat.size > MAX_REPOSITORY_CONTENT_BYTES) {
      recordSkip(path, 'too_large', undefined, true, true);
      return '';
    }
  } catch (error: unknown) {
    recordFilesystemSkip(path, error);
    return '';
  }
  try {
    return readFileSync(path, encoding);
  } catch (error: unknown) {
    recordFilesystemSkip(path, error);
    return '';
  }
}

/** Bounded prefix read used by the semantic-source gate; failures follow the same contract. */
export function readRepoTextPrefix(path: string, byteLimit: number): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      recordSkip(path, 'non_regular_file', undefined, true, true);
      return '';
    }
  } catch (error: unknown) {
    recordFilesystemSkip(path, error);
    return '';
  }

  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, 'r');
    const buffer = Buffer.allocUnsafe(byteLimit);
    const bytesRead = readSync(descriptor, buffer, 0, byteLimit, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch (error: unknown) {
    recordFilesystemSkip(path, error);
    return '';
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch (error: unknown) {
        recordFilesystemSkip(path, error);
      }
    }
  }
}
