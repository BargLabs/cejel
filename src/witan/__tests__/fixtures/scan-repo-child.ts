// Child-process entry for scan-path timing guards (goal_cejel_scan_path_regex_bounds_2026-10-15).
// A stalled V8 regex blocks its own thread, so neither a test timeout nor a Promise race can stop
// it; the parent runs the real scan here and kills the process when the budget runs out.
//
// Usage: node --import tsx scan-repo-child.ts <repoPath> <rubricVersion>
import { buildWitanInputFromRepo } from '../../repo-signals.js';

const [repoPath, rubricVersion] = process.argv.slice(2);
if (!repoPath || !rubricVersion) {
  process.stderr.write('usage: scan-repo-child.ts <repoPath> <rubricVersion>\n');
  process.exit(2);
}

// Timed around the scan alone, so start-up cost never counts against the scan's budget.
// Test-only stand-in, used only by the guard's own check that it can fail: an environment variable
// CEJEL_SCAN_CHILD_DELAY_MS blocks this thread for that many milliseconds inside the timed span.
const delayMs = Number(process.env.CEJEL_SCAN_CHILD_DELAY_MS ?? 0);
const started = performance.now();
const input = buildWitanInputFromRepo({
  productSlug: 'scan-path-bounds-fixture',
  productDisplayName: 'Scan path bounds fixture',
  repoPath,
  generatedAt: '2026-10-15T00:00:00.000Z',
  rubricVersion,
});
if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
const elapsedMs = performance.now() - started;
const signal = (id: string) => (input.signals ?? []).find((s) => s.criterionId === id);
process.stdout.write(
  `${JSON.stringify({
    elapsedMs,
    a1Findings: (signal('A1')?.findings ?? []).map((finding) => finding.summary),
    b3ScriptDepthCondition:
      signal('B3')?.metrics?.find((metric) => metric.name === 'ci_script_depth')?.presentation
        ?.condition ?? null,
    b2Notes: signal('B2')?.notes ?? null,
    b3Notes: signal('B3')?.notes ?? null,
    b3Disclosures: signal('B3')?.disclosures ?? [],
  })}\n`,
);
