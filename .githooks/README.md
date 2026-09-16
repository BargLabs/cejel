# Repository hooks

`pre-commit` refuses the commits where a wrong-branch mistake is most expensive: a commit
directly on `main`, and anything on an `operator/*` branch that is not an operator decision
record. It warns, without blocking, when the branch's pull request has already merged.

Git does not install hooks from a clone. Until you run this, the hook does nothing:

```
git config core.hooksPath .githooks
```

It lived untracked on one machine until 2026-09-16, which meant every fresh clone and every
agent worktree committed without it — a control that exists in one working copy protects one
working copy. Tracking it is what makes it a repository property rather than a local habit.

Deliberate exception, per commit:

```
CEJEL_ALLOW_BRANCH_COMMIT=1 git commit ...
```

Not yet mechanised: nothing verifies that `core.hooksPath` is actually set, so a clone that
skips the line above gets no warning. `scripts/assert-dev-environment.mjs` is where that check
belongs.
