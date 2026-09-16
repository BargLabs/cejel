#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(...args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }); }
  catch { throw new Error(`unreadable git input: ${args.join(' ')}`); }
}
const list = text => text.split('\0').filter(Boolean);
const revision = ref => git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
function markerAt(ref) {
  const entry = git('ls-tree', '-z', ref, '--', 'FREEZE.md');
  if (!entry) return null;
  if (!entry.startsWith('100644 blob ') && !entry.startsWith('100755 blob ')) {
    throw new Error('unreadable FREEZE.md: expected a regular tracked file');
  }
  return git('show', `${ref}:FREEZE.md`);
}
function declaration(head) {
  // Recover the declaring bytes even after a direct push deletes or edits the input.
  // Closing a window requires an operator-reviewed guard transition, never rm FREEZE.md.
  for (const ref of git('rev-list', '--reverse', head, '--', 'FREEZE.md').trim().split('\n').filter(Boolean)) {
    const bytes = markerAt(ref);
    if (bytes !== null) return bytes;
  }
  return null;
}
function parseMarker(bytes) {
  let marker;
  try { marker = JSON.parse(bytes); } catch { throw new Error('unreadable FREEZE.md: expected JSON'); }
  const a = marker.authority;
  if (!marker.window || !/^[0-9a-f]{40}$/.test(marker.pinnedRevision) ||
      !a?.repository || !a.record || !/^[0-9a-f]{40}$/.test(a.signedCommit) ||
      JSON.stringify(marker.frozenPaths) !== '["src/witan/"]' || !marker.closingConditions) {
    throw new Error('unreadable FREEZE.md: window, pin, declaring record, signed commit, src/witan/ scope and closing conditions required');
  }
  return marker;
}
function frozen(path) {
  return path.startsWith('src/witan/') &&
    !path.split('/').some(part => ['__tests__', '__fixtures__', 'fixtures'].includes(part)) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}
function main() {
  if (git('rev-parse', '--is-shallow-repository').trim() !== 'false') {
    throw new Error('unreadable declaration history: fetch full history before checking a freeze');
  }
  const args = process.argv.slice(2);
  let base, head = 'HEAD', auditMarker, full = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--full-tree') full = true;
    else if (['--base', '--head', '--marker'].includes(arg) && args.length) {
      const value = args.shift();
      if (arg === '--base') base = value;
      if (arg === '--head') head = value;
      if (arg === '--marker') auditMarker = value;
    } else throw new Error(`unreadable arguments: ${arg}`);
  }
  if (full === Boolean(base)) throw new Error('supply either --full-tree or --base <revision>');
  head = revision(head);
  if (base) base = revision(base);
  const declared = declaration(base || head);
  const headMarker = markerAt(head);
  // --marker is a local historical-audit aid; workflows never accept an override.
  const bytes = declared ?? headMarker ?? (auditMarker ? readFileSync(auditMarker, 'utf8') : null);
  if (bytes === null) { console.log(`freeze PASS: no freeze declared; history inspected head=${head}`); return; }
  const marker = parseMarker(bytes);
  const authority = `${marker.authority.repository}:${marker.authority.record}@${marker.authority.signedCommit}`;
  const pin = revision(marker.pinnedRevision);
  const inventory = list(git('ls-tree', '-rz', '--name-only', pin, '--', ...marker.frozenPaths)).filter(frozen);
  if (!inventory.length) throw new Error(`expected nonzero frozen source files; found 0 window=${marker.window} record=${authority}`);
  // --no-renames exposes both endpoints: moving frozen source out of scope still refuses.
  const diffBase = full ? pin : git('merge-base', base, head).trim();
  const changed = list(git('diff', '--no-renames', '--name-only', '-z', diffBase, head, '--'));
  const offending = changed.filter(frozen);
  if (declared !== null && headMarker !== declared) offending.push('FREEZE.md');
  const paths = [...new Set(offending)].sort();
  const summary = `window=${marker.window} record=${authority} frozenFiles=${inventory.length} changedPaths=${changed.length}`;
  if (paths.length) {
    console.error(`freeze REFUSED ${summary}\n${paths.map(path => `  ${path}`).join('\n')}\nHold scoring changes. ${marker.closingConditions} Marker edits/deletion require operator review of the declaring authority and guard transition.`);
    process.exitCode = 1;
  } else console.log(`freeze PASS ${summary}`);
}
try { main(); } catch (error) {
  console.error(`freeze REFUSED unreadable: ${error.message}`);
  process.exitCode = 1;
}
