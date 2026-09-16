#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyCommit } from './check-calibration-signatures.mjs';

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
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function provenance(marker) {
  return `window=${marker.window} record=${marker.authority.repository}:${marker.authority.record}@${marker.authority.signedCommit}`;
}
function signature(ref) {
  // Read the allowlist before the changing commit, so that commit cannot authorize
  // itself by adding its own key. Never consult an ambient personal allowlist.
  const dir = mkdtempSync(join(tmpdir(), 'freeze-signers-'));
  try {
    let contents;
    try { contents = git('show', `${ref}^:docs/security/allowed-signers`); }
    catch { throw new Error('unreadable docs/security/allowed-signers: missing from transition parent'); }
    const file = join(dir, 'allowed-signers');
    writeFileSync(file, contents);
    const result = verifyCommit(ref, file);
    return result.ok ? null : `signature unverified %G?=${result.status}; operator SSH signature required`;
  } catch (error) { return `signature ${error.message}`; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
function latest(states) {
  const present = states.filter(Boolean);
  if (!present.length) return null;
  const candidate = present.find(state => present.every(other => state.lineage.includes(other.ref)));
  if (!candidate) throw new Error('FREEZE.md supersedes fork: competing marker chains');
  return candidate;
}
function declaration(head) {
  // Path-limited parents are rewritten by Git to the preceding marker events.
  // Full history retains both sides of merges; simplify-merges drops only events
  // which do not affect this path. Each changing commit is checked, not just HEAD.
  const events = git('rev-list', '--full-history', '--simplify-merges', '--parents',
    '--reverse', '--topo-order', head, '--', 'FREEZE.md').trim().split('\n').filter(Boolean);
  const states = new Map();
  let state = null;
  for (const event of events) {
    const [ref, ...parents] = event.split(' ');
    const prior = latest(parents.map(parent => states.get(parent)));
    const bytes = markerAt(ref);
    if (prior && bytes === prior.bytes) { states.set(ref, prior); state = prior; continue; }
    if (bytes === null) throw new Error(`FREEZE.md deletion forbidden; supersedes marker required ${prior ? provenance(prior.marker) : ''}`);
    let marker;
    try { marker = parseMarker(bytes); }
    catch (error) {
      throw new Error(`${error.message}; FREEZE.md supersedes invalid; ${signature(ref) ?? 'signature verified'} ${prior ? provenance(prior.marker) : ''}`);
    }
    if (prior) {
      const defects = [];
      const chain = marker.supersedes;
      if (!chain || typeof chain !== 'object' || Array.isArray(chain) ||
          !/^[0-9a-f]{64}$/.test(chain.markerSha256) || !/^[0-9a-f]{40}$/.test(chain.pinnedRevision)) {
        defects.push('supersedes missing or malformed: markerSha256 and pinnedRevision required');
      } else if (chain.markerSha256 !== digest(prior.bytes) || chain.pinnedRevision !== prior.marker.pinnedRevision) {
        defects.push('supersedes mismatch: markerSha256 and pinnedRevision must match the marker in force');
      }
      const defect = signature(ref);
      if (defect) defects.push(defect);
      if (defects.length) throw new Error(`FREEZE.md ${ref}: ${defects.join('; ')} ${provenance(prior.marker)}`);
    } else if (marker.supersedes !== undefined) {
      throw new Error('FREEZE.md supersedes has no predecessor in declaration history');
    }
    state = { ref, bytes, marker, lineage: [...(prior?.lineage ?? []), ref] };
    states.set(ref, state);
  }
  if (state && markerAt(head) !== state.bytes) throw new Error('FREEZE.md supersedes history does not resolve to HEAD');
  return state;
}
function parseMarker(bytes) {
  let marker;
  try { marker = JSON.parse(bytes); } catch { throw new Error('unreadable FREEZE.md: expected JSON'); }
  const a = marker?.authority;
  if (!marker?.window || !/^[0-9a-f]{40}$/.test(marker.pinnedRevision) ||
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
  const declared = declaration(head);
  const baseDeclaration = base ? declaration(base) : null;
  // An older PR head can precede a base transition; unrelated/forked chains cannot.
  latest([declared, baseDeclaration]);
  if (baseDeclaration && !declared) throw new Error('FREEZE.md deletion or missing supersedes declaration relative to base');
  const headMarker = markerAt(head);
  // --marker is a local historical-audit aid; workflows never accept an override.
  const bytes = declared?.bytes ?? headMarker ?? (auditMarker ? readFileSync(auditMarker, 'utf8') : null);
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
  const paths = [...new Set(offending)].sort();
  const summary = `window=${marker.window} record=${authority} pin=${pin} frozenFiles=${inventory.length} changedPaths=${changed.length}`;
  if (paths.length) {
    console.error(`freeze REFUSED ${summary}\n${paths.map(path => `  ${path}`).join('\n')}\nHold scoring changes. ${marker.closingConditions} Marker changes require a matching supersedes chain and operator signature; deletion is forbidden.`);
    process.exitCode = 1;
  } else console.log(`freeze PASS ${summary}`);
}
try { main(); } catch (error) {
  console.error(`freeze REFUSED unreadable: ${error.message}`);
  process.exitCode = 1;
}
