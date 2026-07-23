import { createHash } from 'node:crypto';

import { canonicalize } from './freeze-cohorts.mjs';

const REPOSITORY = 'BargLabs/cejel';
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}`;
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function expectedCommitmentCommentBody(gitCommit, documentSha256) {
  return [
    '<!-- cejel-calibration-pre-result-v1 -->',
    canonicalize({
      protocol_id: 'cejel-llm-calibration-v1',
      git_commit: gitCommit,
      commitment_document_sha256: documentSha256,
    }),
  ].join('\n');
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub proof lookup failed with HTTP ${response.status}`);
  const serverDate = Date.parse(response.headers.get('date') || '');
  if (!Number.isFinite(serverDate)) throw new Error('GitHub proof response lacks a valid server Date header');
  return { document: await response.json(), serverDate };
}

function validUtc(value) {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

export async function verifyGitHubExecutionProof(
  proof,
  {
    fetchImpl = globalThis.fetch,
    artifactBytesByRunId = new Map(),
    evidenceBundleByRunId = new Map(),
    requireCompleted = true,
  } = {},
) {
  if (
    !proof || proof.schema_version !== '1.0.0' ||
    proof.protocol_id !== 'cejel-llm-calibration-v1' ||
    proof.provider !== 'github_actions_public_v1' || proof.repository !== REPOSITORY ||
    !/^[a-f0-9]{40}$/.test(proof.commitment?.git_commit || '') ||
    !/^[a-f0-9]{64}$/.test(proof.commitment?.document_sha256 || '') ||
    !Number.isSafeInteger(proof.commitment?.comment_id) ||
    proof.commitment.comment_api_url !== `${API_ROOT}/issues/comments/${proof.commitment.comment_id}` ||
    !Array.isArray(proof.runs) || proof.runs.length < 1
  ) throw new Error('GitHub execution proof is malformed');

  const commentResponse = await fetchJson(proof.commitment.comment_api_url, fetchImpl);
  const comment = commentResponse.document;
  const expectedBody = expectedCommitmentCommentBody(
    proof.commitment.git_commit,
    proof.commitment.document_sha256,
  );
  if (
    comment.id !== proof.commitment.comment_id || comment.url !== proof.commitment.comment_api_url ||
    comment.body !== expectedBody || comment.created_at !== proof.commitment.created_at ||
    comment.updated_at !== comment.created_at || !validUtc(comment.created_at) ||
    Date.parse(comment.created_at) > commentResponse.serverDate
  ) throw new Error('GitHub commitment comment does not verify as an immutable public timestamp');

  const seenRuns = new Set();
  const verifiedRuns = [];
  for (const runProof of proof.runs) {
    if (
      !['golden', 'untouched'].includes(runProof?.cohort) ||
      !Number.isSafeInteger(runProof?.run_id) || seenRuns.has(runProof.run_id) ||
      runProof.run_api_url !== `${API_ROOT}/actions/runs/${runProof.run_id}` ||
      !/^[a-f0-9]{64}$/.test(runProof.workflow_sha256 || '') ||
      !Number.isSafeInteger(runProof.artifact?.id) ||
      runProof.artifact.api_url !== `${API_ROOT}/actions/artifacts/${runProof.artifact.id}` ||
      !/^[a-f0-9]{64}$/.test(runProof.artifact.archive_sha256 || '') ||
      !/^[a-f0-9]{64}$/.test(runProof.artifact.evidence_bundle_sha256 || '')
    ) throw new Error('GitHub workflow-run proof is malformed or duplicated');
    seenRuns.add(runProof.run_id);
    const workflowUrl = `${API_ROOT}/contents/.github/workflows/llm-calibration.yml?ref=${runProof.head_sha}`;
    const [runResponse, compareResponse, artifactResponse, workflowResponse] = await Promise.all([
      fetchJson(runProof.run_api_url, fetchImpl),
      fetchJson(
        `${API_ROOT}/compare/${proof.commitment.git_commit}...${encodeURIComponent(runProof.head_sha)}`,
        fetchImpl,
      ),
      fetchJson(runProof.artifact.api_url, fetchImpl),
      fetchJson(workflowUrl, fetchImpl),
    ]);
    const run = runResponse.document;
    const comparison = compareResponse.document;
    const artifact = artifactResponse.document;
    const workflow = workflowResponse.document;
    const workflowBytes = Buffer.from(String(workflow.content || '').replaceAll('\n', ''), 'base64');
    if (
      run.id !== runProof.run_id || run.repository?.full_name !== REPOSITORY ||
      run.head_sha !== runProof.head_sha || !/^[a-f0-9]{40}$/.test(run.head_sha || '') ||
      run.event !== 'workflow_dispatch' ||
      !String(run.path || '').startsWith('.github/workflows/llm-calibration.yml@') ||
      !validUtc(run.created_at) || !validUtc(run.run_started_at) ||
      Date.parse(comment.created_at) >= Date.parse(run.run_started_at) ||
      (requireCompleted && (run.status !== 'completed' || run.conclusion !== 'success')) ||
      (!requireCompleted && !['queued', 'in_progress', 'completed'].includes(run.status)) ||
      !['ahead', 'identical'].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== proof.commitment.git_commit ||
      artifact.id !== runProof.artifact.id || artifact.expired !== false ||
      artifact.workflow_run?.id !== runProof.run_id || artifact.workflow_run?.head_sha !== run.head_sha ||
      artifact.digest !== `sha256:${runProof.artifact.archive_sha256}`
      || workflow.path !== '.github/workflows/llm-calibration.yml' || workflow.encoding !== 'base64' ||
      sha256Bytes(workflowBytes) !== runProof.workflow_sha256
    ) throw new Error('GitHub workflow run, ancestry, or artifact proof does not verify');
    const localArtifact = artifactBytesByRunId.get(runProof.run_id);
    if (requireCompleted && (!localArtifact || sha256Bytes(localArtifact) !== runProof.artifact.archive_sha256)) {
      throw new Error('local calibration artifact bytes do not match GitHub\'s server-recorded digest');
    }
    const evidenceBundle = evidenceBundleByRunId.get(runProof.run_id);
    if (
      requireCompleted &&
      (!evidenceBundle ||
        sha256Bytes(Buffer.from(canonicalize(evidenceBundle), 'utf8')) !==
          runProof.artifact.evidence_bundle_sha256)
    ) {
      throw new Error('downloaded calibration artifact lacks the hash-bound evidence bundle');
    }
    verifiedRuns.push({
      cohort: runProof.cohort,
      run_id: runProof.run_id,
      run_started_at: run.run_started_at,
      head_sha: run.head_sha,
      workflow_sha256: runProof.workflow_sha256,
      artifact_archive_sha256: runProof.artifact.archive_sha256,
      evidence_bundle_sha256: runProof.artifact.evidence_bundle_sha256,
      evidence_bundle: evidenceBundle || null,
    });
  }
  return {
    proof_document_sha256: sha256Bytes(Buffer.from(canonicalize(proof), 'utf8')),
    commitment_git_commit: proof.commitment.git_commit,
    commitment_created_at: comment.created_at,
    commitment_comment_sha256: sha256Bytes(Buffer.from(expectedBody, 'utf8')),
    runs: verifiedRuns,
  };
}
