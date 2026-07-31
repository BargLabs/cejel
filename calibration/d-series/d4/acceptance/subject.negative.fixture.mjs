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
  if (!result.ok) {
    return result;
  }
  return { ok: true, entries: result.entries };
}
