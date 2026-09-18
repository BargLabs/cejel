import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V24,
} from '../rubric-version.js';

// goal_cejel_secret_posture_context_track_b_2026-09-15. A2's secret-posture signal asserts a
// committed secret for example/placeholder credentials written into tutorials, learning pages and
// other instructional material. By this repository's severity doctrine that is a false assertion,
// not a recall gap, and it is the worse category.
//
// Every `it` in this file is a guard against a specific way the fix could be wrong, and every one
// of them fails on the pre-fix tree. The ordering below is deliberate: the guard that matters most
// is not "the placeholder stops flagging", it is "a real secret committed under docs/ still flags"
// — a path-based exemption would turn this false positive into a false negative in the one place
// an attacker would most like one, which is strictly worse than the defect being fixed.
//
// Fixture material is invented. `cejel` is public, so a committed fixture is publication: no value
// here is copied from any real repository, vendor example, product, or report.

function makeTmpRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: dir });
  // Hermetic: never inherit the machine's signing configuration into a fixture commit
  // (PENDING_cejel_hermetic_fixture_*, #305).
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, relativePath: string, contents: string): void {
  const path = join(dir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  execFileSync('git', ['add', '--', relativePath], { cwd: dir });
}

function commit(dir: string, message: string): void {
  execFileSync('git', ['commit', '--quiet', '--no-gpg-sign', '-m', message], { cwd: dir });
}

function a2Signal(dir: string, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'synthetic-secret-context',
    productDisplayName: 'Synthetic secret context',
    repoPath: dir,
    generatedAt: '2026-09-15T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((signal) => signal.criterionId === 'A2');
}

function committedSecretFindings(dir: string, rubricVersion: string) {
  return (a2Signal(dir, rubricVersion)?.findings ?? []).filter((finding) =>
    /Secret-shaped value appears committed/i.test(finding.summary),
  );
}

function pemPrivateKeyFindings(dir: string, rubricVersion: string) {
  return (a2Signal(dir, rubricVersion)?.findings ?? []).filter((finding) =>
    /PEM-formatted private key/i.test(finding.summary),
  );
}

function abstentionFindings(dir: string, rubricVersion: string) {
  return (a2Signal(dir, rubricVersion)?.findings ?? []).filter((finding) =>
    /ambiguous content context/i.test(finding.summary),
  );
}

function secretCleanlinessMetric(dir: string, rubricVersion: string) {
  return (a2Signal(dir, rubricVersion)?.metrics ?? []).find(
    (metric) => metric.name === 'secret_cleanliness',
  );
}

// A ratable A2 secrets surface, so the archetype N/A gate never decides these fixtures for us.
// Without it a repository with no confirmed secret finding returns `not_applicable` and the
// assertions below would pass for the wrong reason.
const GITIGNORE = '.env\n.env.*\n!.env.example\n';
const PRODUCT_SOURCE = 'export const version = "1.0.0";\n';

// An instructional phrase, not a credential: nine ordinary English words a reader is meant to
// replace. It is 43 characters of mixed upper/lower/digit with no separators, so it clears the
// existing generic-shape, mixed-character-class and entropy bars and is scored as a real committed
// secret today — lexical shape alone cannot tell it apart from a token
// (alfred_pr_lessons_2026-07-09, entry 22).
const PLACEHOLDER_VALUE = 'ReplaceThisWithYourOwnApiKeyValue1234567890';

// Invented, high-entropy, with no English-word composition and no placeholder vocabulary: the
// shape of an actual leaked credential.
const REAL_VALUE = 'Qv8Ht2Nx6Br4Ls9Dw3Pk7Zf1Mj5Cy0Ag4Tu8Ei2Ro6Xn';

// Sixteen hex characters assigned to an `apiToken` identifier. It is too short for the confident
// real-secret bar and carries no placeholder vocabulary: Cejel cannot tell from content whether
// this is a short live token or a made-up documentation value, which is exactly the case the
// abstention exists for.
const AMBIGUOUS_VALUE = '7f3b9c2e4a6d8051';

const TUTORIAL_PAGE = `"""Getting started with the Acme analytics client."""

from acme import Client

client = Client(api_key="${PLACEHOLDER_VALUE}")
`;

const DOCS_RUNBOOK = `# Ingest credential rotation

The ingest worker authenticates to the analytics collector on start-up. Rotate the
value below every quarter and restart the worker pool.

    ANALYTICS_INGEST_TOKEN=${REAL_VALUE}
`;

const AMBIGUOUS_SOURCE = `export const telemetryConfig = {
  endpoint: "https://collector.internal.invalid/v1",
  apiToken: "${AMBIGUOUS_VALUE}",
};
`;

// Recreated from pem-private-key-v23.test.ts: deterministic fixture material, never a real key.
// This deliberately exercises the multiline PEM grammar rather than the generic token matcher.
function syntheticPemValue(header = 'PRIVATE KEY'): string {
  const raw = Array.from(
    { length: 24 },
    (_, index) => `witan-synthetic-pem-fixture-material-${index}`,
  ).join('|');
  const body = Buffer.from(raw, 'utf8').toString('base64');
  const wrapped: string[] = [];
  for (let index = 0; index < body.length; index += 64) wrapped.push(body.slice(index, index + 64));
  return `-----BEGIN ${header}-----\n${wrapped.join('\n')}\n-----END ${header}-----\n`;
}

describe('A2 v24 content-context secret classification — a real secret under docs/ still flags', () => {
  it('flags a real-shaped credential committed to a documentation path, at full critical severity', () => {
    const dir = makeTmpRepo('witan-v24-real-in-docs-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, 'docs/runbook.md', DOCS_RUNBOOK);
    commit(dir, 'add runbook');

    // RED (pre-fix): v17's path-based non-production credential exemption removes every `docs/`
    // path and every `.md` file from A2's secret scan, so a real credential committed there is
    // never even read. GREEN: v24 reads it and flags it.
    const v24 = committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(v24).toHaveLength(1);
    expect(v24[0]?.severity).toBe('critical');
    expect(v24[0]?.evidence?.path).toBe('docs/runbook.md');
    // The value itself is never reproduced in the certificate — length and character classes only.
    expect(v24[0]?.evidence?.label).not.toContain(REAL_VALUE);

    // The finding is not hedged, softened, or downgraded because the path says "docs".
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)?.value).toBe(0);

    // v17 and v22 behaviour is unchanged: both still miss it, and this fix does not retroactively
    // reinterpret a single certificate either of them produced.
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V17)).toEqual([]);
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V22)).toEqual([]);
  });

  it('classifies identical bytes identically in a production path and a documentation path', () => {
    const production = makeTmpRepo('witan-v24-invariance-src-');
    writeFile(production, '.gitignore', GITIGNORE);
    writeFile(production, 'src/config/ingest.ts', `const ANALYTICS_INGEST_TOKEN = "${REAL_VALUE}";\n`);
    commit(production, 'add ingest config');

    const documentation = makeTmpRepo('witan-v24-invariance-docs-');
    writeFile(documentation, '.gitignore', GITIGNORE);
    writeFile(
      documentation,
      'docs/config/ingest.md',
      `const ANALYTICS_INGEST_TOKEN = "${REAL_VALUE}";\n`,
    );
    commit(documentation, 'add ingest config');

    const inProduction = committedSecretFindings(production, WITAN_RUBRIC_VERSION_V24);
    const inDocumentation = committedSecretFindings(documentation, WITAN_RUBRIC_VERSION_V24);

    // RED (pre-fix): the documentation copy produces no finding at all. GREEN: the two verdicts
    // differ only in the `path` field — the path-invariance property stated directly, rather than
    // inferred from the absence of a path check in the classifier.
    expect(inDocumentation).toHaveLength(1);
    expect(inProduction).toHaveLength(1);
    expect(inDocumentation[0]?.severity).toBe(inProduction[0]?.severity);
    expect(inDocumentation[0]?.summary).toBe(inProduction[0]?.summary);
    expect(inDocumentation[0]?.evidence?.label).toBe(inProduction[0]?.evidence?.label);
    expect(inDocumentation[0]?.evidence?.path).toBe('docs/config/ingest.md');
    expect(inProduction[0]?.evidence?.path).toBe('src/config/ingest.ts');
  });
});

