import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileBlindFragments } from './reconcile-blind-fragments.mjs';

function fragment(cohort, reviewerId, opportunities) {
  return {
    cohort,
    reviewer_id: reviewerId,
    repositories: [{
      repository_id: 'fixture/repository',
      commit_sha: 'a'.repeat(40),
      opportunities,
    }],
    coverage: [],
  };
}

function opportunity(path, label = 'present') {
  return {
    rule_id: 'LLM-AGY-001',
    path,
    start_line: 10,
    end_line: 12,
    content_sha256: 'b'.repeat(64),
    label,
    rationale: 'Private reviewer rationale that must never enter reconciliation output.',
  };
}

test('emits only identity differences and never copies labels or rationales', () => {
  const result = reconcileBlindFragments({
    reviewerA: {
      golden: fragment('golden', 'reviewer-a', [opportunity('shared.ts')]),
      untouched: fragment('untouched', 'reviewer-a', [opportunity('a-only.py', 'absent')]),
    },
    reviewerB: {
      golden: fragment('golden', 'reviewer-b', [opportunity('shared.ts')]),
      untouched: fragment('untouched', 'reviewer-b', [opportunity('b-only.py', 'ambiguous')]),
    },
  });
  assert.equal(result.summary.golden.exact_identity_union, true);
  assert.equal(result.summary.untouched.missing_for_reviewer_a, 1);
  assert.equal(result.summary.untouched.missing_for_reviewer_b, 1);
  const serialized = JSON.stringify([result.reviewerA, result.reviewerB]);
  assert.doesNotMatch(serialized, /"label"|rationale|present|absent|ambiguous/);
  assert.match(serialized, /a-only\.py/);
  assert.match(serialized, /b-only\.py/);
});

test('rejects duplicate identities and identical reviewer IDs', () => {
  const duplicated = [opportunity('same.ts'), opportunity('same.ts')];
  assert.throws(() => reconcileBlindFragments({
    reviewerA: {
      golden: fragment('golden', 'reviewer-a', duplicated),
      untouched: fragment('untouched', 'reviewer-a', []),
    },
    reviewerB: {
      golden: fragment('golden', 'reviewer-b', []),
      untouched: fragment('untouched', 'reviewer-b', []),
    },
  }), /duplicate/);
  assert.throws(() => reconcileBlindFragments({
    reviewerA: {
      golden: fragment('golden', 'same-reviewer', []),
      untouched: fragment('untouched', 'same-reviewer', []),
    },
    reviewerB: {
      golden: fragment('golden', 'SAME-REVIEWER', []),
      untouched: fragment('untouched', 'SAME-REVIEWER', []),
    },
  }), /distinct reviewer/);
});

test('rejects inconsistent source digests and reviewer identity changes across cohorts', () => {
  const left = opportunity('same.ts');
  const right = { ...left, content_sha256: 'c'.repeat(64) };
  assert.throws(() => reconcileBlindFragments({
    reviewerA: {
      golden: fragment('golden', 'reviewer-a', [left]),
      untouched: fragment('untouched', 'reviewer-a', []),
    },
    reviewerB: {
      golden: fragment('golden', 'reviewer-b', [right]),
      untouched: fragment('untouched', 'reviewer-b', []),
    },
  }), /whole-file digest/);
  assert.throws(() => reconcileBlindFragments({
    reviewerA: {
      golden: fragment('golden', 'reviewer-a', []),
      untouched: fragment('untouched', 'reviewer-a-renamed', []),
    },
    reviewerB: {
      golden: fragment('golden', 'reviewer-b', []),
      untouched: fragment('untouched', 'reviewer-b', []),
    },
  }), /stable identity/);
});
