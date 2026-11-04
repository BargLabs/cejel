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

// Timed around the scan alone, so start-up cost never counts against the scan's budget. Two
// measures: wall time (elapsedMs), which also counts every moment the runner gives this process's
// CPU to something else, and this process's own CPU time (cpuMs, user plus system), which counts
// only work the scan does. A stalled regex or a super-linear reader burns this thread's CPU, so it
// shows in cpuMs; a busy CI runner running other test workers alongside does not (cejel #561).
// The scan's git child processes are not in cpuMs; they run no regex of ours.
//
// Two test-only stand-ins, used only by the guard's own check that it can fail: an environment
// variable CEJEL_SCAN_CHILD_BURN_MS spins this thread for that many milliseconds of CPU inside the
// timed span (a stand-in for a regex stall), and CEJEL_SCAN_CHILD_IDLE_MS blocks it, using no CPU,
// for that many milliseconds (a stand-in for a runner that is busy elsewhere).
const burnMs = Number(process.env.CEJEL_SCAN_CHILD_BURN_MS ?? 0);
const idleMs = Number(process.env.CEJEL_SCAN_CHILD_IDLE_MS ?? 0);
const cpuMsSince = (start: NodeJS.CpuUsage): number => {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
};
const started = performance.now();
const cpuStarted = process.cpuUsage();
const input = buildWitanInputFromRepo({
  productSlug: 'scan-path-bounds-fixture',
  productDisplayName: 'Scan path bounds fixture',
  repoPath,
  generatedAt: '2026-10-15T00:00:00.000Z',
  rubricVersion,
});
if (burnMs > 0) {
  const burnStart = process.cpuUsage();
  let spin = 0;
  while (cpuMsSince(burnStart) < burnMs) spin += 1;
  if (spin < 0) process.stdout.write('');
}
if (idleMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, idleMs);
const cpuMs = cpuMsSince(cpuStarted);
const elapsedMs = performance.now() - started;
const signal = (id: string) => (input.signals ?? []).find((s) => s.criterionId === id);
process.stdout.write(
  `${JSON.stringify({
    elapsedMs,
    cpuMs,
    a1Findings: (signal('A1')?.findings ?? []).map((finding) => finding.summary),
    b3ScriptDepthCondition:
      signal('B3')?.metrics?.find((metric) => metric.name === 'ci_script_depth')?.presentation
        ?.condition ?? null,
    b2Notes: signal('B2')?.notes ?? null,
    b3Notes: signal('B3')?.notes ?? null,
    b3Disclosures: signal('B3')?.disclosures ?? [],
  })}\n`,
);