describe('A2 v24 content-context secret classification — PEM reachability', () => {
  it('recognizes a plausible synthetic PEM private key in a tracked non-template .env current tree', () => {
    const dir = makeTmpRepo('witan-v24-pem-current-tree-');
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, '.env', `PRIVATE_KEY="${syntheticPemValue()}"\n`);
    commit(dir, 'add synthetic PEM private key');

    // RED before the v24 matcher is reachable: generic assignment matching cannot recognise the
    // multiline PEM value. GREEN: v24 emits the same dedicated critical finding v23 already
    // produces for this known-plausible synthetic material.
    const findings = pemPrivateKeyFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.evidence?.path).toBe('.env');
  });

  it('gives the same critical PEM verdict for identical current-tree and history payloads', () => {
    const current = makeTmpRepo('witan-v24-pem-current-parity-');
    writeFile(current, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(current, '.env', `PRIVATE_KEY="${syntheticPemValue()}"\n`);
    commit(current, 'add synthetic PEM private key');

    const historical = makeTmpRepo('witan-v24-pem-history-parity-');
    writeFile(historical, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(historical, '.env', `PRIVATE_KEY="${syntheticPemValue()}"\n`);
    commit(historical, 'add synthetic PEM private key');
    writeFile(historical, '.env', 'PRIVATE_KEY=your-key-here\n');
    commit(historical, 'replace synthetic PEM with a placeholder');

    const currentFinding = pemPrivateKeyFindings(current, WITAN_RUBRIC_VERSION_V24);
    const historyFinding = pemPrivateKeyFindings(historical, WITAN_RUBRIC_VERSION_V24);

    expect(currentFinding).toHaveLength(1);
    expect(historyFinding).toHaveLength(1);
    expect(currentFinding[0]?.severity).toBe('critical');
    expect(historyFinding[0]?.severity).toBe(currentFinding[0]?.severity);
    expect(historyFinding[0]?.evidence?.path).toBe('.env');
  });

  it('abstains for the same plausible PEM under an instructional comment that preparation strips', () => {
    const dir = makeTmpRepo('witan-v24-pem-instructional-context-');
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(
      dir,
      '.env',
      `# Replace this with your own private key.\nPRIVATE_KEY="${syntheticPemValue()}"\n`,
    );
    commit(dir, 'add synthetic PEM instructional example');

    const abstentions = abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(abstentions).toHaveLength(1);
    expect(abstentions[0]?.summary).toMatch(
      /clears the confident real-secret bar but sits in an instructional context/i,
    );
    expect(pemPrivateKeyFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)).toBeUndefined();
  });

  it('does not let an instructional PEM pre-empt a later unmarked PEM in the same file', () => {
    const dir = makeTmpRepo('witan-v24-pem-precedence-');
    const contents = [
      '# Replace this with your own private key.',
      `PRIVATE_KEY="${syntheticPemValue()}"`,
      `BACKUP_PRIVATE_KEY="${syntheticPemValue('RSA PRIVATE KEY')}"`,
      '',
    ].join('\n');
    const unmarkedPemLine =
      contents.split('\n').findIndex((line) => line.startsWith('BACKUP_PRIVATE_KEY=')) + 1;
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, '.env', contents);
    commit(dir, 'add marked and unmarked synthetic PEM keys');

    // As with generic candidates, any confirmed leak wins over an earlier ambiguity.
    const findings = pemPrivateKeyFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(findings).toHaveLength(1);
    // The verdict must cite the real candidate that decided it, never the adjacent example.
    expect(findings[0]?.evidence?.line).toBe(unmarkedPemLine);
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)?.value).toBe(0);
  });

  it('gives the same critical disposition when the instructional PEM follows the confirmed PEM', () => {
    const dir = makeTmpRepo('witan-v24-pem-precedence-transposed-');
    const contents = [
      `BACKUP_PRIVATE_KEY="${syntheticPemValue('RSA PRIVATE KEY')}"`,
      '# Replace this with your own private key.',
      `PRIVATE_KEY="${syntheticPemValue()}"`,
      '',
    ].join('\n');
    const unmarkedPemLine =
      contents.split('\n').findIndex((line) => line.startsWith('BACKUP_PRIVATE_KEY=')) + 1;
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, '.env', contents);
    commit(dir, 'add unmarked and marked synthetic PEM keys');

    // Evidence, not document position, decides the result: any real candidate wins.
    const findings = pemPrivateKeyFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence?.line).toBe(unmarkedPemLine);
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)?.value).toBe(0);
  });
});

