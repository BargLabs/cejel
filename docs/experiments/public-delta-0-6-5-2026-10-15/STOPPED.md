# Stopped before preregistration — the precedent harness cannot take these arms unchanged

**CONSTRAINTS-VERSION: 2026-08-01.5**

This directory was to hold a preregistered public before-and-after for the 0.6.5 scoring changes
(#479, #484, #487, #489, #490 under v17) and v26 item 6 (#482, v25 against v26). The protocol
required the harness in `../v17-delta-459-427-430-2026-10-13/harness/` to be reused unchanged, and
said to stop if it could not take an arm without a change. It cannot, so the experiment stopped
here.

## What was done and what was not

- Resolved the arms without running them: `before` is
  `093de2a16408f249be3470b9f4e385e21c8899a8` (tag `v0.6.4`), and `after` is
  `98dbf2505406fd3f3ac9eb4d904bf5e2d044edbd`, the merge commit of #490 and `origin/main` at
  dispatch.
- Read the harness source (`common.mjs`, `score-arm.mts`, `compare.mjs`, `harness.node-test.mjs`,
  `RUN.md`) at `98dbf2505406fd3f3ac9eb4d904bf5e2d044edbd`.
- **No preregistration was written or committed.** A preregistration bound to a harness that
  cannot execute it would be dead on arrival: it would need an erratum and a successor before any
  arm could run.
- **No arm ran.** No scanner was imported, no target was copied or cloned, no scratch root was
  created, and no row-level output from any run was read.

## Why the harness cannot take the arms

`common.mjs` `loadPlan` (the only plan loader, called by both `score-arm.mts` and `compare.mjs`)
refuses any plan unless all of these hold:

1. `plan.rubricVersion === 'witan-rubric-v17-2026-07-24'`. `score-arm.mts` passes
   `plan.rubricVersion` to every arm, so the rubric is fixed per plan, not chosen per run. Pair 2
   needs runs under `witan-rubric-v25-prospective-2026-10-12` and
   `witan-rubric-v26-prospective-2026-10-14`, and the loader refuses both. **Pair 2 cannot run.**
2. `Object.keys(plan.arms).join(',') === 'before459,after459,fixes'`. This experiment's arms are
   `before` and `after`. `compare.mjs` also hard-codes three pairs over those names and their
   allowed criteria: `459` allows A3 only, `fixes` allows A1 and A2, and `release` allows A1, A2
   and A3.
3. `plan.schema === 'cejel-three-arm-public-delta-v1'`, so the schema has exactly three arms.

Pair 1 (v17, `before` to `after`) could be forced through only by binding this experiment's arms
to the precedent's names, with a third name bound to something. Each way of doing that is
rejected:

- Binding `fixes` to `after` scores the same commit twice under two names. That breaks the
  once-per-arm rule.
- Binding `fixes` to any other commit adds an arm that this experiment does not have.
- In either case, `unexpectedCriteria` in `paired-result.json` would be computed against the
  precedent's allowed lists, not this experiment's E1. The published record would then carry a
  mislabelled field.

Pair 1 alone would also be only part of the experiment, while pair 2 stayed blocked.

## What would unblock it (operator decision; not done here)

A separately reviewed harness successor, merged before any new preregistration cites it. It would
need to:

- declare runs as (name, full commit, rubric) in the plan;
- declare pairs and their allowed criteria in the plan rather than in code;
- keep every current guard: corpus digest, public-only filter, target identity and history, clean
  source, refused overwrite, and scalar-only export;
- extend `harness.node-test.mjs` with a test that a plan carrying an unlisted rubric or an
  undeclared pair is refused.

The expected values E0 to E5 in the dispatch card were not copied into any committed file here,
so a later preregistration can carry them unchanged, with no outcome having been read.
