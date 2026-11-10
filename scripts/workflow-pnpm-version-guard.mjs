// Workflows that set up pnpm must take its version from package.json packageManager, never from a
// version: input on pnpm/action-setup. A hardcoded version either disagrees with packageManager or
// fails with "Multiple versions of pnpm specified".
//
// The check reads each step as a whole: every list item that names pnpm/action-setup in a uses: key,
// from its "- " line to the next line indented no deeper than that dash. Before #686 item 5 it read
// only block-style version: lines after the uses: line, so a flow-style with: { version: ... }, a
// step written entirely in flow style, and a with: placed before uses: all passed.
//
// Textual, like the other workflow checks in scripts/validate-distribution-metadata.mjs: it covers
// the spellings these workflows use, not every YAML spelling. It is a consistency check on this
// repository's own CI, not a gate on what runs in callers' jobs.

const LIST_ITEM = /^(\s*)-(?:\s|$)/;
const USES_PNPM_ACTION_SETUP = /(?:^|[\s{,])["']?uses["']?\s*:\s*["']?pnpm\/action-setup@/;
const VERSION_KEY = /(?:^|[\s{,])["']?version["']?\s*:\s*["']?([^"'\s#,}]+)/;

function indentOf(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function isBlankOrComment(line) {
  return /^\s*(?:#.*)?$/.test(line);
}

// Each pnpm/action-setup step that sets a version, as { line, version } with a 1-based line number.
export function pnpmActionSetupVersionPins(workflow) {
  const lines = workflow.split(/\r?\n/);
  const pins = [];
  for (const [start, line] of lines.entries()) {
    const item = LIST_ITEM.exec(line);
    if (!item) continue;
    const dashIndent = item[1].length;
    let end = start + 1;
    while (end < lines.length && (isBlankOrComment(lines[end]) || indentOf(lines[end]) > dashIndent)) end += 1;
    const step = lines.slice(start, end);
    if (!step.some((stepLine) => USES_PNPM_ACTION_SETUP.test(stepLine.replace(/#.*$/, '')))) continue;
    for (const [offset, stepLine] of step.entries()) {
      const version = VERSION_KEY.exec(stepLine.replace(/(?:^|\s)#.*$/, ''));
      if (version) pins.push({ line: start + offset + 1, version: version[1] });
    }
  }
  return pins;
}

export function requirePnpmVersionDerived(workflowName, workflow, expectedVersion) {
  const [pin] = pnpmActionSetupVersionPins(workflow);
  if (!pin) return;
  if (pin.version !== expectedVersion) {
    throw new Error(
      `${workflowName}:${pin.line} pnpm/action-setup version ${pin.version} disagrees with package.json packageManager pnpm@${expectedVersion}; remove the workflow version so it is derived.`,
    );
  }
  throw new Error(
    `${workflowName}:${pin.line} hardcodes pnpm/action-setup version ${pin.version}; remove the workflow version so pnpm@${expectedVersion} is derived from package.json packageManager.`,
  );
}
