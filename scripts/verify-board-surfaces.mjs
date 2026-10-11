#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://cejel.dev/leaderboard/';
const BOARD_FILES = ['leaderboard.md', 'leaderboard.html', 'index.html'];
const RETAINED_FILES = new Set(['README.md', 'corpus.json', 'RUBRIC_CHANGELOG.md']);

// Immutable explanation, from the withdrawal heading up to (but excluding) Status.
// Re-pinned 2026-09-28: the operator redacted the private engine path from the finding under the
// 2026-08-18 disclosure boundary (cejel-site #97 and #100; the page carries a dated redaction note).
// Claim, finding, scope and condition are otherwise unchanged. Live Markdown and HTML both
// normalize to 1672 characters with this digest. Previous pin (2026-09-10, 1662 characters):
// b112d06837c66ee269b46fdb8c844ea9d7816095d0666419702717ee582752e4.
// Status may evolve; any other change to this text is a finding, not a re-pin.
const WITHDRAWAL_SHA256 = '8d684b04ada204ed20ba9ac38836a26c8fa2dc6556be872adf839c9c8ba8d30b';

export function withdrawalDigest(text) {
  const visible = text.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const section = /2026-08-18:\s*scores withdrawn and why([\s\S]*?)Status:/i.exec(visible)?.[1];
  if (!section) return null;
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', middot: '·' };
  const normalized = section.replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|middot);/gi, (match, entity) => {
      if (entity.startsWith('#')) {
        const value = entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return value <= 0x10ffff ? String.fromCodePoint(value) : match;
      }
      return entities[entity.toLowerCase()];
    }).replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// Shared ranks (operator ruling 2026-10-11, #431): rows with equal rounded comparable scores share
// a rank (standard competition ranking, 1 1 1 1 5). Boards before 0.6.3 broke ties by name, and the
// live historical board still does, so the rule applies only to a board declaring 0.6.3 or later.
const SHARED_RANKS_FROM = [0, 6, 3];

// A version header that does not parse as a published X.Y.Z is an error, never "no shared ranks":
// the rank check must not switch itself off silently.
function declaresSharedRanks(surfaceName, versionSpec) {
  const version = /^@cejel\/cejel@(\d+)\.(\d+)\.(\d+)$/.exec(versionSpec ?? '');
  if (!version) {
    throw new Error(`${surfaceName}: board version header ${JSON.stringify(versionSpec)} is not a published @cejel/cejel@X.Y.Z, so the shared-rank rule cannot be decided`);
  }
  const parts = version.slice(1).map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] !== SHARED_RANKS_FROM[index]) return parts[index] > SHARED_RANKS_FROM[index];
  }
  return true;
}

// Ranked rows as printed, in display order: rank, repository name, comparable score. Markdown reads
// the Ranking table's | rank | [name](url) | category | license | overall | comparable | columns;
// HTML reads <tr><td>rank</td><td>name</td>...<td class="ranked-score">comparable</td>.
export function parseRankedRows(name, text) {
  if (name.endsWith('.md')) {
    return [...text.matchAll(/^\| *(\d+) *\| \[([^\]]+)\]\([^)]*\) \|[^|]*\|[^|]*\|[^|]*\| *([^|]*?) *\|/gm)]
      .map((match) => ({ rank: Number(match[1]), name: match[2], comparable: match[3] }));
  }
  return [...text.matchAll(/<tr><td>(\d+)<\/td><td>(?:<a [^>]*>)?([^<]+)(?:<\/a>)?<\/td>(?:<td[^>]*>[^<]*<\/td>){3}<td class="ranked-score">([^<]*)<\/td>/g)]
    .map((match) => ({ rank: Number(match[1]), name: match[2], comparable: match[3] }));
}

// Violations of the shared-rank rule within one surface's ranked rows.
export function sharedRankViolations(surfaceName, rows) {
  if (rows.length === 0) return [`${surfaceName}: no ranked rows parsed from a board that declares shared ranks`];
  const violations = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    const expected = index > 0 && previous.comparable === row.comparable ? previous.rank : index + 1;
    if (row.rank !== expected) {
      violations.push(`${surfaceName}: ${row.name} is ranked ${row.rank} at comparable ${row.comparable}; shared ranks require ${expected}`);
    }
  });
  return violations;
}

