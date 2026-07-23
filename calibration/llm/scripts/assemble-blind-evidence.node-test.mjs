import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { assembleBlindEvidence } from './assemble-blind-evidence.mjs';
import { ENABLED_RULE_IDS } from './compute-metrics.mjs';
import { hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';

function makeCheckout(root, repositoryId, body, kind = 'regular') {
  const directory = join(root, ...repositoryId.split('/'));
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['config', 'user.name', 'Calibration Fixture'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: directory });
  if (kind === 'symlink') {
    writeFileSync(join(directory, 'target.js'), body);
    symlinkSync('target.js', join(directory, 'app.js'));
  } else {
    writeFileSync(join(directory, 'app.js'), body);
  }
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: directory });
  execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${repositoryId}.git`], { cwd: directory });
  return {
    directory,
    commit_sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(),
    git_tree_sha: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: directory, encoding: 'utf8' }).trim(),
    content_sha256: createHash('sha256').update(kind === 'symlink' ? 'target.js' : body).digest('hex'),
  };
}

function manifest(cohort, repositoryId, checkout, marker) {
  const repository = {
    repository_id: repositoryId,
    commit_sha: checkout.commit_sha,
    git_tree_sha: checkout.git_tree_sha,
  };
  repository.entry_sha256 = hashRepositoryEntry(repository);
  const document = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    cohort,
    status: 'frozen',
    frozen_at: '2026-07-23T04:00:00.000Z',
    detector_results_seen_before_freeze: false,
    fixture_marker: marker,
    repositories: [repository],
  };
  document.manifest_sha256 = hashManifest(document);
  return document;
}

function fragment(cohort, reviewerId, repositoryId, checkout, label = 'present') {
  const opportunity = {
    rule_id: 'LLM-IOH-001',
    path: 'app.js',
    start_line: 1,
    end_line: 1,
    label,
    rationale: 'The fixture line is a bounded calibration opportunity.',
    content_sha256: checkout.content_sha256,
  };
  const identity = {
    repository_id: repositoryId,
    commit_sha: checkout.commit_sha,
    rule_id: opportunity.rule_id,
    path: opportunity.path,
    start_line: opportunity.start_line,
    end_line: opportunity.end_line,
  };
  return {
    cohort,
    reviewer_id: reviewerId,
    repositories: [{ repository_id: repositoryId, commit_sha: checkout.commit_sha, opportunities: [opportunity] }],
    coverage: ENABLED_RULE_IDS.map((ruleId) => ({
      repository_id: repositoryId,
      commit_sha: checkout.commit_sha,
      rule_id: ruleId,
      declared_opportunity_identities: ruleId === opportunity.rule_id ? [identity] : [],
    })),
  };
}

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cejel-assemble-blind-'));
  const goldenRoot = join(root, 'golden');
  const untouchedRoot = join(root, 'untouched');
  mkdirSync(goldenRoot);
  mkdirSync(untouchedRoot);
  const goldenCheckout = makeCheckout(
    goldenRoot,
    'owner/golden',
    'const prompt = userInput;\n',
    options.goldenKind,
  );
  const untouchedCheckout = makeCheckout(untouchedRoot, 'owner/untouched', 'const prompt = userInput;\n');
  const goldenManifest = manifest('golden', 'owner/golden', goldenCheckout, 'a');
  const untouchedManifest = manifest('untouched', 'owner/untouched', untouchedCheckout, 'b');
  const reviewerA = 'codex-ai-labeler-a';
  const reviewerB = 'codex-ai-labeler-b';
  return {
    root,
    input: {
      goldenManifest,
      untouchedManifest,
      goldenRoot,
      untouchedRoot,
      primary: {
        golden: fragment('golden', reviewerA, 'owner/golden', goldenCheckout),
        untouched: fragment('untouched', reviewerB, 'owner/untouched', untouchedCheckout),
      },
      independent: {
        golden: fragment('golden', reviewerB, 'owner/golden', goldenCheckout),
        untouched: fragment('untouched', reviewerA, 'owner/untouched', untouchedCheckout),
      },
      frozenAt: '2026-07-23T04:08:14.000Z',
      attestationReference: 'internal-witness:blind-fixture',
      expectedCohortSize: 1,
    },
  };
}

test('assembles exact cross-reviewed blind evidence with verified Git bytes', () => {
  const { root, input } = fixture();
  try {
    const result = assembleBlindEvidence(input);
    assert.equal(result.opportunityManifest.opportunities.length, 2);
    assert.equal(result.labelWrappers.length, 4);
    assert.equal(result.sourceEvidenceIndex.files.length, 2);
    assert.equal(result.opportunityDiscoveryCoverage.coverage.length, 16);
    assert.deepEqual(
      result.opportunityDiscoveryCoverage.blind_reviewers,
      ['codex-ai-labeler-a', 'codex-ai-labeler-b'],
    );
    assert.match(
      result.opportunityManifest.opportunities[0].opportunity_id,
      /^llm-opportunity-(golden|untouched)-[a-f0-9]{32}$/,
    );
    assert.ok(result.labelWrappers.every(({ document }) =>
      document.review.independent_of_rule_author === true &&
      document.review.detector_output_visible === false));
    assert.deepEqual(
      Object.keys(result.opportunityManifest.opportunities[0]).sort(),
      ['cohort', 'commit_sha', 'evidence_scope', 'opportunity_id', 'repository_id', 'rule_id'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a symlink as opportunity source before freezing evidence', () => {
  const { root, input } = fixture({ goldenKind: 'symlink' });
  try {
    assert.throws(() => assembleBlindEvidence(input), /not one regular Git blob/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects incomplete coverage, mismatched cross-review, and non-distinct reviewers', () => {
  const { root, input } = fixture();
  try {
    input.primary.golden.coverage.pop();
    assert.throws(() => assembleBlindEvidence(input), /coverage omits/);
    input.primary.golden.coverage.push({
      repository_id: 'owner/golden',
      commit_sha: input.goldenManifest.repositories[0].commit_sha,
      rule_id: 'LLM-EVL-002',
      declared_opportunity_identities: [],
    });
    input.independent.golden.repositories[0].opportunities[0].label = 'absent';
    assert.throws(() => assembleBlindEvidence(input), /require a distinct adjudication/);
    input.adjudication = {
      reviewer_id: 'codex-ai-adjudicator-c',
      decisions: [{
        cohort: 'golden',
        repository_id: 'owner/golden',
        commit_sha: input.goldenManifest.repositories[0].commit_sha,
        rule_id: 'LLM-IOH-001',
        path: 'app.js',
        start_line: 1,
        end_line: 1,
        label: 'present',
        rationale: 'The adjudicator independently resolved the bounded fixture disagreement.',
      }],
    };
    const adjudicated = assembleBlindEvidence(input);
    const goldenLabels = adjudicated.labelWrappers
      .map(({ document }) => document)
      .filter((document) => document.cohort === 'golden');
    assert.equal(goldenLabels.length, 3);
    assert.deepEqual(
      goldenLabels.map((document) => document.review.adjudication_status).sort(),
      ['adjudicated', 'pending', 'pending'],
    );
    assert.equal(
      goldenLabels.find((document) => document.review.role === 'adjudicator')
        .review.supersedes_label_ids.length,
      2,
    );
    input.independent.golden.repositories[0].opportunities[0].label = 'present';
    delete input.adjudication;
    input.independent.golden.reviewer_id = input.primary.golden.reviewer_id;
    assert.throws(() => assembleBlindEvidence(input), /exactly two cross-reviewing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
