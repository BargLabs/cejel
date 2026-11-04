// The outputs a composite Action manifest declares, and the differences between two manifests'
// outputs. The root action.yml (the Marketplace listing) and action/action.yml (the README's
// BargLabs/cejel/action@v1 path) run the same action/run.mjs, so both must declare every output it
// writes, with the same description and value (goal_cejel_v17_unread_history_no_verdict_2026-11-02,
// item C). Used by validate-distribution-metadata.mjs; tested in
// src/__tests__/action-manifest-outputs.test.ts.
//
// A reader for this repository's two manifests, not a YAML parser: it reads the top-level
// `outputs:` block, each output as a two-space-indented key, and its `description:` and `value:`
// as four-space-indented keys, a description either one quoted line or a `>-` folded block. Any
// other shape in the block fails loudly rather than being skipped.

function unquote(text) {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}

/** `{ [name]: { description, value } }` for the manifest's top-level `outputs:` block. */
export function readActionManifestOutputs(manifest) {
  const lines = manifest.split(/\r?\n/);
  const start = lines.indexOf('outputs:');
  if (start < 0) throw new Error('Action manifest has no top-level outputs: block.');
  const outputs = {};
  let current;
  let folding = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') continue;
    if (!line.startsWith(' ')) break;
    const name = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (name) {
      if (Object.hasOwn(outputs, name[1])) throw new Error(`Action manifest declares output ${name[1]} twice.`);
      current = { description: '', value: '' };
      outputs[name[1]] = current;
      folding = false;
      continue;
    }
    const key = /^ {4}(description|value):(.*)$/.exec(line);
    if (key && current) {
      folding = key[1] === 'description' && key[2].trim() === '>-';
      if (!folding) current[key[1]] = unquote(key[2]);
      continue;
    }
    if (folding && current && /^ {6}\S/.test(line)) {
      current.description = current.description === '' ? line.trim() : `${current.description} ${line.trim()}`;
      continue;
    }
    throw new Error(`Action manifest outputs block has a line this reader does not read: ${JSON.stringify(line)}`);
  }
  return outputs;
}

/** Every difference between two manifests' outputs: a missing output, or a different field. */
export function compareActionManifestOutputs(rootManifest, nestedManifest) {
  const root = readActionManifestOutputs(rootManifest);
  const nested = readActionManifestOutputs(nestedManifest);
  const differences = [];
  for (const name of Object.keys(root)) {
    if (!Object.hasOwn(nested, name)) differences.push(`output ${name} is declared by action.yml but not by action/action.yml`);
  }
  for (const name of Object.keys(nested)) {
    if (!Object.hasOwn(root, name)) {
      differences.push(`output ${name} is declared by action/action.yml but not by action.yml`);
      continue;
    }
    for (const field of ['description', 'value']) {
      if (root[name][field] !== nested[name][field]) {
        differences.push(
          `output ${name} ${field} differs: action.yml ${JSON.stringify(root[name][field])}, action/action.yml ${JSON.stringify(nested[name][field])}`,
        );
      }
    }
  }
  return differences;
}
