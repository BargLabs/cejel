import { closeSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { resolve } from 'node:path';

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
  criterion?: WitanCriterionId;
}

export interface TrackedContentReads<T> {
  readonly value: T;
  readonly summary: WitanContentReadSummary;
  readonly affectedCriteria: ReadonlySet<WitanCriterionId>;
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
  };
  activeSession = session;
  try {
    const value = collect();
    return {
      value,
      summary: summaryFor(session),
      affectedCriteria: session.affectedCriteria,
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

export function recordContentSkip(
  path: string,
  reason: Exclude<ContentReadSkipReason, 'unreadable'>,
  deduplicate = false,
): void {
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
