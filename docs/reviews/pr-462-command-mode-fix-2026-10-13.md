# PR 462: exclude explicit command mode from version inference

**CONSTRAINTS-VERSION: 2026-08-01.5**

The guard now returns without warning when npm_config_call identifies npm exec --call/npx -c. This mode can deliberately select another artifact; checkout metadata and PATH ordering do not identify a package request. The exclusion precedes both exact-package-pin and checkout inference.

Added two negative controls, with and without an exact package spec. Both fail against the reviewed original source (2 failed, 13 passed) and pass with the fix (15 passed).

Built-CLI reproduction: from a temporary @cejel/cejel package directory at version 0.6.4, npm exec --offline --call explicitly invoking this branch's 0.6.3 artifact now emits only 0.6.3 on stdout and exits 0. The old artifact emitted a false stderr warning. An explicit npm_config_package=@cejel/cejel@0.6.4 package request still warns when this 0.6.3 artifact runs.

Verification: typecheck and pnpm build passed. The full pnpm test suite passed 114 files and 1,899 tests, including 41 offline-boundary tests. An initial full run concurrent with the issue-465 suite failed two elapsed-time assertions (a 500 ms model-call detector bound and a 50 ms regex execution bound); the standalone rerun passed without source or threshold changes. Fixture commits used process-local commit.gpgsign=false. No repository guard was changed.

The lesson seed PENDING_cejel_npx_command_mode_is_not_package_resolution_2026-10-13.json is staged here and validated. Lesson: test alternate invocation modes that produce the same environment signals, and stay silent when the requested package version is unknown. Scoring is unchanged. No merge, release or publish.
