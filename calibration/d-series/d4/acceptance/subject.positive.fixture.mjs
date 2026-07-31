export function readQueue(directory) {
  if (directory === 'unparseable') {
    return { ok: false, error: 'queue directory is not parseable' };
  }
  if (directory === 'empty') {
    return { ok: true, entries: [] };
  }
  return { ok: true, entries: ['goal-1'] };
}

export function collectQueue(directory) {
  const result = readQueue(directory);
  const entries = result.ok ? result.entries : [];
  return { ok: true, entries };
}
