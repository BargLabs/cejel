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
  readonly skips: Map<string, { reason: ContentReadSkipReason; errno?: string }>;
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
  affectedCriteria: readonly WitanCriterionId[] = [],
): void {
  const session = activeSession;
  if (!session) return;
  const key = `${resolve(path)}\u0000${reason}\u0000${errno ?? ''}`;
  session.skips.set(key, { reason, ...(errno ? { errno } : {}) });
  if (affectsCurrentCriterion && session.criterion) {
    session.affectedCriteria.add(session.criterion);
  }
  for (const criterion of affectedCriteria) session.affectedCriteria.add(criterion);
}

function summaryFor(session: ContentReadSession): WitanContentReadSummary {
  const byReason = {
    unreadable: 0,
    tooLarge: 0,
    excludedByExtension: 0,
    deniedPath: 0,
    nonRegularFile: 0,
  };
  const unreadableByErrno: Record<string, number> = {};
  for (const skip of session.skips.values()) {
    switch (skip.reason) {
      case 'unreadable':
        byReason.unreadable += 1;
        if (skip.errno) unreadableByErrno[skip.errno] = (unreadableByErrno[skip.errno] ?? 0) + 1;
        break;
      case 'too_large':
        byReason.tooLarge += 1;
        break;
      case 'excluded_by_extension':
        byReason.excludedByExtension += 1;
        break;
      case 'denied_path':
        byReason.deniedPath += 1;
        break;
      case 'non_regular_file':
        byReason.nonRegularFile += 1;
        break;
    }
  }
  const sortedErrnos = Object.fromEntries(
    Object.entries(unreadableByErrno).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    skipped: session.skips.size,
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
    skips: new Map(),
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
  affectedCriteria: readonly WitanCriterionId[] = [],
): void {
  recordSkip(path, reason, undefined, false, affectedCriteria);
}

export function recordFilesystemSkip(
  path: string,
  error: unknown,
  deniedContext = false,
): void {
  const errno = errnoClass(error);
  if (!errno) throw error;
  if (deniedContext && (errno === 'EACCES' || errno === 'EPERM')) {
    recordSkip(path, 'denied_path', errno);
    return;
  }
  recordSkip(path, 'unreadable', errno, true);
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
      recordSkip(path, 'non_regular_file', undefined, true);
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
      recordSkip(path, 'non_regular_file', undefined, true);
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