describe('A2 v24 content-context secret classification — a placeholder stops being asserted', () => {
  it('does not assert a committed secret for an instructional placeholder in a tutorial page', () => {
    const dir = makeTmpRepo('witan-v24-placeholder-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, 'tutorials/getting-started.py', TUTORIAL_PAGE);
    commit(dir, 'add tutorial');

    // RED (pre-fix): this is the defect. `tutorials/` is not covered by any path exemption, the
    // value clears every lexical bar, and A2 asserts a committed secret that does not exist.
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
    // Not an abstention either: the value is unambiguously instructional, so a clean result is
    // the correct assertion, not `insufficient_data`.
    expect(abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)?.value).toBe(1);

    // v17 and v22 keep the existing (wrong) behaviour byte-for-byte. This fix rides a prospective
    // rubric precisely so that no calibrated certificate silently changes underneath it.
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V22]) {
      const legacy = committedSecretFindings(dir, rubricVersion);
      expect(legacy).toHaveLength(1);
      expect(legacy[0]?.severity).toBe('critical');
      expect(secretCleanlinessMetric(dir, rubricVersion)?.value).toBe(0);
    }
  });

  it('suppresses the same placeholder under a production source path, so the fix is content-based and not a relocated path rule', () => {
    const dir = makeTmpRepo('witan-v24-placeholder-src-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/client.py', TUTORIAL_PAGE);
    commit(dir, 'add client');

    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
    expect(abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V17)).toHaveLength(1);
  });
});

