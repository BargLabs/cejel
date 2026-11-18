#!/usr/bin/env node
// The workflow-lint gate's own guard (.github/workflows/workflow-lint.yml runs it with --ci, after its
// node test and as the step directly before zizmor). zizmor lints cejel's workflows and Action
// definitions on every pull request. This script keeps that a gate and keeps every exception
// visible. It reads files, and with --ci asks the local git for the checkout's state; it needs no
// network. It fails when:
//
// - .github/zizmor-requirements.txt is not exactly one zizmor==<version> requirement carrying exactly
//   one sha256 hash, so pip's require-hashes mode installs only the wheel that was reviewed;
// - the workflow has no pull_request trigger, has a paths: or paths-ignore: filter, carries
//   continue-on-error, swallows an exit status (|| true, || :, || exit 0, set +e), names zizmor's
//   exit-code flag or a severity or confidence filter, does not run exactly one zizmor command with
//   --offline, or does anything that would drop a workflow or Action definition out of the lint:
//   gives zizmor any input other than the repository root (.), runs it without --collect=all (its
//   default collection honours .gitignore) or with another --collect, sets a working-directory,
//   changes directory, or checks out other than once with only persist-credentials set (path:,
//   sparse-checkout, ref: and repository: are refused); installs zizmor other than hash-checked
//   from the requirements file; or runs zizmor before this script's node test;
// - the workflow lets anything between the checkout and zizmor change what zizmor reads: this
//   script must run as `node scripts/check-workflow-lint-gate.mjs --ci` in the step directly before
//   zizmor's, zizmor's step must run its command alone, and the workflow may not carry if:, shell:,
//   a uses: other than actions/checkout and actions/setup-node, a PATH key, or GITHUB_ENV,
//   GITHUB_PATH or GITHUB_SHA;
// - with --ci: HEAD is not the commit the run is for ($GITHUB_SHA), or the working tree differs from
//   it in any way, tracked, untracked or ignored. So no earlier step deleted, emptied, edited or
//   added a file zizmor would read;
// - any ignore has no reason. An inline ignore is a YAML comment that begins with the marker
//   `zizmor: ignore[<one rule>]` and carries at least three words after the bracket. zizmor does not
//   read a marker that is appended to another comment, so that is refused too. A configuration
//   ignore in .github/zizmor.yml is one `- <file>:<line>` entry per line with a comment of at least
//   three words. A whole-file entry, a disabled rule, a rule configuration and a flow-style list
//   are refused, and an entry must name a file zizmor lints and a line inside it.
//
// The number of ignores is pinned in scripts/check-workflow-lint-gate.node-test.mjs, so adding one
// changes a test that a reviewer reads.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIREMENTS_PATH = '.github/zizmor-requirements.txt';
export const WORKFLOW_PATH = '.github/workflows/workflow-lint.yml';
export const CONFIG_PATH = '.github/zizmor.yml';
export const GATE_TEST_PATH = 'scripts/check-workflow-lint-gate.node-test.mjs';

const splitLines = (text) => text.split(/\r?\n/);

/** A reason is at least three words once leading punctuation is dropped. */
export function hasReason(text) {
  const words = text
    .replace(/^[\s:;,.\-–—]+/, '')
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word));
  return words.length >= 3;
}

// --- the pin -------------------------------------------------------------------------------------

