import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name) ? [path] : [];
  }).sort();
}

function literals() {
  const patterns: { id: string; literal: string }[] = [];
  for (const path of sourceFiles(join(root, 'src/witan'))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        patterns.push({ id: `${relative(root, path)}:${line}`, literal: node.getText(source) });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return patterns;
}

const families = [
  { name: 'env-dotted-rejection', input: `.env${'.a'.repeat(120)}!` },
  { name: 'repeated-a-dot', input: 'a.'.repeat(120) },
  { name: 'hyphens', input: '-'.repeat(250) },
  { name: 'path-separators', input: 'a/'.repeat(120) },
  { name: 'env-dotted-rejection-255', input: `.env${'.a'.repeat(125)}!` },
  { name: 'repeated-a-dot-255', input: `${'a.'.repeat(127)}a` },
  { name: 'hyphens-255', input: '-'.repeat(255) },
  { name: 'path-separators-255', input: `${'a/'.repeat(127)}a` },
];

test('scan regex literals finish each adversarial family within 50 ms', () => {
  // Deliberate superset: all production witan literals, including content patterns.
  // AST enumeration avoids heuristic path-variable names silently omitting a sink.
  // VM timeouts interrupt regex execution; Promise races cannot interrupt a hung V8 regex.
  const patterns = literals();
  expect(patterns.length).toBeGreaterThan(0);
  const failures: string[] = [];
  for (const pattern of patterns) {
    for (const family of families) {
      try {
        runInNewContext(`(${pattern.literal}).test(input)`, { input: family.input }, { timeout: 50 });
      } catch (error) {
        failures.push(`${pattern.id} ${pattern.literal} family=${family.name}: ${String(error)}`);
      }
    }
  }
  console.log(`Examined ${patterns.length} regex literals across ${sourceFiles(join(root, 'src/witan')).length} production witan files; ${families.length} families each; ${failures.length} failures.`);
  expect(failures, failures.join('\n')).toEqual([]);
}, 120_000);

test('each env-template pattern preserves its own previous classifications', () => {
  const source = readFileSync(join(root, 'src/witan/repo-signals.ts'), 'utf8');
  const corpus = new Set([
    '.env.example', '.env.local.example', '.env.prod.sample', '.env.example.bak',
    'config/.env.dist', 'env.example', '.envexample', 'a/.env.template', 'README',
    '.env.a..sample', '.env..sample', '.env...example', '.env.', '.env.a./sample',
  ]);
  for (const prefix of ['', 'config/', 'a/']) {
    for (const middle of ['', '.local', '.prod', '.a.b', '..', '.a..', '.-', '.a/']) {
      for (const suffix of ['example', 'sample', 'template', 'dist', 'exemplo', 'ejemplo', 'exemple', 'esempio', 'beispiel', 'voorbeeld', 'bak', '', 'EXAMPLE']) {
        corpus.add(`${prefix}.env${middle}.${suffix}`);
      }
    }
  }
  for (let i = 0; i < 30; i++) corpus.add(`filename${i}`);
  expect(corpus.size).toBeGreaterThanOrEqual(200);
  for (const name of ['ENV_TEMPLATE_PATTERN', 'ENV_TEMPLATE_PATTERN_V47']) {
    const literal = source.match(new RegExp(`const ${name} =\\s*(/[^\\n]+/i);`))?.[1];
    expect(literal).toBeDefined();
    const current = new RegExp(literal!.slice(1, -2), 'i');
    // Freeze each pattern's own former language, including its own suffix list.
    const suffixes = name.endsWith('_V47')
      ? 'example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld'
      : 'example|sample|template|dist';
    const previous = new RegExp(`(^|/)\\.env(?:\\.[^/]+)*\\.(?:${suffixes})$`, 'i');
    const differences = [...corpus].filter((path) => previous.test(path) !== current.test(path));
    console.log(`${name}: ${corpus.size} filenames; diff=${JSON.stringify(differences)}`);
    expect(differences).toEqual([]);
  }
});