describe('A2 v24 content-context secret classification — ambiguity abstains rather than passing silently', () => {
  it('abstains the secret_cleanliness metric, with a stated reason, on a value it cannot classify', () => {
    const dir = makeTmpRepo('witan-v24-ambiguous-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/telemetry/client.ts', AMBIGUOUS_SOURCE);
    commit(dir, 'add telemetry client');

    // RED (pre-fix): the value is below the confident real-secret bar, so every existing rubric
    // reports nothing and scores secret_cleanliness a clean 1 — a silent pass on a value Cejel
    // has not actually classified. GREEN: v24 abstains and says why.
    const abstentions = abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(abstentions).toHaveLength(1);
    expect(abstentions[0]?.severity).toBe('info');
    expect(abstentions[0]?.summary).toMatch(/abstains/i);
    // A stated reason, not a bare abstention.
    expect(abstentions[0]?.summary).toMatch(
      /clears neither the placeholder vocabulary nor the confident real-secret bar/i,
    );
    expect(abstentions[0]?.evidence?.path).toBe('src/telemetry/client.ts');
    expect(abstentions[0]?.evidence?.label).not.toContain(AMBIGUOUS_VALUE);

    // Abstention means the metric is withheld, not scored clean and not scored zero.
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)).toBeUndefined();
    // Never a critical: an abstention must not assert a leak either.
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);

    // v17 and v22: unchanged silent pass, metric present and clean.
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V22]) {
      expect(abstentionFindings(dir, rubricVersion)).toEqual([]);
      expect(secretCleanlinessMetric(dir, rubricVersion)?.value).toBe(1);
    }
  });

  it('abstains identically for the same ambiguous bytes under a documentation path', () => {
    const dir = makeTmpRepo('witan-v24-ambiguous-docs-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, 'docs/telemetry.md', AMBIGUOUS_SOURCE);
    commit(dir, 'add telemetry doc');

    const abstentions = abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(abstentions).toHaveLength(1);
    expect(abstentions[0]?.evidence?.path).toBe('docs/telemetry.md');
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)).toBeUndefined();
  });

  it('abstains rather than silently clearing a real-shaped value that sits next to an instructional marker', () => {
    const dir = makeTmpRepo('witan-v24-marked-real-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(
      dir,
      'docs/quickstart.md',
      `# Quickstart

Set the ingest token before the first run. Replace this with your own value.

    ANALYTICS_INGEST_TOKEN=${REAL_VALUE}
`,
    );
    commit(dir, 'add quickstart');

    // This is the seam that decides whether the fix is safe. An adjacent "replace this with your
    // own" marker is exactly what a documentation example looks like — and also exactly what a
    // genuine leaked credential looks like when somebody pasted a live key into the instructions.
    // Content cannot separate the two, so v24 abstains. It must never silently clear it, because
    // the value itself clears the confident real-secret bar.
    const abstentions = abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24);
    expect(abstentions).toHaveLength(1);
    expect(abstentions[0]?.summary).toMatch(
      /clears the confident real-secret bar but sits in an instructional context/i,
    );
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)).toBeUndefined();
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
  });

  it('reads the instructional marker out of a comment line, which the credential-scan preparation blanks', () => {
    const dir = makeTmpRepo('witan-v24-comment-marker-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(
      dir,
      'src/settings.py',
      `# Replace this with your own value before deploying.
ANALYTICS_INGEST_TOKEN = "${REAL_VALUE}"
`,
    );
    commit(dir, 'add settings');

    // The v39 credential-scan preparation blanks whole comment lines before the assignment grammar
    // ever runs, which is exactly where the instructional marker usually lives. The classifier
    // therefore reads its context window from the RAW file while the grammar reads the prepared
    // copy; every preparation step is line-preserving, so the two line numberings agree. If that
    // ever stops being true this test flips to a critical finding rather than an abstention.
    expect(abstentionFindings(dir, WITAN_RUBRIC_VERSION_V24)).toHaveLength(1);
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toEqual([]);
  });

  it('does not let an ambiguous value withhold the metric when a confident secret is also present', () => {
    const dir = makeTmpRepo('witan-v24-mixed-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/telemetry/client.ts', AMBIGUOUS_SOURCE);
    writeFile(dir, 'src/config/ingest.ts', `const ANALYTICS_INGEST_TOKEN = "${REAL_VALUE}";\n`);
    commit(dir, 'add config and telemetry');

    // An abstention must never remove a zero that a confirmed critical finding earned. If it did,
    // a repository could hide a real leak behind one unclassifiable value.
    expect(committedSecretFindings(dir, WITAN_RUBRIC_VERSION_V24)).toHaveLength(1);
    expect(secretCleanlinessMetric(dir, WITAN_RUBRIC_VERSION_V24)?.value).toBe(0);
  });
});

describe('A2 v24 content-context secret classification — non-A2 behaviour is untouched', () => {
  it('leaves every other criterion byte-identical between v22 and v24 on the same repository', () => {
    const dir = makeTmpRepo('witan-v24-other-criteria-');
    writeFile(dir, '.gitignore', GITIGNORE);
    writeFile(dir, 'src/index.ts', PRODUCT_SOURCE);
    writeFile(dir, 'tutorials/getting-started.py', TUTORIAL_PAGE);
    writeFile(dir, 'package.json', '{\n  "name": "synthetic",\n  "version": "1.0.0"\n}\n');
    commit(dir, 'add project');

    const base = (rubricVersion: string) =>
      (
        buildWitanInputFromRepo({
          productSlug: 'synthetic-secret-context',
          productDisplayName: 'Synthetic secret context',
          repoPath: dir,
          generatedAt: '2026-09-15T00:00:00.000Z',
          rubricVersion,
        }).signals ?? []
      ).filter((signal) => signal.criterionId !== 'A2');

    expect(JSON.stringify(base(WITAN_RUBRIC_VERSION_V24))).toBe(
      JSON.stringify(base(WITAN_RUBRIC_VERSION_V22)),
    );
  });
});