export function checkRequirements(text) {
  const problems = [];
  const requirements = splitLines(text)
    .map((line) => line.replace(/(^|\s)#.*$/, '').trim())
    .filter(Boolean);
  if (requirements.length !== 1) {
    problems.push(`${REQUIREMENTS_PATH}: must hold exactly one requirement; it holds ${requirements.length}`);
  }
  for (const requirement of requirements) {
    if (!/^zizmor==\d+(?:\.\d+)*(?:\s|$)/.test(requirement)) {
      problems.push(`${REQUIREMENTS_PATH}: the requirement must be zizmor==<version>: ${requirement}`);
    }
    const hashes = requirement.match(/--hash[=\s]+\S+/g) ?? [];
    const sha256 = hashes.filter((hash) => /^--hash[=\s]+sha256:[0-9a-f]{64}$/.test(hash));
    if (hashes.length !== 1 || sha256.length !== 1) {
      problems.push(
        `${REQUIREMENTS_PATH}: the requirement must carry exactly one sha256 hash (--hash=sha256:<64 hex>): ${requirement}`,
      );
    }
  }
  return problems;
}

// --- the workflow --------------------------------------------------------------------------------

/** The workflow's lines with YAML comments removed, so a comment cannot satisfy or trip a check. */
function codeLines(text) {
  return splitLines(text).map((line) => (/^\s*#/.test(line) ? '' : line.replace(/(^|\s)#.*$/, '')));
}

function triggerNames(lines) {
  const at = lines.findIndex((line) => /^(?:on|"on"|'on')\s*:/.test(line));
  if (at === -1) return [];
  const inline = lines[at].replace(/^[^:]*:/, '').trim();
  if (inline) {
    return inline
      .replace(/^[[{]|[\]}]$/g, '')
      .split(',')
      .map((part) => part.trim().replace(/\s*:.*$/, '').replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const names = [];
  let indent = null;
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const lineIndent = line.search(/\S/);
    if (lineIndent === 0) break;
    if (indent === null) indent = lineIndent;
    if (lineIndent !== indent) continue;
    const match = /^\s*["']?([\w-]+)["']?\s*:/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

/** Shell commands with backslash continuations joined, each tagged with its first line's index. */
function commands(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = i;
    let command = lines[i];
    while (/\\\s*$/.test(command) && i + 1 < lines.length) {
      i += 1;
      command = `${command.replace(/\\\s*$/, ' ')}${lines[i].trim()}`;
    }
    out.push({ index: start, command });
  }
  return out;
}

const ZIZMOR_COMMAND = /(?:^|[\s/"'])zizmor["']?(?=\s|$)/;
const STEP_NAME = /^\s*-?\s*name\s*:/;
const PIP_INSTALL = /\bpip3?["']?\s+install\b/;

// zizmor 1.32.0's flags that take their value as the next word. Every other flag is read as standing
// alone, so the value of a flag missing from this list shows up as a second input and is refused.
const ZIZMOR_VALUE_FLAGS = new Set([
  '-c',
  '--config',
  '--persona',
  '--min-severity',
  '--min-confidence',
  '--format',
  '--color',
  '--render-links',
  '--show-audit-urls',
  '--gh-token',
  '--gh-hostname',
  '--cache-dir',
  '--completions',
]);

/**
 * The inputs (positional arguments) of one zizmor command: the words after the zizmor executable
 * that are neither flags nor flag values, up to the end of that shell command.
 */
export function zizmorInputs(command) {
  const match = ZIZMOR_COMMAND.exec(command);
  if (!match) return [];
  const words = command.slice(match.index + match[0].length).trim().split(/\s+/).filter(Boolean);
  const inputs = [];
  for (let i = 0; i < words.length; i += 1) {
    if (/^(?:[;&|<>]|[0-9]?>)/.test(words[i])) break;
    const word = words[i].replace(/^["']+|["';]+$/g, '');
    if (word.startsWith('-')) {
      if (ZIZMOR_VALUE_FLAGS.has(word)) i += 1;
    } else if (word) {
      inputs.push(word);
    }
    if (/;["']*$/.test(words[i] ?? '')) break;
  }
  return inputs;
}

const GUARD_COMMAND = /\bnode\s+(?:\.\/)?scripts\/check-workflow-lint-gate\.mjs\b/;
const ALLOWED_USES = /^(?:actions\/checkout|actions\/setup-node)@[0-9a-f]{40}$/;

/**
 * Nothing may change what zizmor reads between the checkout and zizmor's step. This script runs with
 * --ci in the step directly before zizmor's and checks the tree against $GITHUB_SHA; zizmor's step
 * runs its command alone; and the workflow carries nothing that skips a step (if:), reinterprets a
 * run (shell:), runs code that this check cannot read (a uses: beyond checkout and setup-node), or
 * redirects a tool or the commit (a PATH key, GITHUB_ENV, GITHUB_PATH, GITHUB_SHA).
 */
export function sequenceProblems(lines, runs) {
  const problems = [];
  const code = lines.join('\n');
  if (/^\s*(?:-\s+)?if\s*:/m.test(code)) problems.push('carries an if:, which can skip the guard or zizmor');
  if (/^\s*(?:-\s+)?shell\s*:/m.test(code)) problems.push('sets a shell:, which changes how a run step is executed');
  if (/^\s*PATH\s*:/m.test(code)) problems.push('sets PATH, which can swap the git, node or zizmor this gate runs');
  for (const name of ['GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_SHA']) {
    if (code.includes(name)) problems.push(`names ${name}, which can redirect a later step or the commit the guard checks`);
  }
  for (const line of lines) {
    const uses = /^\s*(?:-\s+)?uses\s*:\s*["']?([^\s"']+)/.exec(line);
    if (uses && !ALLOWED_USES.test(uses[1])) {
      problems.push(`uses ${uses[1]}; only actions/checkout and actions/setup-node pinned to a commit may run here`);
    }
  }

  const guards = lines.map((line, index) => (GUARD_COMMAND.test(line) ? index : -1)).filter((index) => index !== -1);
  if (guards.length !== 1 || !/^\s*(?:-\s+)?run\s*:\s*node\s+scripts\/check-workflow-lint-gate\.mjs\s+--ci\s*$/.test(lines[guards[0]])) {
    problems.push('must run the guard exactly once, as `run: node scripts/check-workflow-lint-gate.mjs --ci`');
    return problems;
  }
  if (runs.length !== 1) return problems;
  const zizmorLine = lines[runs[0].index];
  const alone = /^\s*(?:-\s+)?run\s*:\s*'?"?[^\s'"]*zizmor["']?\s(.*)$/.exec(zizmorLine);
  if (!alone || /[;&|<>`]|\$\(/.test(alone[1]) || /\\\s*$/.test(zizmorLine)) {
    problems.push(`zizmor's step must run the zizmor command alone, on its run: line: ${zizmorLine.trim()}`);
  }
  const at = lines.findIndex((line) => /^\s*steps\s*:\s*$/.test(line));
  const first = lines.findIndex((line, index) => index > at && line.trim());
  const dashIndent = first === -1 ? -1 : lines[first].search(/\S/);
  const starts = lines
    .map((line, index) => (index > at && line.search(/\S/) === dashIndent && /^\s*-\s/.test(line) ? index : -1))
    .filter((index) => index !== -1);
  const stepOf = (index) => starts.filter((start) => start <= index).length - 1;
  if (at === -1 || stepOf(runs[0].index) !== stepOf(guards[0]) + 1) {
    problems.push("must run the guard in the step directly before zizmor's, so no step between them can change the tree");
  }
  return problems;
}

const CHECKOUT_USES = /^(\s*)(-\s+)?uses\s*:\s*["']?actions\/checkout@/;

/**
 * The checkout must put the whole pull-request tree at the workspace root, where zizmor lints `.`:
 * exactly one actions/checkout step, whose with: block sets persist-credentials and nothing else.
 * path: moves the tree out of the root, sparse-checkout leaves files out, and ref: or repository:
 * lints a different tree.
 */
export function checkoutProblems(lines) {
  const problems = [];
  const at = lines.map((line, index) => (CHECKOUT_USES.test(line) ? index : -1)).filter((index) => index !== -1);
  if (at.length !== 1) {
    problems.push(`must check out the repository with exactly one actions/checkout step; found ${at.length}`);
    return problems;
  }
  const [, lead, dash] = CHECKOUT_USES.exec(lines[at[0]]);
  const keyIndent = lead.length + (dash ? dash.length : 0);
  const dashIndent = keyIndent - 2;
  let start = at[0];
  if (!dash) {
    while (start > 0 && !(lines[start].search(/\S/) === dashIndent && /^\s*-\s/.test(lines[start]))) start -= 1;
  }
  let end = at[0] + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].search(/\S/) > dashIndent)) end += 1;

  const keys = [];
  for (let i = start; i < end; i += 1) {
    const key = /^\s*(?:-\s+)?([\w-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!key) continue;
    const indent = i === start ? keyIndent : lines[i].search(/\S/);
    if (indent !== keyIndent || key[1] !== 'with') continue;
    if (key[2].trim()) problems.push(`the checkout's with: must be a block, one input per line; found ${key[2].trim()}`);
    let inputIndent = -1;
    for (let j = i + 1; j < end && (!lines[j].trim() || lines[j].search(/\S/) > keyIndent); j += 1) {
      if (!lines[j].trim()) continue;
      if (inputIndent === -1) inputIndent = lines[j].search(/\S/);
      if (lines[j].search(/\S/) !== inputIndent) continue;
      const input = /^\s*([\w-]+)\s*:/.exec(lines[j]);
      keys.push(input ? input[1] : lines[j].trim());
    }
  }
  for (const key of keys) {
    if (key !== 'persist-credentials') {
      problems.push(`the checkout sets ${key}:, which can change or narrow the tree zizmor lints; only persist-credentials is allowed`);
    }
  }
  return problems;
}

export function checkWorkflow(text) {
  const problems = [];
  const refuse = (message) => problems.push(`${WORKFLOW_PATH}: ${message}`);
  const lines = codeLines(text);
  const code = lines.join('\n');

  if (!triggerNames(lines).includes('pull_request')) refuse('lacks the pull_request trigger');
  if (/\bpaths(?:-ignore)?\s*:/.test(code)) refuse('has a paths: or paths-ignore: filter; it must run on every pull request');
  if (/\bcontinue-on-error\s*:/.test(code)) refuse('carries continue-on-error; a finding must fail the job');
  if (/\|\|\s*(?:true\b|:(?=\s|$|["'])|exit\s+0\b)/.test(code)) refuse("swallows zizmor's exit status (|| true, || : or || exit 0)");
  if (/\bset\s+(?:\+e\b|\+o\s+errexit\b)/.test(code)) refuse('turns off errexit with set +e');
  if (/no[-_]exit[-_]codes/i.test(code)) refuse("names zizmor's exit-code flag (--no-exit-codes)");
  if (/min[-_]severity/i.test(code)) refuse('names a severity filter (--min-severity)');
  if (/min[-_]confidence/i.test(code)) refuse('names a confidence filter (--min-confidence)');

  const runs = commands(lines).filter(({ command }) => !STEP_NAME.test(command) && ZIZMOR_COMMAND.test(command));
  if (runs.length !== 1) {
    refuse(`must run exactly one zizmor command; found ${runs.length}`);
  }
  for (const { command } of runs) {
    if (!/(?:^|\s)--offline(?=\s|$|["'])/.test(command)) refuse(`the zizmor command lacks --offline: ${command.trim()}`);
    const inputs = zizmorInputs(command);
    if (inputs.length !== 1 || inputs[0] !== '.') {
      refuse(
        `the zizmor command must lint the repository root (.) and nothing else, or a workflow or Action definition drops out; its inputs are [${inputs.join(', ')}]: ${command.trim()}`,
      );
    }
  }
  // zizmor's default collection honours .gitignore, so one ignore line would drop a workflow or an
  // Action definition from the lint; --collect=all ignores .gitignore. Any other kind narrows it.
  const collects = code.match(/--collect\b\S*/g) ?? [];
  if (collects.length !== 1 || !runs.some(({ command }) => /(?:^|\s)--collect=all(?=\s|$|["'])/.test(command))) {
    refuse(
      `the zizmor command must carry --collect=all, once, so .gitignore cannot drop a file from the lint; found [${collects.join(', ')}]`,
    );
  }
  problems.push(...checkoutProblems(lines).map((problem) => `${WORKFLOW_PATH}: ${problem}`));
  if (/\bworking-directory\s*:/.test(code)) refuse('sets a working-directory, which moves the root zizmor lints');
  if (/(?:^|[\s;&|("'])(?:cd|pushd)\s/.test(code)) refuse('changes directory in a run step, which can move the root zizmor lints');

  problems.push(...sequenceProblems(lines, runs).map((problem) => `${WORKFLOW_PATH}: ${problem}`));

  const installs = lines.filter((line) => PIP_INSTALL.test(line));
  if (installs.length === 0) refuse('installs no zizmor with pip --require-hashes from the requirements file');
  for (const install of installs) {
    const hashChecked =
      /(?:^|\s)--require-hashes(?=\s|$)/.test(install) &&
      /(?:^|\s)--only-binary[=\s]+:all:(?=\s|$)/.test(install) &&
      /(?:^|\s)(?:-r|--requirement)[=\s]+\.github\/zizmor-requirements\.txt(?=\s|$|["'])/.test(install);
    if (!hashChecked) {
      refuse(`must install with pip --require-hashes --only-binary :all: -r ${REQUIREMENTS_PATH}: ${install.trim()}`);
    }
  }

  const testAt = lines.findIndex((line) => /\bnode\s+--test\s+scripts\/check-workflow-lint-gate\.node-test\.mjs\b/.test(line));
  const firstRun = runs.length ? runs[0].index : -1;
  if (testAt === -1 || (firstRun !== -1 && testAt > firstRun)) {
    refuse(`must run the gate's own node test (${GATE_TEST_PATH}) before zizmor`);
  }
  return problems;
}

// --- the ignores ---------------------------------------------------------------------------------

/** Inline ignores in one linted file: YAML comments that begin with the zizmor marker. */
export function inlineIgnores(path, text) {
  const problems = [];
  const ignores = [];
  splitLines(text).forEach((line, index) => {
    const at = line.search(/zizmor\s*:\s*ignore/);
    if (at === -1) return;
    const where = `${path}:${index + 1}`;
    // The line's comment starts at its first `#` that follows whitespace or begins the line; zizmor
    // reads the marker only when it begins that comment.
    const commentFrom = line.search(/(?:^|\s)#/);
    const commentStart = commentFrom === -1 ? -1 : line.indexOf('#', commentFrom);
    if (commentStart === -1 || commentStart > at || !/^#\s*$/.test(line.slice(commentStart, at))) {
      problems.push(`${where}: the ignore marker is not at the start of its comment, so zizmor does not read it`);
      return;
    }
    const match = /^zizmor\s*:\s*ignore\[([^\]]*)\](.*)$/.exec(line.slice(at));
    if (!match) {
      problems.push(`${where}: malformed ignore marker; write zizmor: ignore[<rule>] <reason>`);
      return;
    }
    const rules = match[1].split(',').map((rule) => rule.trim()).filter(Boolean);
    if (rules.length !== 1) {
      problems.push(`${where}: an ignore names exactly one rule; this one names [${match[1]}]`);
      return;
    }
    const reason = match[2].trim();
    if (!hasReason(reason)) {
      problems.push(`${where}: ignore[${rules[0]}] has no reason (at least three words after the bracket)`);
      return;
    }
    ignores.push({ kind: 'inline', where, rule: rules[0], reason });
  });
  return { problems, ignores };
}

/**
 * Ignores in .github/zizmor.yml. `files` maps a linted file's base name to its longest line count;
 * when given, every entry must name such a file and a line inside it.
 */
export function configIgnores(text, files = null) {
  const problems = [];
  const ignores = [];
  let inRules = false;
  let rule = null;
  let ruleIndent = -1;
  let ignoreIndent = -1;
  let skipDeeperThan = null;

  splitLines(text).forEach((raw, index) => {
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const where = `${CONFIG_PATH}:${index + 1}`;
    const indent = raw.search(/\S/);
    if (skipDeeperThan !== null) {
      if (indent > skipDeeperThan) return;
      skipDeeperThan = null;
    }
    const commentAt = raw.search(/\s#/);
    const code = (commentAt === -1 ? raw : raw.slice(0, commentAt)).trimEnd();
    const comment = commentAt === -1 ? '' : raw.slice(commentAt).replace(/^\s*#/, '').trim();

    if (indent === 0) {
      inRules = /^rules\s*:$/.test(code);
      rule = null;
      ignoreIndent = -1;
      if (!inRules) {
        problems.push(`${where}: only rules: is allowed at the top level; found ${code}`);
        skipDeeperThan = 0;
      }
      return;
    }
    if (!inRules) return;

    if (rule === null || indent <= ruleIndent) {
      const match = /^\s*([a-z0-9-]+)\s*:$/.exec(code);
      if (!match) {
        problems.push(`${where}: expected a rule name under rules:; found ${code.trim()}`);
        skipDeeperThan = indent;
        rule = null;
        return;
      }
      rule = match[1];
      ruleIndent = indent;
      ignoreIndent = -1;
      return;
    }

    if (ignoreIndent === -1 || indent <= ignoreIndent) {
      const match = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(code);
      const key = match ? match[1] : code.trim();
      if (match && key === 'ignore' && match[2] === '') {
        ignoreIndent = indent;
        return;
      }
      ignoreIndent = -1;
      if (key === 'ignore') {
        problems.push(`${where}: rules.${rule}.ignore is a flow-style list; write one entry per line, each with its reason`);
      } else {
        problems.push(`${where}: rules.${rule}.${key} is refused; only ignore: entries are allowed (no disable, no config)`);
      }
      skipDeeperThan = indent;
      return;
    }

    const entry = /^\s*-\s*(["']?)([^"'\s]+)\1$/.exec(code);
    if (!entry) {
      problems.push(`${where}: expected one "- <file>:<line>" entry; found ${code.trim()}`);
      return;
    }
    const target = /^(.+?\.ya?ml)(?::(\d+))?(?::(\d+))?$/.exec(entry[2]);
    if (!target) {
      problems.push(`${where}: ${entry[2]} is not <file>.yml:<line>`);
      return;
    }
    const [, file, line] = target;
    if (line === undefined) {
      problems.push(`${where}: ${file} ignores ${rule} in the whole file; name the line`);
      return;
    }
    if (!hasReason(comment)) {
      problems.push(`${where}: ${entry[2]} has no reason (a comment of at least three words after the entry)`);
      return;
    }
    if (files) {
      if (!files.has(file)) {
        problems.push(`${where}: ${file} names no file zizmor lints`);
        return;
      }
      if (Number(line) < 1 || Number(line) > files.get(file)) {
        problems.push(`${where}: ${entry[2]} points past the end of ${file}`);
        return;
      }
    }
    ignores.push({ kind: 'config', where, rule, entry: entry[2], reason: comment });
  });
  return { problems, ignores };
}

// --- the repository ------------------------------------------------------------------------------

/**
 * What zizmor 1.32.0 lints with --collect=all given the repository root: the workflows directly in
 * .github/workflows, .github/dependabot.yml, the root pre-commit files, and every action.yml or
 * action.yaml, hidden directories included. It skips .git, node_modules and nested repositories
 * (a directory holding its own .git, such as a local worktree). zizmor lints those too when they
 * are present, but in CI they are not: --ci refuses any file the checkout did not put there.
 */
export function lintTargets(root) {
  const targets = [];
  const workflows = join(root, '.github', 'workflows');
  if (existsSync(workflows)) {
    for (const entry of readdirSync(workflows, { withFileTypes: true })) {
      if (entry.isFile() && /\.ya?ml$/.test(entry.name)) targets.push(join(workflows, entry.name));
    }
  }
  for (const path of [
    join('.github', 'dependabot.yml'),
    join('.github', 'dependabot.yaml'),
    '.pre-commit-config.yaml',
    '.pre-commit-hooks.yaml',
  ]) {
    if (existsSync(join(root, path))) targets.push(join(root, path));
  }
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || existsSync(join(path, '.git'))) continue;
        walk(path);
      } else if (entry.isFile() && /^action\.ya?ml$/.test(entry.name)) {
        targets.push(path);
      }
    }
  };
  walk(root);
  return [...new Set(targets)].map((path) => relative(root, path).split(sep).join('/')).sort();
}

export function checkRepository(root) {
  const problems = [];
  const ignores = [];
  const read = (path) => {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  };

  const requirements = read(REQUIREMENTS_PATH);
  if (requirements === null) problems.push(`${REQUIREMENTS_PATH} is missing`);
  else problems.push(...checkRequirements(requirements));

  const workflow = read(WORKFLOW_PATH);
  if (workflow === null) problems.push(`${WORKFLOW_PATH} is missing`);
  else problems.push(...checkWorkflow(workflow));

  const targets = lintTargets(root);
  const files = new Map();
  for (const target of targets) {
    const text = read(target);
    const lineCount = splitLines(text.replace(/\r?\n$/, '')).length;
    files.set(basename(target), Math.max(files.get(basename(target)) ?? 0, lineCount));
    const inline = inlineIgnores(target, text);
    problems.push(...inline.problems);
    ignores.push(...inline.ignores);
  }

  const config = read(CONFIG_PATH);
  if (config !== null) {
    const configured = configIgnores(config, files);
    problems.push(...configured.problems);
    ignores.push(...configured.ignores);
  }
  return { problems, ignores, targets };
}

/**
 * --ci: the tree zizmor will read is exactly the commit the run is for. HEAD must be `sha`
 * ($GITHUB_SHA) and `git status` must report nothing, ignored files included, so no earlier step
 * deleted, emptied, edited or added a file. `git` runs a git command in `root` and returns stdout.
 */
export function checkoutStateProblems(root, sha, git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) return ['--ci needs GITHUB_SHA, the 40-hex commit this run is for'];
  let head;
  let status;
  try {
    head = git(['rev-parse', 'HEAD']).trim();
    status = git(['status', '--porcelain=v1', '--ignored', '--untracked-files=all']);
  } catch (error) {
    return [`--ci could not read the checkout with git: ${String(error.message).split('\n')[0]}`];
  }
  const problems = [];
  if (head !== sha) problems.push(`HEAD is ${head}, not ${sha}, the commit this run is for`);
  const changed = status.split('\n').filter(Boolean);
  if (changed.length > 0) {
    problems.push(
      `the working tree differs from the checked-out commit, so zizmor would not read what was committed:\n  ${changed.slice(0, 20).join('\n  ')}`,
    );
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootAt = process.argv.indexOf('--root');
  const root = rootAt === -1 ? join(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootAt + 1]);
  const { problems, ignores, targets } = checkRepository(root);
  if (process.argv.includes('--ci')) problems.push(...checkoutStateProblems(root, process.env.GITHUB_SHA));
  if (problems.length > 0) {
    console.error(`workflow-lint gate: ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(
    `workflow-lint gate: ok. zizmor lints ${targets.length} files; ${ignores.length} ignores, each naming one rule and a reason.`,
  );
}
