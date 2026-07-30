# Contributing to Cejel

Thank you for wanting to. Bug reports, rules, false-positive reports and fixes are all welcome —
and **false-positive reports are the most valuable thing you can send us.** Publishing our own error
rate is the core of how this tool earns trust; we cannot do that without people telling us when we
are wrong.

## Before your first pull request: the CLA

You will need to sign our [Contributor Licence Agreement](./CLA.md). A bot will ask you on your
first pull request; you sign by leaving a single comment, and it covers everything you contribute
afterwards.

**Why there is one at all.** The Cejel CLI is published under the AGPL, and the same code also
ships inside our commercially licensed and air-gapped builds. A Developer Certificate of Origin
would not let us do that, which would mean we could not accept your contribution.

**What we promise in return.** Clause 3 of the CLA: every contribution accepted into Cejel remains
available, permanently, under an OSI-approved open source licence. We may additionally license it
commercially — we will never take your work closed.

## Reporting a false positive

Open an issue with the finding, the file and line it fired on, and why it is wrong. If you can,
include a minimal reproduction. These go into the public rubric changelog, including the ones that
make us look bad.

## Code

Cejel pins its pnpm version in `package.json`. pnpm honors that pin by self-switching, so
`pnpm --version` should report `9.0.0`. Corepack is an alternative: if a separately installed
pnpm shadows its shim or does not switch cleanly, `corepack pnpm --version` is the reliable
way to verify and use the pinned version.

If you are running through an agent harness, its Electron host may pass
`NODE_ENV=production` to the shell. pnpm normally treats that as a production-only install;
because Cejel has no runtime dependencies, the command can install none of the required build
and test tools while still exiting successfully. The repository `.npmrc` prevents that silent
no-op, and the install/test guards fail with a named explanation so the environment cannot be
misdiagnosed as a pnpm problem. Prefix development commands with `NODE_ENV=development` if
the guard fires.

Run `pnpm install`, `pnpm test`, `pnpm run validate:distribution` and `pnpm typecheck` before
opening a pull request. New rules need a test that fails without them.
