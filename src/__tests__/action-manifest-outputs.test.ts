import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

// The README documents BargLabs/cejel/action@v1 (action/action.yml); the Marketplace listing uses the
// root action.yml. Both run action/run.mjs, so both must declare every output it writes. Until
// goal_cejel_v17_unread_history_no_verdict_2026-11-02 item C, action/action.yml lacked `limited`,
// `limitation-count` and `limitations`, and the metadata validator compared only `rubric-pin`.

const ROOT_MANIFEST = fileURLToPath(new URL('../../action.yml', import.meta.url));
const NESTED_MANIFEST = fileURLToPath(new URL('../../action/action.yml', import.meta.url));
const HELPER_URL = pathToFileURL(fileURLToPath(new URL('../../scripts/action-manifest-outputs.mjs', import.meta.url))).href;
const VALIDATOR = fileURLToPath(new URL('../../scripts/validate-distribution-metadata.mjs', import.meta.url));

interface ManifestOutput {
  readonly description: string;
  readonly value: string;
}

function evaluate<T>(body: string, input: unknown): T {
  const evaluation = `
    import * as helper from ${JSON.stringify(HELPER_URL)};
    const input = JSON.parse(Buffer.from(process.env.CEJEL_HELPER_INPUT, 'base64').toString('utf8'));
    process.stdout.write(JSON.stringify(${body}));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
      encoding: 'utf8',
      env: { ...process.env, CEJEL_HELPER_INPUT: Buffer.from(JSON.stringify(input)).toString('base64') },
    }),
  ) as T;
}

const outputsOf = (manifest: string) =>
  evaluate<Record<string, ManifestOutput>>('helper.readActionManifestOutputs(input)', manifest);
const differences = (root: string, nested: string) =>
  evaluate<string[]>('helper.compareActionManifestOutputs(input.root, input.nested)', { root, nested });

/** The manifest with one output's block removed. */
function withoutOutput(manifest: string, name: string): string {
  const pattern = new RegExp(`\\n  ${name}:\\n(?:    .*\\n)+`);
  expect(manifest).toMatch(pattern);
  return manifest.replace(pattern, '\n');
}

const root = readFileSync(ROOT_MANIFEST, 'utf8');
const nested = readFileSync(NESTED_MANIFEST, 'utf8');

describe('both Action manifests declare the limitation outputs run.mjs writes', () => {
  it.each([
    ['root action.yml', root],
    ['action/action.yml (the README path)', nested],
  ])('%s declares limited, limitation-count and limitations', (_name, manifest) => {
    const outputs = outputsOf(manifest);
    expect(outputs.limited?.value).toBe('${{ steps.witan-run.outputs.limited }}');
    expect(outputs['limitation-count']?.value).toBe("${{ steps.witan-run.outputs['limitation-count'] }}");
    expect(outputs.limitations?.value).toBe('${{ steps.witan-run.outputs.limitations }}');
    expect(outputs.verdict?.description).toContain('Unrated: no git history');
  });

  it('the two manifests declare the same outputs, with the same descriptions and values', () => {
    expect(differences(root, nested)).toEqual([]);
    expect(outputsOf(root)).toEqual(outputsOf(nested));
  });

  it.each(['limited', 'limitation-count', 'limitations', 'verdict'])(
    'the comparison fails when %s is removed from either manifest',
    (name) => {
      expect(differences(withoutOutput(root, name), nested).join('\n')).toContain(name);
      expect(differences(root, withoutOutput(nested, name)).join('\n')).toContain(name);
    },
  );

  it('the comparison fails when an output description differs', () => {
    const changed = nested.replace(
      "description: 'Number of scan limitations that qualify the certificate, counting an Unrated verdict as one.'",
      "description: 'Something else.'",
    );
    expect(changed).not.toBe(nested);
    expect(differences(root, changed).join('\n')).toContain('limitation-count');
  });

  it('the distribution metadata validator runs the comparison and passes on this tree', () => {
    expect(readFileSync(VALIDATOR, 'utf8')).toContain('compareActionManifestOutputs(rootAction, nestedAction)');
    const result = spawnSync(process.execPath, [VALIDATOR], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
