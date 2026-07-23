import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  expectedCommitmentCommentBody,
  verifyGitHubExecutionProof,
} from './github-execution-proof.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const COMMIT = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const DOCUMENT_SHA = 'c'.repeat(64);
const ARTIFACT = Buffer.from('exact GitHub artifact archive bytes', 'utf8');
const BUNDLE = {
  schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', cohort: 'golden',
  execution_receipts: [], llm_reports: [],
};
const API = 'https://api.github.com/repos/BargLabs/cejel';
const WORKFLOW = Buffer.from('name: calibration\n', 'utf8');

function fixture() {
  const body = expectedCommitmentCommentBody(COMMIT, DOCUMENT_SHA);
  const proof = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    provider: 'github_actions_public_v1', repository: 'BargLabs/cejel',
    commitment: {
      git_commit: COMMIT, document_sha256: DOCUMENT_SHA, comment_id: 42,
      comment_api_url: `${API}/issues/comments/42`, created_at: '2026-07-22T20:00:00Z',
    },
    runs: [{
      cohort: 'golden', run_id: 99, run_api_url: `${API}/actions/runs/99`, head_sha: HEAD,
      workflow_sha256: sha(WORKFLOW),
      artifact: {
        id: 77, api_url: `${API}/actions/artifacts/77`, archive_sha256: sha(ARTIFACT),
        evidence_bundle_sha256: sha(Buffer.from(canonicalize(BUNDLE), 'utf8')),
      },
    }],
  };
  const responses = new Map([
    [proof.commitment.comment_api_url, {
      id: 42, url: proof.commitment.comment_api_url, body,
      created_at: proof.commitment.created_at, updated_at: proof.commitment.created_at,
    }],
    [proof.runs[0].run_api_url, {
      id: 99, repository: { full_name: 'BargLabs/cejel' }, head_sha: HEAD,
      event: 'workflow_dispatch', path: '.github/workflows/llm-calibration.yml',
      created_at: '2026-07-22T20:01:00Z', run_started_at: '2026-07-22T20:02:00Z',
      status: 'completed', conclusion: 'success',
    }],
    [`${API}/compare/${COMMIT}...${HEAD}`, {
      status: 'ahead', merge_base_commit: { sha: COMMIT },
    }],
    [proof.runs[0].artifact.api_url, {
      id: 77, expired: false, digest: `sha256:${sha(ARTIFACT)}`,
      workflow_run: { id: 99, head_sha: HEAD },
    }],
    [`${API}/contents/.github/workflows/llm-calibration.yml?ref=${HEAD}`, {
      path: '.github/workflows/llm-calibration.yml', encoding: 'base64',
      content: WORKFLOW.toString('base64'),
    }],
  ]);
  const fetchImpl = async (url) => ({
    ok: responses.has(url), status: responses.has(url) ? 200 : 404,
    headers: new Map([['date', 'Wed, 22 Jul 2026 21:00:00 GMT']]),
    json: async () => structuredClone(responses.get(url)),
  });
  return { proof, responses, fetchImpl };
}

test('verifies public comment, workflow ancestry, server time, and artifact bytes', async () => {
  const { proof, fetchImpl } = fixture();
  const result = await verifyGitHubExecutionProof(proof, {
    fetchImpl,
    artifactBytesByRunId: new Map([[99, ARTIFACT]]),
    evidenceBundleByRunId: new Map([[99, BUNDLE]]),
  });
  assert.equal(result.commitment_created_at, proof.commitment.created_at);
  assert.equal(result.runs[0].artifact_archive_sha256, sha(ARTIFACT));
});

test('rejects backdating, edited comments, unrelated heads, fake isolation runs, and artifact changes', async () => {
  for (const mutate of [
    ({ responses, proof }) => { responses.get(proof.commitment.comment_api_url).updated_at = '2026-07-22T20:00:01Z'; },
    ({ responses, proof }) => { responses.get(proof.runs[0].run_api_url).run_started_at = '2026-07-22T19:59:00Z'; },
    ({ responses, proof }) => { responses.get(`${API}/compare/${COMMIT}...${HEAD}`).merge_base_commit.sha = 'd'.repeat(40); },
    ({ responses, proof }) => { responses.get(proof.runs[0].run_api_url).path = '.github/workflows/other.yml@main'; },
    ({ responses }) => {
      responses.get(`${API}/contents/.github/workflows/llm-calibration.yml?ref=${HEAD}`).content =
        Buffer.from('name: changed\n').toString('base64');
    },
  ]) {
    const current = fixture();
    mutate(current);
    await assert.rejects(
      verifyGitHubExecutionProof(current.proof, {
        fetchImpl: current.fetchImpl,
        artifactBytesByRunId: new Map([[99, ARTIFACT]]),
        evidenceBundleByRunId: new Map([[99, BUNDLE]]),
      }),
    );
  }
  const current = fixture();
  await assert.rejects(verifyGitHubExecutionProof(current.proof, {
    fetchImpl: current.fetchImpl,
    artifactBytesByRunId: new Map([[99, Buffer.from('tampered')]]),
    evidenceBundleByRunId: new Map([[99, BUNDLE]]),
  }), /artifact bytes/);
  const changedBundle = fixture();
  await assert.rejects(verifyGitHubExecutionProof(changedBundle.proof, {
    fetchImpl: changedBundle.fetchImpl,
    artifactBytesByRunId: new Map([[99, ARTIFACT]]),
    evidenceBundleByRunId: new Map([[99, { ...BUNDLE, cohort: 'untouched' }]]),
  }), /evidence bundle/);
});
