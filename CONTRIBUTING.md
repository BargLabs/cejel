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

Run `pnpm install`, `pnpm test`, `pnpm lint` and `pnpm typecheck` before opening a pull
request. New rules need a test that fails without them.
