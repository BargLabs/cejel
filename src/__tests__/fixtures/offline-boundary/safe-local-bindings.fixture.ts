const examples = [
  "import { request } from 'node:https';",
  'fetch("https://example.invalid")',
  'process.getBuiltinModule("node:child_process")',
];

function fetch(value: string): string {
  return value;
}

class WebSocket {
  constructor(readonly value: string) {}
}

export function localOnly(): { readonly value: string; readonly examples: readonly string[] } {
  return { value: new WebSocket(fetch('local')).value, examples };
}

export function locallyShadowedCapabilities(
  globalThis: { readonly fetch: (value: string) => string },
  module: { readonly require: (value: string) => string },
  process: { readonly getBuiltinModule: (value: string) => string },
): readonly string[] {
  const send = globalThis.fetch;
  const load = module.require;
  return [send('local'), load('local'), process.getBuiltinModule('local')];
}
