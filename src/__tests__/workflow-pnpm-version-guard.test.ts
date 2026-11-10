import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// #686 item 5: a version: on pnpm/action-setup in a workflow must be refused in every spelling these
// workflows could use, not only block style after the uses: line.

interface Guard {
  pnpmActionSetupVersionPins(workflow: string): ReadonlyArray<{ line: number; version: string }>;
  requirePnpmVersionDerived(workflowName: string, workflow: string, expectedVersion: string): void;
}

const GUARD_URL = pathToFileURL(fileURLToPath(new URL('../../scripts/workflow-pnpm-version-guard.mjs', import.meta.url))).href;
const WORKFLOWS_DIR = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));
const SETUP = 'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271';

function job(steps: string): string {
  return `name: fixture\non: push\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;
}

const SET: ReadonlyArray<readonly [string, string, string]> = [
  ['block style after uses:', `      - uses: ${SETUP}\n        with:\n          version: 9.0.0\n`, '9.0.0'],
  ['block style, quoted', `      - uses: ${SETUP} # v6\n        with:\n          version: '10.0.0'\n`, '10.0.0'],
  ['flow-style with:', `      - uses: ${SETUP}\n        with: { version: 9.0.0 }\n`, '9.0.0'],
  ['flow-style with: among other inputs', `      - uses: ${SETUP}\n        with: { run_install: false, version: "10" }\n`, '10'],
  ['a whole step in flow style', `      - { uses: ${SETUP}, with: { version: 9.0.0 } }\n`, '9.0.0'],
  ['with: before uses:', `      - with:\n          version: 10.0.0\n        uses: ${SETUP}\n`, '10.0.0'],
  ['name: first, then with:, then uses:', `      - name: pnpm\n        with:\n          version: 10.0.0\n        uses: ${SETUP}\n`, '10.0.0'],
  ['a quoted version key', `      - uses: ${SETUP}\n        with:\n          "version": 10.0.0\n`, '10.0.0'],
  ['a quoted uses value', `      - uses: "${SETUP}"\n        with:\n          version: 10.0.0\n`, '10.0.0'],
  ['CRLF line endings', `      - uses: ${SETUP}\r\n        with:\r\n          version: 10.0.0\r\n`, '10.0.0'],
];

const NOT_SET: ReadonlyArray<readonly [string, string]> = [
  ['no with:', `      - uses: ${SETUP}\n`],
  ['other inputs only', `      - uses: ${SETUP}\n        with:\n          run_install: false\n`],
  [
    'a version: in the next step',
    `      - uses: ${SETUP}\n      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\n        with:\n          version: 22\n`,
  ],
  ['node-version on setup-node', `      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\n        with:\n          node-version: 22\n      - uses: ${SETUP}\n`],
  ['a version: only in a comment', `      - uses: ${SETUP}\n        # with:\n        #   version: 9.0.0\n`],
];

describe('workflow-pnpm-version-guard', () => {
  let guard: Guard;
  beforeAll(async () => {
    guard = (await import(GUARD_URL)) as Guard;
  });

  for (const [label, steps, version] of SET) {
    it(`refuses a version set ${label}`, () => {
      const workflow = job(steps);
      expect(guard.pnpmActionSetupVersionPins(workflow).map((pin) => pin.version)).toEqual([version]);
      expect(() => guard.requirePnpmVersionDerived('fixture.yml', workflow, '9.0.0')).toThrow(
        version === '9.0.0' ? /hardcodes pnpm\/action-setup version 9\.0\.0/ : /disagrees with package\.json packageManager/,
      );
    });
  }

  for (const [label, steps] of NOT_SET) {
    it(`accepts ${label}`, () => {
      const workflow = job(steps);
      expect(guard.pnpmActionSetupVersionPins(workflow)).toEqual([]);
      expect(() => guard.requirePnpmVersionDerived('fixture.yml', workflow, '9.0.0')).not.toThrow();
    });
  }

  it("names the version's line", () => {
    const workflow = job(`      - uses: ${SETUP}\n        with: { version: 10.0.0 }\n`);
    expect(guard.pnpmActionSetupVersionPins(workflow)).toEqual([{ line: 10, version: '10.0.0' }]);
  });

  it("reads this repository's workflows, which all use pnpm/action-setup and set no version", () => {
    const files = readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith('.yml'));
    const withSetup = files.filter((name) => readFileSync(`${WORKFLOWS_DIR}${name}`, 'utf8').includes('pnpm/action-setup@'));
    expect(withSetup.length).toBeGreaterThan(0);
    for (const name of withSetup) {
      expect(guard.pnpmActionSetupVersionPins(readFileSync(`${WORKFLOWS_DIR}${name}`, 'utf8'))).toEqual([]);
    }
  });
});
