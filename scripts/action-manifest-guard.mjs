// Checks for the two GitHub Action manifests (action.yml and action/action.yml), shared by
// scripts/validate-distribution-metadata.mjs and src/__tests__/action-manifest-guard.test.ts.
//
// The manifests run inside the CALLER's job. pnpm/action-setup there read the caller's
// package.json (so a caller pinning another pnpm failed, #685) and prepended its pnpm to the
// job-wide PATH (so the caller's later pnpm steps ran this action's version, #686). The steps that
// replaced it are pinned here, and so is everything else the runner reads below the free top of the
// file:
//
// - runs: must equal the canonical text below, byte for byte (CRLF aside), with no line skipped.
// - The inputs: and outputs: sections, from the inputs: line up to the runs: line, must match the
//   SHA-256 recorded in ACTION_INPUTS_OUTPUTS_SHA256 for that manifest. Input defaults and output
//   values change what run.mjs receives and what a caller sees (#689); a hash pins them, and also
//   their descriptions. After an intended edit, update the hash: the error message prints the
//   actual value.
// - Lines above inputs: (name, description, author, branding, comments) stay free to edit. They
//   cannot change anything pinned: a block scalar ends at a column-0 key, a plain scalar breaks
//   there, an unclosed quote or flow collection runs into the pinned text and fails to parse, and the
//   runner refuses duplicate top-level keys at load (case-insensitively).
//
// Why nothing weaker holds, from six review rounds of #687 and the review of #689:
// - substring checks per manifest passed with one step's isolation removed;
// - per-step script checks passed an added flow-style step, an if:-first step, a new input or a
//   literal feeding CEJEL_PNPM, and step env: blocks setting PATH, RUNNER_TEMP or npm config;
// - skipping "comment" lines let text that YAML reads as live through: text after a lone CR, NEL,
//   LS or PS (YamlDotNet 5.3.0 CharacterAnalyzer.IsBreak); a '#' line inside a run: | block, which
//   is script; and a line led by a character JavaScript's \s matches but YAML does not treat as
//   white space (IsWhite is space and tab only), such as U+00A0, which folds into the scalar;
// - a substring check on the rubric-pin default was defeated by a decoy holding the expected text
//   inside a block scalar or a multi-line quoted description.
// So nothing below inputs: is skipped, and every character in that white-space class is refused
// anywhere in the file, together with C0 control characters other than tab, LF and CR, DEL, a BOM
// and YAML document markers. C1 controls other than NEL are not refused: YamlDotNet reads them as
// plain content, and inside the pinned region the byte comparison and the hash catch them.

import { createHash } from 'node:crypto';

export const ACTION_FORMS = Object.freeze({
  root: Object.freeze({ directoryExpression: '"$GITHUB_ACTION_PATH"', runnerPath: 'action/run.mjs' }),
  nested: Object.freeze({
    directoryExpression: '"$(dirname "$GITHUB_ACTION_PATH")"',
    runnerPath: 'run.mjs',
  }),
});

// SHA-256 of each manifest's text from its inputs: line up to (not including) its runs: line, with
// CRLF read as LF. Recomputed by computeInputsOutputsSha256.
export const ACTION_INPUTS_OUTPUTS_SHA256 = Object.freeze({
  root: '8a681ad2af70bbe1da66504717fde1645d0e734067354699bc60a181cfe86a90',
  nested: '8a681ad2af70bbe1da66504717fde1645d0e734067354699bc60a181cfe86a90',
});

// package.json packageManager as the Action's read step requires it: an exact pnpm version and the
// hex sha512 of its registry tarball, corepack's form (#686 item 6). The validator reads it from here.
export const PNPM_PACKAGE_MANAGER_PIN = /^pnpm@(\d+\.\d+\.\d+)\+sha512\.([0-9a-f]{128})$/;

const YAML_INVISIBLE_CHARACTER =
  /\r(?!\n)|[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}\u{7F}\u{85}\u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}]/u;

function lf(manifest) {
  return manifest.replace(/\r\n/g, '\n');
}

