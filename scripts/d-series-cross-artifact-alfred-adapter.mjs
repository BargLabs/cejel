import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArguments(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`invalid_argument:${key ?? ''}`);
    args.set(key, value);
  }
  return args;
}

const args = parseArguments(process.argv);
const alfredRootArgument = args.get('--alfred-root');
if (!alfredRootArgument) throw new Error('missing_argument:--alfred-root');
const alfredRoot = resolve(alfredRootArgument);
const corpusRelativePathArgument = args.get('--corpus-relative-path');
if (!corpusRelativePathArgument) throw new Error('missing_argument:--corpus-relative-path');
const reportRelativePathArgument = args.get('--report-relative-path');
if (!reportRelativePathArgument) throw new Error('missing_argument:--report-relative-path');

const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: alfredRoot,
  encoding: 'utf8',
}).trim();
const cacheBust = `?revision=${revision}`;
const corpus = await import(
  `${pathToFileURL(resolve(alfredRoot, corpusRelativePathArgument)).href}${cacheBust}`
);
const report = await import(
  `${pathToFileURL(resolve(alfredRoot, reportRelativePathArgument)).href}${cacheBust}`
);

function runFixture(caughtSeedIds) {
  return {
    protocolVersion: corpus.DUAL_CONTROL_PROTOCOL_VERSION,
    selectionSeed: corpus.DUAL_CONTROL_SELECTION_SEED,
    preregistrationCommit: '1'.repeat(40),
    harnessCommit: '2'.repeat(40),
    frozenSourceBlobs: {
      corpus: '3'.repeat(40),
      oracle: '4'.repeat(40),
      report: '5'.repeat(40),
      runner: '6'.repeat(40),
    },
    startedAt: '2026-07-30T00:00:00.000Z',
    completedAt: '2026-07-30T01:00:00.000Z',
    seeded: 16,
    cleanControls: 16,
    excludedUnanchored: [...corpus.DUAL_CONTROL_EXCLUDED_UNANCHORED],
    positiveControl: {
      phaseKind: 'positive_control',
      controlId: 'PC-01',
      defectFile: 'src/subject.mjs',
      cited: true,
      cejelInvocations: ['static_rubric', 'quant_integrity_pack'],
      citingFindings: [
        {
          criterionId: 'A2',
          summary: 'Secret-shaped value appears committed in the scanned repository.',
          evidencePath: 'src/subject.mjs',
        },
      ],
    },
    outcomes: corpus.DUAL_CONTROL_SEEDS.map((seed) => {
      const caught = caughtSeedIds.includes(seed.id);
      return {
        seedId: seed.id,
        title: seed.title,
        prReferences: seed.prReferences,
        defectClass: seed.defectClass,
        partition: seed.partition,
        seeded: {
          oracleSatisfied: false,
          caughtBy: caught ? 'static_rubric' : 'nothing',
          caught,
          completionClaim: { asserted: true, text: seed.completionClaimText },
          cejelInvocations: ['static_rubric', 'quant_integrity_pack'],
          details: [],
        },
        clean: {
          oracleSatisfied: true,
          caughtBy: 'nothing',
          caught: false,
          completionClaim: { asserted: true, text: seed.completionClaimText },
          cejelInvocations: ['static_rubric', 'quant_integrity_pack'],
          details: [],
        },
      };
    }),
  };
}

const summaries = {
  zero: report.summarizeDualControlRun(runFixture([])),
  perfect: report.summarizeDualControlRun(
    runFixture(corpus.DUAL_CONTROL_SEEDS.map((seed) => seed.id)),
  ),
};
process.stdout.write(`${JSON.stringify({ revision, summaries })}\n`);
