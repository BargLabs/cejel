#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Fail-loud check that every cejel commit cited in the experiment record resolves (#368).
//
// 0.4.9 (#306) was squash-merged: its preregistration commits became ancestors of nothing on
// main while result.md and RUBRIC_CHANGELOG.md still cited them, until an erratum and the tag
// evidence/v17-delta-0.4.9-preregistrations. The D2-D4 acceptance preregistrations (#64-#66)
// had the same defect six weeks earlier and nobody noticed. This check makes that state a red
// build. Measurement behind every rule below: docs/cited-commits-inventory-2026-10-02.md.
//
// Scope: every hexadecimal token of 7 to 40 lowercase characters, bounded by non-alphanumerics,
// in docs/experiments/** and leaderboard/RUBRIC_CHANGELOG.md.
//
// RULE 1 (objects). A token that resolves to a commit in this repository must be reachable
// from the main ref or from an evidence/* tag; otherwise the check fails and names file, line
// and token. A token that resolves to a blob or tree is ignored. A short token that matches
// several objects is treated like a token that resolves to nothing. A squash-merged branch's
// commits survive only under GitHub's refs/pull/*/head, so the workflow fetches those refs
// before running: that turns a squashed-away preregistration into an unreachable commit here
// instead of a token that resolves to nothing. The pull refs make the object findable; they
// never count as reachability.
//
// RULE 2 (grammar, prose only). A token that resolves to nothing is a cejel commit citation,
// and fails, when all of these hold:
//   (a) it is in a Markdown file. JSON/JSONL/TSV/CSV tokens are excluded: on 2026-10-02 they
//       were 26,364 of 27,271 occurrences, dominated by external-repository revisions keyed
//       as data (`revision`, `revisionAtOrderFreeze`, `pinnedRevision`, ...). A JSON value
//       that resolves to a commit is still held to rule 1;
//   (b) it contains a letter a-f (a run of decimal digits is a number, not a citation);
//   (c) its sentence, with backticked code spans removed, carries a commit label: commit(s),
//       committed, merge(s/d), squash(ed), or a preregistration/preregistered word. A sentence
//       ends at . ! or ? followed by whitespace and at a blank line; a Markdown table row is
//       one sentence;
//   (d) no other repository is named in that sentence or in the prose sentence before it:
//       alfred, lab_notes, a `packages/` path (cejel has no packages/ directory; such a path
//       is in alfred's monorepo), "private" (this record's word for
//       alfred's private repository), upstream, an `owner/repo@` reference other than
//       BargLabs/cejel, or a github.com URL other than BargLabs/cejel;
//   (e) it is not a digest: not preceded by sha256/sha512/digest/patch id, not followed by an
//       ellipsis (`dc723f53…` is a truncated SHA-256);
//   (f) no occurrence of the token, or of a longer or shorter form of it, anywhere in the
//       scanned record is attributed to another repository by (d) or by a JSON key naming
//       alfred/private/upstream/lab_notes.
// An explicit `BargLabs/cejel@<sha>` or `cejel <sha>` citation must resolve regardless of (c).
// On 2026-10-02 this grammar flagged 14 distinct tokens on main: 5 lost cejel commits, 3
// undetermined, 6 other repositories' commits. It errs toward missing a citation (a recall
// gap) rather than failing a build on an alfred commit; an alfred or external citation it does
// flag is fixed by naming the repository, e.g. `owner/repo@sha`.
//
// Pull-request mode (--pending-ref HEAD): a commit reachable from the PR head but not from
// main is reported as PENDING and does not fail. It is only safe if the PR merges with
// --merge; a squash leaves it unreachable and the push-to-main run then fails.
//
// No allowlist. A current failure is remedied by an evidence/* tag on the cited commit (when
// the object still exists, e.g. under refs/pull/*/head) or by an entry in the citation errata
// register, docs/experiments/CITATION-ERRATA.json. Preregistrations are never edited.
//
// ERRATA. A register entry names one exact token and the exact file and line of each bare
// citation it corrects; no wildcard, no prefix match. It clears only a rule-2 failure at one
// of those locations (a rule-1 failure is remedied by a tag). Dispositions:
//   lost-in-squash   - `carrier` is the full id of the squash commit that carries the bytes and
//                      `pr` its pull request. Verified: the carrier is a single-parent commit
//                      reachable from main whose subject ends in `(#<pr>)`.
//   other-repository - `repository` is `owner/repo`, not BargLabs/cejel, or exactly
//                      `private-repository (withheld)` for a private repository this public
//                      register does not name. This check cannot reach other repositories, so
//                      the attribution is accepted and printed.
//   withheld-by-ruling - the one exception to "a rule-1 failure is remedied by a tag": an
//                      operator ruling (`ruling`) withholds the evidence tag because the tagged
//                      tree would put label-class paths on a public ref. `pr` names the pull
//                      request whose head still carries the commit. Verified: the cited commit
//                      is an ancestor of refs/remotes/origin-pr/<pr> (the workflow fetches every
//                      refs/pull/*/head there) and is not reachable from main. It clears only a
//                      rule-1 (unreachable) failure; the other two clear only rule-2 failures.
// A location that matches no flagged citation fails: a stale correction is a defect too.