export function refuseHiddenYamlStructure(manifestName, manifest) {
  const offending = YAML_INVISIBLE_CHARACTER.exec(manifest);
  if (offending) {
    const codePoint = offending[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    throw new Error(
      `${manifestName} contains U+${codePoint} at offset ${offending.index}: a YAML line break, white-space lookalike or control character that a text check and the runner's parser read differently.`,
    );
  }
  if (/^(?:---|\.\.\.)(?:[ \t]|$)/m.test(manifest)) {
    throw new Error(`${manifestName} contains a YAML document marker; the manifest must be one document.`);
  }
  // Textual and best effort: other spellings of a second key ("\x72uns", Runs, ? runs, a tag) pass
  // here, and the runner refuses them at load: TemplateReader as duplicate keys (compared
  // case-insensitively), YamlObjectReader for a !!str tag.
  for (const key of ['inputs', 'outputs', 'runs']) {
    const pattern = new RegExp(`^["']?${key}["']?[ \\t]*:`);
    const lines = lf(manifest)
      .split('\n')
      .filter((line) => pattern.test(line));
    if (lines.length !== 1 || lines[0] !== `${key}:`) {
      throw new Error(`${manifestName} must have exactly one top-level ${key}: key, written as "${key}:".`);
    }
  }
}

export function actionRunsSection(manifestName, manifest) {
  refuseHiddenYamlStructure(manifestName, manifest);
  const text = lf(manifest);
  const at = text.startsWith('runs:\n') ? 0 : text.indexOf('\nruns:\n') + 1;
  if (at <= 0 && !text.startsWith('runs:\n')) {
    throw new Error(`${manifestName} has no top-level runs: section.`);
  }
  return text.slice(at).replace(/\n+$/, '');
}

export function actionInputsOutputsSection(manifestName, manifest) {
  refuseHiddenYamlStructure(manifestName, manifest);
  const text = lf(manifest);
  const start = text.indexOf('\ninputs:\n');
  const end = text.indexOf('\nruns:\n');
  if (start < 0 || end < 0 || start > end) {
    throw new Error(`${manifestName} must have inputs: before runs:, each on its own line.`);
  }
  const section = text.slice(start + 1, end + 1);
  if (!section.includes('\noutputs:\n')) {
    throw new Error(`${manifestName} must have outputs: between inputs: and runs:.`);
  }
  return section;
}

export function computeInputsOutputsSha256(manifestName, manifest) {
  return createHash('sha256').update(actionInputsOutputsSection(manifestName, manifest), 'utf8').digest('hex');
}

function canonicalPnpmStep(stepName, directoryExpression, pnpmArguments) {
  return [
    `    - name: ${stepName}`,
    '      shell: bash',
    '      env:',
    '        CEJEL_PNPM: ${{ steps.cejel-pnpm.outputs.spec }}',
    '        CEJEL_PNPM_SHA512: ${{ steps.cejel-pnpm.outputs.sha512 }}',
    '      run: |',
    '        set -euo pipefail',
    `        cejel_dir=${directoryExpression}`,
    '        work="$(mktemp -d "$RUNNER_TEMP/cejel-pnpm.XXXXXX")"',
    '        cd "$work"',
    "        printf '{}\\n' > package.json",
    '        tarball="$(npm pack --ignore-scripts --silent "$CEJEL_PNPM")"',
    '        mv -- "$tarball" pnpm.tgz',
    `        sha512="$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' pnpm.tgz)"`,
    '        if [ "$sha512" != "$CEJEL_PNPM_SHA512" ]; then',
    `          echo "::error::$CEJEL_PNPM tarball ($tarball) has sha512 $sha512, not the $CEJEL_PNPM_SHA512 this action's package.json pins"`,
    '          exit 1',
    '        fi',
    '        npm install --prefix "$work" --no-save --no-package-lock --ignore-scripts --no-audit --no-fund ./pnpm.tgz',
    '        pnpm="$work/node_modules/.bin/pnpm"',
    '        ran="pnpm@$("$pnpm" --version)"',
    '        if [ "$ran" != "$CEJEL_PNPM" ]; then',
    `          echo "::error::expected $CEJEL_PNPM from this action's package.json, installed $ran"`,
    '          exit 1',
    '        fi',
    `        "$pnpm" --dir "$cejel_dir" ${pnpmArguments}`,
  ];
}

export function canonicalActionRuns(form) {
  const { directoryExpression, runnerPath } = ACTION_FORMS[form];
  return [
    'runs:',
    "  using: 'composite'",
    '  steps:',
    '    - name: Setup Node',
    '      uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6',
    '      with:',
    "        node-version: '22'",
    '        package-manager-cache: false',
    '',
    '    - name: Read the pnpm version and sha512 this action pins',
    '      id: cejel-pnpm',
    '      shell: bash',
    '      run: |',
    '        set -euo pipefail',
    `        cejel_dir=${directoryExpression}`,
    `        pin="$(node -e '`,
    '          const pm = require(process.argv[1]).packageManager ?? "";',
    '          const match = /^(pnpm@\\d+\\.\\d+\\.\\d+)\\+sha512\\.([0-9a-f]{128})$/.exec(pm);',
    '          if (!match) {',
    '            console.error("package.json packageManager must pin pnpm to an exact version and its tarball sha512, as pnpm@X.Y.Z+sha512.<hex>; got: " + pm);',
    '            process.exit(1);',
    '          }',
    '          process.stdout.write("spec=" + match[1] + "\\nsha512=" + match[2]);',
    `        ' "$cejel_dir/package.json")"`,
    '        echo "$pin" >> "$GITHUB_OUTPUT"',
    '',
    ...canonicalPnpmStep('Install dependencies', directoryExpression, 'install --frozen-lockfile'),
    '',
    ...canonicalPnpmStep('Build the Cejel CLI', directoryExpression, 'run build'),
    '',
    '    - name: Run Cejel (offline scoring — no network calls, no signup)',
    '      id: witan-run',
    '      shell: bash',
    `      run: node "$GITHUB_ACTION_PATH/${runnerPath}"`,
    '      env:',
    '        WITAN_REPO_PATH: ${{ inputs.repo-path }}',
    '        WITAN_MIN_SCORE: ${{ inputs.min-score }}',
    '        WITAN_EXPORT_DIR: ${{ inputs.out-dir }}',
    '        WITAN_RUBRIC_PIN: ${{ inputs.rubric-pin }}',
  ].join('\n');
}

// Throws on the first problem. Returns nothing on success.
export function checkActionManifest(manifestName, manifest, form) {
  if (!Object.hasOwn(ACTION_FORMS, form)) throw new Error(`unknown Action form: ${form}`);
  const code = actionRunsSection(manifestName, manifest);
  if (/^\s*(?:-\s*)?uses:\s*["']?pnpm\/action-setup@/m.test(code)) {
    throw new Error(
      `${manifestName} uses pnpm/action-setup, which changes the calling job's PATH; install pnpm with npm install --prefix instead.`,
    );
  }
  if (code.includes('github.action_path')) {
    throw new Error(
      `${manifestName} interpolates github.action_path; read $GITHUB_ACTION_PATH in the shell step instead.`,
    );
  }
  if (/GITHUB_PATH|GITHUB_ENV/.test(code)) {
    throw new Error(`${manifestName} writes to the calling job's PATH or environment.`);
  }
  if (/\bnpm exec\b|\bnpx\b/.test(code)) {
    throw new Error(
      `${manifestName} runs npm exec or npx, which puts every parent directory's node_modules/.bin ahead of PATH.`,
    );
  }
  const expected = canonicalActionRuns(form);
  if (code !== expected) {
    const actualLines = code.split('\n');
    const expectedLines = expected.split('\n');
    const first = expectedLines.findIndex((line, index) => line !== actualLines[index]);
    const at = first < 0 ? expectedLines.length : first;
    throw new Error(
      `${manifestName} runs: section differs from the canonical scoped-pnpm Action at line ${at + 1} of the section; update the Action and scripts/action-manifest-guard.mjs together.\n--- expected\n${expectedLines[at] ?? '(end)'}\n--- actual\n${actualLines[at] ?? '(end)'}`,
    );
  }
  const actualSha = computeInputsOutputsSha256(manifestName, manifest);
  if (actualSha !== ACTION_INPUTS_OUTPUTS_SHA256[form]) {
    throw new Error(
      `${manifestName} inputs:/outputs: sections do not match the pinned SHA-256 (expected ${ACTION_INPUTS_OUTPUTS_SHA256[form]}, actual ${actualSha}). If the change is intended, update ACTION_INPUTS_OUTPUTS_SHA256.${form} in scripts/action-manifest-guard.mjs in the same change.`,
    );
  }
}