// Every board, whatever its version: comparable scores are numbers and never increase down the
// ranked table.
export function rankOrderViolations(surfaceName, rows) {
  const violations = [];
  rows.forEach((row, index) => {
    if (!/^\d+(?:\.\d+)?$/.test(row.comparable)) {
      violations.push(`${surfaceName}: ${row.name} has comparable score ${JSON.stringify(row.comparable)}, not a number`);
      return;
    }
    const previous = rows[index - 1];
    if (index > 0 && Number(row.comparable) > Number(previous.comparable)) {
      violations.push(`${surfaceName}: ${row.name} (${row.comparable}) is listed below ${previous.name} (${previous.comparable})`);
    }
  });
  return violations;
}

export function parseSurface(name, text) {
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|middot);/g, ' ');
  const fields = {};
  for (const [key, pattern] of [
    ['version', /Cejel version:\s*(@cejel\/cejel@[^\s<)]+)/g],
    ['rubric', /Rubric version:\s*(witan-rubric-[^\s<)]+)/g],
    ['date', /Run date:\s*(\d{4}-\d{2}-\d{2}T[^\s<]+)/g],
  ]) {
    const values = [...plain.matchAll(pattern)].map((match) => match[1]);
    if (values.length !== 1) throw new Error(`${name}: expected exactly one ${key} header, found ${values.length}`);
    fields[key] = values[0];
  }
  return {
    name,
    ...fields,
    withdrawal: withdrawalDigest(text) === WITHDRAWAL_SHA256,
    ranking: parseRankedRows(name, text),
  };
}

export function compareSurfaces(surfaces) {
  if (surfaces.length === 0) throw new Error('No public board surfaces checked');
  const errors = [];
  for (const surface of surfaces) {
    for (const key of ['version', 'rubric', 'date']) {
      if (surface[key] !== surfaces[0][key]) errors.push(`${surface.name}: ${key} ${surface[key]} != ${surfaces[0][key]}`);
    }
    // The withdrawal is permanent, including after a corrected run replaces the scores.
    if (!surface.withdrawal) errors.push(`${surface.name}: missing or changed 2026-08-18 withdrawal record`);
  }
  for (const surface of surfaces) errors.push(...rankOrderViolations(surface.name, surface.ranking));
  // Shared ranks are checked only where the board declares them (0.6.3 and later), so the live
  // historical board, which broke ties by name, does not go red.
  const ranked = [];
  for (const surface of surfaces) {
    try {
      if (declaresSharedRanks(surface.name, surface.version)) ranked.push(surface);
    } catch (error) {
      errors.push(error.message);
    }
  }
  for (const surface of ranked) {
    errors.push(...sharedRankViolations(surface.name, surface.ranking));
    const reference = JSON.stringify(ranked[0].ranking);
    if (JSON.stringify(surface.ranking) !== reference) {
      errors.push(`${surface.name}: ranked rows differ from ${ranked[0].name}`);
    }
  }
  return errors;
}

export function assertSiteOnly(root) {
  const directory = join(root, 'leaderboard');
  const forbidden = existsSync(directory)
    ? readdirSync(directory).filter((name) => !RETAINED_FILES.has(name)) : [];
  if (forbidden.length) throw new Error(`Repository must not publish a second scored board: ${forbidden.join(', ')}`);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  if (!readme.includes(`](${SITE})`)) throw new Error('README must link the canonical site board');
  if (/\]\((?:\.\/)?leaderboard\/(?:reports\/|leaderboard\.|index\.)/.test(readme)) {
    throw new Error('README links a removed local scored artifact');
  }
  if (/3\.3\/4\.0 on its rubric-native certificate|Every score is produced by the same\s+sealed public scorer/.test(readme)) {
    throw new Error('README retains the withdrawn board claim');
  }
}

export async function verifyBoardSurfaces(root, siteDirectory) {
  const surfaces = [];
  for (const filename of BOARD_FILES) {
    const path = join(root, 'leaderboard', filename);
    if (existsSync(path)) surfaces.push(parseSurface(`repo/${filename}`, readFileSync(path, 'utf8')));
    let text;
    if (siteDirectory) text = readFileSync(join(siteDirectory, filename), 'utf8');
    else {
      const url = filename === 'index.html' ? SITE : SITE + filename;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      text = await response.text();
    }
    surfaces.push(parseSurface(`site/${filename}`, text));
  }
  const errors = compareSurfaces(surfaces);
  try { assertSiteOnly(root); } catch (error) { errors.push(error.message); }
  return { surfaces, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyBoardSurfaces(fileURLToPath(new URL('..', import.meta.url)), process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    console.log(`BOARD SURFACES: ${result.errors.length ? 'RED' : 'OK'} — ${result.surfaces.length} artifacts checked, ${result.errors.length} violations`);
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.error(`BOARD SURFACES: RED — ${error.message}`);
    process.exitCode = 1;
  }
}
