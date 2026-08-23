#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const OPERATOR_HOME = os.homedir();
const projectPath = (name) => path.join(OPERATOR_HOME, 'projects', name);

const SOURCES = [
  ['/tmp/stratum-b-primary.json', {
    'BargLabs/alfred': [projectPath('alfred'), '76a631be63cf1be2cd4d9c6b303626a7124864c4'],
    'BargLabs/cejel': [projectPath('cejel'), '97564ad17ddde4c64d213f78c98d316c01b0c12a'],
  }],
  ['/tmp/stratum-b-egbert.json', { 'BargStudio/egbert': [projectPath('egbert'), 'b8346c235a9607c0efff31af6bb44a25ee4d16bb'] }],
  ['/tmp/stratum-b-site-machine.json', { 'houman44/site-machine': [projectPath('site-machine'), '1e4106f131f9af27a9a314a0dbb2ecc35c09b441'] }],
  ['/tmp/stratum-b-edwin.json', { 'houman44/edwin': [projectPath('edwin'), '8a9e006d1bae6653f253608ddc11eb93570fc5a1'] }],
  ['/tmp/stratum-b-therasyn.json', { 'BargStudio/therasyn': [projectPath('therasyn'), '39f228590c2b2ecb47ddb420709d15c9271ad65a'] }],
  ['/tmp/stratum-b-edwy.json', { 'BargLabs/edwy': [projectPath('edwy'), '99c1139ba187d7181ff9923edd782f66cc599aec'] }],
  ['/tmp/stratum-b-knut.json', { 'houman44/knut': [projectPath('knut'), '4609f13c43f8b772db2aee7020bd9dad8ffeca16'] }],
  ['/tmp/stratum-b-wilfrid.json', { 'BargLabs/wilfrid': [projectPath('wilfrid'), 'da0a474d361dd472c92e59c07b63b6139c390e42'] }],
  ['/tmp/stratum-b-barglabs-site.json', { 'houman44/barglabs-site': [projectPath('barglabs-site'), '1e164da9400b0c7b8f073f2df5bafad3af48d643'] }],
  ['/tmp/stratum-b-cejel-site.json', { 'BargLabs/cejel-site': [projectPath('cejel-site'), '5ed796e3dc9926ae69e0b2b018026c099d211a2e'] }],
];

const B1 = new Map([
  ['5978eeddafb247b8f81238331fd8ae1adb55fc30', 'Outside D1-D8'],
  ['8e6e7951eed2a088c24bbb614b1900448773c15d', 'Outside D1-D8'],
]);

const B2 = new Map([
  ['520011e12e75468de423b453621298e28df359e1', 'Outside D1-D8'],
  ['e308972796473778c46eed1e160fed983e785197', 'Outside D1-D8'],
  ['13d9d0e400340c72793b9e5e21d2919ab39f0630', 'D7'],
  ['eb8cc619dbe08e1b27282f2a082f923c7aa26698', 'Outside D1-D8'],
  ['3cd9bd41de35301c7ea5f6b2674aa0646657f2eb', 'Outside D1-D8'],
]);

const FIXED_CONTROL_RED = new Set(['f644be09bc0e49cb99199b7534b36e5fd2733917']);
const REVERSE_GREEN = new Set([
  '26f235ab0f4c3f7003228601931e509a29f9fea4',
  'bf53ee8ad45a3e0e17f41c93950e4d678fe304f4',
  'd52b82777311501f20a9cafc253825ed78bffc87',
]);

function csv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function patchMode(candidate, localPath, tip) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stratum-b-ledger-'));
  const clone = path.join(root, 'repo');
  try {
    execFileSync('git', ['clone', '--shared', '--no-checkout', localPath, clone], { stdio: 'ignore' });
    execFileSync('git', ['-C', clone, 'checkout', '--detach', tip], { stdio: 'ignore' });
    const patch = execFileSync('git', ['-C', clone, 'diff', '--binary', candidate.parentSha, candidate.fixSha, '--', ...candidate.eligibleFiles]);
    let result = spawnSync('git', ['-C', clone, 'apply', '--reverse', '--whitespace=nowarn', '-'], { input: patch });
    if (result.status === 0) return 'direct';
    result = spawnSync('git', ['-C', clone, 'apply', '--reverse', '--3way', '--whitespace=nowarn', '-'], { input: patch });
    return result.status === 0 ? 'three-way' : 'conflict';
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function disposition(candidate, mode) {
  if (B1.has(candidate.fixSha)) return ['B1', B1.get(candidate.fixSha)];
  if (B2.has(candidate.fixSha)) return ['B2', B2.get(candidate.fixSha)];
  if (mode === 'conflict') return ['excluded: patch conflict at frozen tip', ''];
  if (FIXED_CONTROL_RED.has(candidate.fixSha)) return ['excluded: fixed control red', ''];
  if (REVERSE_GREEN.has(candidate.fixSha)) return ['excluded: reverse stayed green', ''];
  return ['excluded: patch review found no causal defect for the named transition', ''];
}

const header = [
  'repository', 'fix_sha', 'parent_sha', 'pr', 'named_transitions', 'eligible_files',
  'content_id', 'reverse_patch_mode', 'disposition', 'd_class',
];
const rows = [];
const seenContent = new Map();

for (const [input, repositories] of SOURCES) {
  const extraction = JSON.parse(fs.readFileSync(input, 'utf8'));
  for (const candidate of extraction.candidates.filter((item) => !item.duplicateOf)) {
    const [localPath, tip] = repositories[candidate.repo];
    if (!localPath) continue;
    const duplicate = seenContent.get(candidate.contentId);
    if (duplicate) {
      rows.push([
        candidate.repo, candidate.fixSha, candidate.parentSha, candidate.pr ?? '',
        candidate.transitions.map((item) => `${item.name}:${item.failedConclusion}->${item.successConclusion}`).join('; '),
        candidate.eligibleFiles.join('; '), candidate.contentId, 'not-run',
        `excluded: content duplicate of ${duplicate}`, '',
      ]);
      continue;
    }
    seenContent.set(candidate.contentId, `${candidate.repo}@${candidate.fixSha}`);
    const mode = patchMode(candidate, localPath, tip);
    const [status, dClass] = disposition(candidate, mode);
    rows.push([
      candidate.repo, candidate.fixSha, candidate.parentSha, candidate.pr ?? '',
      candidate.transitions.map((item) => `${item.name}:${item.failedConclusion}->${item.successConclusion}`).join('; '),
      candidate.eligibleFiles.join('; '), candidate.contentId, mode, status, dClass,
    ]);
  }
}

rows.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
const output = [header, ...rows].map((row) => row.map(csv).join(',')).join('\n') + '\n';
const outputPath = process.argv[2] ?? 'docs/experiments/stratum-b-candidate-ledger-2026-08-01.csv';
fs.writeFileSync(outputPath, output, { mode: 0o644 });
console.log(JSON.stringify({ outputPath, rows: rows.length, contentUnique: seenContent.size }, null, 2));
