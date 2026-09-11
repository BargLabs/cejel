#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://cejel.dev/leaderboard/';
const BOARD_FILES = ['leaderboard.md', 'leaderboard.html', 'index.html'];
const RETAINED_FILES = new Set(['README.md', 'corpus.json', 'RUBRIC_CHANGELOG.md']);

// Immutable explanation, from the withdrawal heading up to (but excluding) Status.
// Independently normalized live Markdown and HTML on 2026-09-10: 1662 characters,
// identical SHA-256. Status may evolve; the claim, finding, scope and condition may not.
const WITHDRAWAL_SHA256 = 'b112d06837c66ee269b46fdb8c844ea9d7816095d0666419702717ee582752e4';

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
  return { name, ...fields, withdrawal: withdrawalDigest(text) === WITHDRAWAL_SHA256 };
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