export const SCANNED_PATHS = ['docs/experiments', 'leaderboard/RUBRIC_CHANGELOG.md'];
export const EVIDENCE_TAG_PREFIX = 'refs/tags/evidence/';
export const ERRATA_PATH = 'docs/experiments/CITATION-ERRATA.json';
export const ERRATA_SCHEMA = 'cejel-citation-errata-v1';

const HEX_TOKEN = /(?<![0-9A-Za-z])[0-9a-f]{7,40}(?![0-9A-Za-z])/g;
const COMMIT_LABEL = /\b(commit|commits|committed|merge|merges|merged|squash|squashed|preregist\w*)\b/i;
const OTHER_REPOSITORY_WORD = /\b(alfred|lab[_-]notes|private|upstream)\b|\bpackages\/|github\.com\/(?!BargLabs\/cejel\b)/i;
const OTHER_REPOSITORY_KEY = /"[\w-]*(alfred|private|upstream|lab_?notes)[\w-]*"\s*:\s*"?$/i;
const OWNER_REPO_AT =/(?<![\w.-])([\w.-]+\/[\w.-]+)@[0-9a-f]/g;

function namesOtherRepository(sentence) {
  if (OTHER_REPOSITORY_WORD.test(sentence)) return true;
  for (const m of sentence.matchAll(OWNER_REPO_AT)) {
    if (m[1].toLowerCase() !== 'barglabs/cejel') return true;
  }
  return false;
}
const EXPLICIT_CEJEL = /(BargLabs\/cejel@|\bcejel\s+`?)$/i;
const PROSE_FILE = /\.md$/;
const CODE_SPAN = /`[^`\n]*`/g;
const DIGEST_BEFORE = /(sha-?256|sha-?512|digest|patch[ -]?id)[\s:=`(]*$/i;

/**
 * @param {string} text
 * @returns {{line: number, column: number, token: string, lineText: string, offset: number}[]}
 */
export function extractTokens(text) {
  const out = [];
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i];
    for (const match of lineText.matchAll(HEX_TOKEN)) {
      out.push({ line: i + 1, column: match.index + 1, token: match[0], lineText, offset: offset + match.index });
    }
    offset += lineText.length + 1;
  }
  return out;
}

/**
 * Sentence spans [start, end) over a Markdown document: a table row is one sentence; prose
 * splits at a blank line and at . ! ? followed by whitespace.
 * @param {string} text
 * @returns {[number, number][]}
 */
export function sentenceSpans(text) {
  const spans = [];
  let start = 0;
  let offset = 0;
  const flush = (end) => {
    if (end > start) spans.push([start, end]);
    start = end;
  };
  for (const line of text.split('\n')) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('|')) {
      flush(lineStart);
      flush(lineEnd + 1);
    } else {
      for (const m of line.matchAll(/[.!?](?=\s|$)/g)) flush(lineStart + m.index + 1);
    }
    offset = lineEnd + 1;
  }
  flush(text.length);
  return spans;
}

/**
 * Rule 2: is a token that resolves to nothing a cejel commit citation?
 * @param {string} file
 * @param {string} text whole file
 * @param {{token: string, offset: number}} occurrence
 * @param {[number, number][]} spans from sentenceSpans(text)
 */
export function isCejelCitation(file, text, occurrence, spans) {
  if (!PROSE_FILE.test(file)) return false;
  if (!/[a-f]/.test(occurrence.token)) return false;
  const before = text.slice(Math.max(0, occurrence.offset - 40), occurrence.offset);
  const after = text.slice(occurrence.offset + occurrence.token.length, occurrence.offset + occurrence.token.length + 3);
  if (EXPLICIT_CEJEL.test(before)) return true;
  if (DIGEST_BEFORE.test(before) || /^(…|\.\.\.)/.test(after)) return false;
  const { sentence, window } = sentenceContext(text, spans, occurrence.offset);
  return COMMIT_LABEL.test(sentence.replace(CODE_SPAN, ' ')) && !namesOtherRepository(window);
}

/**
 * The sentence holding an offset, and the window rule 2 (d) reads for another repository's
 * name: that sentence plus the one before it when both are prose in the same paragraph.
 */
export function sentenceContext(text, spans, offset) {
  const i = spans.findIndex(([s, e]) => offset >= s && offset < e);
  if (i < 0) return { sentence: '', window: '' };
  const sentence = text.slice(spans[i][0], spans[i][1]);
  const isProse = (t) => t.trim() !== '' && !t.trim().startsWith('|');
  let start = spans[i][0];
  if (i > 0 && isProse(sentence) && isProse(text.slice(spans[i - 1][0], spans[i - 1][1]))) start = spans[i - 1][0];
  return { sentence, window: text.slice(start, spans[i][1]) };
}

function git(cwd, args, input) {
  return execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Resolve each distinct token to an object in this repository.
 * @returns {Map<string, {type: string, oid?: string}>} type is a git object type, 'missing' or 'ambiguous'
 */
export function resolveTokens(cwd, tokens) {
  const distinct = [...new Set(tokens)];
  const result = new Map();
  if (distinct.length === 0) return result;
  const out = git(cwd, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], `${distinct.join('\n')}\n`);
  const lines = out.split('\n').filter((l) => l.length > 0);
  if (lines.length !== distinct.length) {
    throw new Error(`cat-file returned ${lines.length} lines for ${distinct.length} tokens`);
  }
  for (let i = 0; i < distinct.length; i += 1) {
    const line = lines[i];
    if (line.endsWith(' missing')) result.set(distinct[i], { type: 'missing' });
    else if (line.endsWith(' ambiguous')) result.set(distinct[i], { type: 'ambiguous' });
    else {
      const [oid, type] = line.split(' ');
      result.set(distinct[i], { type, oid });
    }
  }
  // An annotated tag object cited by id stands for the commit it points at.
  for (const [token, entry] of result) {
    if (entry.type !== 'tag') continue;
    const peeled = git(cwd, ['rev-parse', '--verify', '--quiet', `${entry.oid}^{commit}`]).trim();
    result.set(token, peeled ? { type: 'commit', oid: peeled } : entry);
  }
  return result;
}

/** @returns {Set<string>} every commit id reachable from the given revisions */
export function reachableSet(cwd, revs) {
  if (revs.length === 0) return new Set();
  const out = git(cwd, ['rev-list', ...revs, '--']);
  return new Set(out.split('\n').filter(Boolean));
}

export function evidenceTagRefs(cwd) {
  const out = git(cwd, ['for-each-ref', '--format=%(refname)', EVIDENCE_TAG_PREFIX]);
  return out.split('\n').filter(Boolean);
}

/**
 * @returns {'main'|'evidence'|'pending'|'unreachable'|'blob-or-tree'|'ambiguous'|'nothing'}
 */
export function classify(entry, sets) {
  if (entry.type === 'missing') return 'nothing';
  if (entry.type === 'ambiguous') return 'ambiguous';
  if (entry.type === 'blob' || entry.type === 'tree') return 'blob-or-tree';
  if (entry.type !== 'commit') return 'nothing';
  if (sets.main.has(entry.oid)) return 'main';
  if (sets.evidence.has(entry.oid)) return 'evidence';
  if (sets.pending.has(entry.oid)) return 'pending';
  return 'unreachable';
}

// The errata register is the correction record, not a citing record: it names each corrected
// token by design, so scanning it would flag every withheld-by-ruling token a second time.
export function listScannedFiles(cwd) {
  const out = git(cwd, ['ls-files', '-z', '--', ...SCANNED_PATHS]);
  return out.split('\0').filter((path) => path && path !== ERRATA_PATH);
}

/**
 * Classify every token in the scanned files.
 * @param {{cwd: string, mainRef: string, pendingRef?: string}} opts
 */
export function inventory({ cwd, mainRef, pendingRef }) {
  const occurrences = [];
  for (const file of listScannedFiles(cwd)) {
    const text = readFileSync(join(cwd, file), 'utf8');
    const prose = PROSE_FILE.test(file);
    const spans = prose ? sentenceSpans(text) : [];
    for (const t of extractTokens(text)) {
      const attributesOther = prose
        ? namesOtherRepository(sentenceContext(text, spans, t.offset).window)
        : OTHER_REPOSITORY_KEY.test(t.lineText.slice(0, t.column - 1));
      occurrences.push({ file, ...t, attributesOther, citation: isCejelCitation(file, text, t, spans) });
    }
  }
  // Rule 2 (e): a token attributed to another repository anywhere in the scanned record, or a
  // short form of one, is that repository's commit wherever else it appears.
  const attributed = occurrences.filter((o) => o.attributesOther).map((o) => o.token);
  for (const o of occurrences) {
    if (o.citation && attributed.some((a) => a.startsWith(o.token) || o.token.startsWith(a))) o.citation = false;
  }
  git(cwd, ['rev-parse', '--verify', '--quiet', `${mainRef}^{commit}`]);
  const resolved = resolveTokens(cwd, occurrences.map((o) => o.token));
  const main = reachableSet(cwd, [mainRef]);
  const evidence = reachableSet(cwd, evidenceTagRefs(cwd));
  const pending = pendingRef ? reachableSet(cwd, [pendingRef]) : new Set();
  for (const o of occurrences) {
    o.resolved = resolved.get(o.token);
    o.class = classify(o.resolved, { main, evidence, pending });
  }
  return occurrences;
}

/**
 * @returns {{failures: object[], pending: object[]}}
 */
export function evaluate(occurrences) {
  const failures = [];
  const pending = [];
  for (const o of occurrences) {
    if (o.class === 'unreachable') {
      failures.push({ ...o, reason: 'commit in this repository, reachable from neither main nor an evidence/* tag' });
    } else if ((o.class === 'nothing' || o.class === 'ambiguous') && o.citation) {
      failures.push({ ...o, reason: `cited as a cejel commit but resolves to ${o.class === 'ambiguous' ? 'several objects' : 'nothing'}` });
    } else if (o.class === 'pending') {
      pending.push(o);
    }
  }
  return { failures, pending };
}

const FULL_TOKEN = /^[0-9a-f]{7,40}$/;
const FULL_OID = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OWNER_REPO = /^[\w.-]+\/[\w.-]+$/;
// A private repository is not named on this public surface (alfred #2453); this exact literal
// stands in for its owner/repo.
export const WITHHELD_REPOSITORY = 'private-repository (withheld)';

/**
 * Read and validate the errata register. A missing register is empty; a malformed one throws.
 * @returns {object[]} entries
 */
export function loadErrata(cwd) {
  const path = join(cwd, ERRATA_PATH);
  if (!existsSync(path)) return [];
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  if (doc?.schema !== ERRATA_SCHEMA) problems.push(`schema must be ${ERRATA_SCHEMA}`);
  if (!Array.isArray(doc?.entries)) problems.push('entries must be an array');
  const seen = new Set();
  for (const [i, e] of (Array.isArray(doc?.entries) ? doc.entries : []).entries()) {
    const at = `entry ${i} (${e?.token})`;
    if (typeof e?.token !== 'string' || !FULL_TOKEN.test(e.token)) problems.push(`${at}: token must be 7-40 lowercase hex`);
    if (!Array.isArray(e?.locations) || e.locations.length === 0) problems.push(`${at}: locations must be a non-empty array`);
    for (const loc of Array.isArray(e?.locations) ? e.locations : []) {
      if (typeof loc?.file !== 'string' || loc.file === '' || !Number.isInteger(loc?.line) || loc.line < 1) {
        problems.push(`${at}: every location needs a file and a positive integer line`);
        continue;
      }
      const key = `${e.token}\0${loc.file}\0${loc.line}`;
      if (seen.has(key)) problems.push(`${at}: ${loc.file}:${loc.line} is listed twice`);
      seen.add(key);
    }
    if (typeof e?.date !== 'string' || !DATE.test(e.date)) problems.push(`${at}: date must be YYYY-MM-DD`);
    if (typeof e?.reason !== 'string' || e.reason.trim() === '') problems.push(`${at}: reason is required`);
    if (e?.disposition === 'lost-in-squash') {
      if (typeof e.carrier !== 'string' || !FULL_OID.test(e.carrier)) problems.push(`${at}: carrier must be a full 40-hex commit id`);
      if (!Number.isInteger(e.pr) || e.pr < 1) problems.push(`${at}: pr must be a positive integer`);
    } else if (e?.disposition === 'withheld-by-ruling') {
      if (!Number.isInteger(e.pr) || e.pr < 1) problems.push(`${at}: pr must be a positive integer`);
      if (typeof e.ruling !== 'string' || e.ruling.trim() === '') problems.push(`${at}: ruling is required`);
    } else if (e?.disposition === 'other-repository') {
      const ownerRepo = typeof e.repository === 'string' && OWNER_REPO.test(e.repository) && e.repository.toLowerCase() !== 'barglabs/cejel';
      if (!ownerRepo && e.repository !== WITHHELD_REPOSITORY) {
        problems.push(`${at}: repository must be owner/repo other than BargLabs/cejel, or exactly "${WITHHELD_REPOSITORY}"`);
      }
    } else {
      problems.push(`${at}: disposition must be lost-in-squash, other-repository or withheld-by-ruling`);
    }
  }
  if (problems.length > 0) throw new Error(`${ERRATA_PATH} is malformed:\n  ${problems.join('\n  ')}`);
  return doc.entries;
}

/**
 * Verify what can be verified of one entry from this repository.
 * @returns {string|null} the reason it fails, or null
 */
export function verifyErratum(cwd, mainRef, entry) {
  if (entry.disposition === 'withheld-by-ruling') return verifyWithheld(cwd, mainRef, entry);
  if (entry.disposition !== 'lost-in-squash') return null;
  let parents;
  let subject;
  try {
    [parents, subject] = git(cwd, ['log', '-1', '--format=%P%x00%s', `${entry.carrier}^{commit}`, '--']).replace(/\n$/, '').split('\0');
  } catch {
    return `errata carrier ${entry.carrier} is not a commit in this repository`;
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', entry.carrier, mainRef]);
  } catch {
    return `errata carrier ${entry.carrier} is not reachable from ${mainRef}`;
  }
  if (parents.split(' ').filter(Boolean).length !== 1) return `errata carrier ${entry.carrier} is not a single-parent squash commit`;
  if (!subject.trimEnd().endsWith(`(#${entry.pr})`)) return `errata carrier ${entry.carrier} subject does not end in (#${entry.pr}): ${subject}`;
  return null;
}

function verifyWithheld(cwd, mainRef, entry) {
  const pullRef = `refs/remotes/origin-pr/${entry.pr}`;
  let commit;
  try {
    commit = git(cwd, ['rev-parse', '--verify', '--quiet', `${entry.token}^{commit}`]).trim();
  } catch {
    return `withheld commit ${entry.token} is not a commit in this repository (fetch refs/pull/${entry.pr}/head)`;
  }
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', `${pullRef}^{commit}`]);
  } catch {
    return `${pullRef} is absent: fetch +refs/pull/*/head:refs/remotes/origin-pr/* before running`;
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', commit, pullRef]);
  } catch {
    return `withheld commit ${entry.token} is not reachable from refs/pull/${entry.pr}/head`;
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', commit, mainRef]);
    return `withheld commit ${entry.token} is reachable from ${mainRef}; the entry is stale`;
  } catch {
    return null;
  }
}

/**
 * Clear the failures a verified register entry names by exact token, file and line: rule-2
 * failures for lost-in-squash and other-repository, rule-1 failures for withheld-by-ruling.
 * Unverifiable entries leave their failures standing with the reason; unused locations fail.
 * @returns {{failures: object[], corrected: object[]}}
 */
export function applyErrata(failures, entries, verify) {
  const byKey = new Map();
  for (const entry of entries) {
    for (const loc of entry.locations) byKey.set(`${entry.token}\0${loc.file}\0${loc.line}`, { entry, loc, used: false });
  }
  const problem = new Map(entries.map((e) => [e, verify(e)]));
  const remaining = [];
  const corrected = [];
  for (const f of failures) {
    const candidate = byKey.get(`${f.token}\0${f.file}\0${f.line}`);
    const ruleTwo = f.class === 'nothing' || f.class === 'ambiguous';
    const ruleOne = f.class === 'unreachable';
    const hit =
      candidate &&
      ((ruleTwo && candidate.entry.disposition !== 'withheld-by-ruling') ||
        (ruleOne && candidate.entry.disposition === 'withheld-by-ruling'))
        ? candidate
        : undefined;
    if (!hit) {
      remaining.push(f);
      continue;
    }
    hit.used = true;
    const why = problem.get(hit.entry);
    if (why) remaining.push({ ...f, reason: why });
    else corrected.push({ ...f, erratum: hit.entry });
  }
  for (const { entry, loc, used } of byKey.values()) {
    if (!used) remaining.push({ file: loc.file, line: loc.line, token: entry.token, reason: 'errata entry matches no flagged citation (a stale correction)' });
  }
  return { failures: remaining, corrected };
}

function describeErratum(e) {
  if (e.disposition === 'withheld-by-ruling') {
    return `evidence tag withheld by ruling (${e.ruling}); reachable only from refs/pull/${e.pr}/head (verified)`;
  }
  return e.disposition === 'lost-in-squash'
    ? `lost in the squash of #${e.pr}; bytes carried by ${e.carrier} on main (verified)`
    : `other repository ${e.repository} (attribution accepted, not verifiable offline)`;
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv, cwd = process.cwd(), out = process.stdout, err = process.stderr) {
  const mainRef = argValue(argv, '--main-ref') ?? 'origin/main';
  const pendingRef = argValue(argv, '--pending-ref');
  const occurrences = inventory({ cwd, mainRef, pendingRef });
  if (argv.includes('--inventory')) {
    for (const o of occurrences) {
      const { file, line, token, class: cls, citation } = o;
      out.write(`${JSON.stringify({ file, line, token, class: cls, type: o.resolved.type, oid: o.resolved.oid, citation, lineText: o.lineText })}\n`);
    }
    return 0;
  }
  const entries = loadErrata(cwd);
  const evaluated = evaluate(occurrences);
  const { pending } = evaluated;
  const { failures, corrected } = applyErrata(evaluated.failures, entries, (e) => verifyErratum(cwd, mainRef, e));
  for (const c of corrected) {
    out.write(`ERRATUM ${c.file}:${c.line} ${c.token} -- ${describeErratum(c.erratum)}: ${c.erratum.reason}\n`);
  }
  for (const p of pending) {
    out.write(`PENDING ${p.file}:${p.line} ${p.token} -- reachable only from ${pendingRef}; merge with --merge, never squash\n`);
  }
  for (const f of failures) {
    err.write(`FAIL ${f.file}:${f.line} ${f.token} -- ${f.reason}\n`);
  }
  const evidenceTags = evidenceTagRefs(cwd).length;
  out.write(
    `cited-commits: ${occurrences.length} tokens scanned against ${mainRef} and ${evidenceTags} evidence/* tag(s); ` +
      `${failures.length} failure(s), ${pending.length} pending, ${corrected.length} corrected by errata\n`,
  );
  return failures.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
