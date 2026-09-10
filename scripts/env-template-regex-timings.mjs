import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Explicit immutable baseline; this script never checks out or changes source files.
const baseline = process.argv[2];
if (!baseline || !/^[a-f0-9]{40}$/.test(baseline)) throw new Error('Pass the full pre-fix commit SHA');
const before = execFileSync('git', ['show', `${baseline}:src/witan/repo-signals.ts`], { encoding: 'utf8' });
const after = readFileSync(new URL('../src/witan/repo-signals.ts', import.meta.url), 'utf8');
console.log(`Node ${process.version}; baseline ${baseline}; 1000 ms hard timeout per case.`);
console.log('| Pattern | Bytes | Before ms | After ms |');
console.log('|---|---:|---:|---:|');
for (const name of ['ENV_TEMPLATE_PATTERN', 'ENV_TEMPLATE_PATTERN_V47']) {
  for (const bytes of [14, 18, 22, 64, 255]) {
    // Exact byte lengths; all are ASCII legal filenames with a nonmatching final '!'.
    const input = '.env' + '.a'.repeat(Math.ceil((bytes - 5) / 2)).slice(0, bytes - 5) + '!';
    if (Buffer.byteLength(input) !== bytes) throw new Error('Wrong specimen byte length');
    const cells = [before, after].map((source) => {
      const literal = source.match(new RegExp(`const ${name} =\\s*(/[^\\n]+/i);`))?.[1];
      if (!literal) throw new Error(`Missing ${name}`);
      try {
        return runInNewContext(`const start = performance.now(); (${literal}).test(input); performance.now() - start`, { input, performance }, { timeout: 1000 }).toFixed(3);
      } catch (error) {
        if (error.code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw error;
        return 'TIMEOUT (>1000)';
      }
    });
    console.log(`| ${name} | ${bytes} | ${cells[0]} | ${cells[1]} |`);
  }
}
