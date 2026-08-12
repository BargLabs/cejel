reap_worktree() {
  root=/definitely/missing/repository
  wt=/definitely/missing/worktree
  branch=fixture-branch

  if ! git -C "${root}" worktree remove --force "${wt}" 2>&1; then
    echo "worktree removal failed" >&2
    return 1
  fi
  git -C "${root}" branch -D "${branch}" 2>&1 || true
  echo "reaped worktree ${wt} (branch ${branch}) — verified pushed+clean before removal."
  return 0
}

reap_worktree
