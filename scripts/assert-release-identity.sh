#!/usr/bin/env bash

set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG must be set}"
: "${GITHUB_REF:?GITHUB_REF must be set}"
: "${GITHUB_SHA:?GITHUB_SHA must be set}"

if ! git cat-file -e "${RELEASE_TAG}^{commit}" 2>/dev/null; then
  echo "release tag ${RELEASE_TAG} is unavailable in checkout" >&2
  exit 1
fi

tag_commit="$(git rev-parse "${RELEASE_TAG}^{commit}")"
checked_out_head="$(git rev-parse HEAD)"
echo "GITHUB_REF=${GITHUB_REF}"
echo "GITHUB_SHA=${GITHUB_SHA}"
echo "release_tag_commit=${tag_commit}"
echo "checked_out_HEAD=${checked_out_head}"

test "$GITHUB_REF" = "refs/tags/$RELEASE_TAG" \
  || { echo "dispatch ref $GITHUB_REF is not refs/tags/$RELEASE_TAG" >&2; exit 1; }
echo "dispatch-ref assertion passed"
test "$GITHUB_SHA" = "$tag_commit" \
  || { echo "GITHUB_SHA does not identify $RELEASE_TAG" >&2; exit 1; }
echo "dispatch-SHA assertion passed"
test "$checked_out_head" = "$tag_commit" \
  || { echo "checked-out HEAD does not identify $RELEASE_TAG" >&2; exit 1; }
echo "checkout assertion passed"

git fetch --quiet origin main:refs/remotes/origin/main
if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
  echo "$RELEASE_TAG is not an ancestor of origin/main" >&2
  exit 1
fi
echo "main-ancestry assertion passed"

require_contained_commit() {
  local commit="$1"
  local description="$2"

  if ! git cat-file -e "${commit}^{commit}" 2>/dev/null; then
    echo "required ${description} commit ${commit} is unavailable in checkout" >&2
    exit 1
  fi
  if ! git merge-base --is-ancestor "$commit" "$GITHUB_SHA"; then
    echo "$RELEASE_TAG does not contain ${description}" >&2
    exit 1
  fi
  echo "${description} containment assertion passed"
}

require_contained_commit e4283ba '#96 (remove timestamps)'
require_contained_commit e50f531 '#98 (--pack llm docs)'
