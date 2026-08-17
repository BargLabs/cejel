# LLM v1.9 detector under v3 isolation — cross-policy audit preregistration

Status: **preregistered before any cross-policy golden scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Question and boundary

The historical v1.9 execution record truthfully says that its five declared v1 probe paths were
denied. It did not establish comprehensive no-egress. This audit asks a narrower retrospective
question: when the final v1.9 detector is rebuilt byte-for-byte and its 24 already-spent golden
repositories are scanned behind today's declared v3 application-runtime boundary, do the detector
payloads remain identical after removing only three predeclared run-environment fields?

This is not a literal rerun of the old protocol, a new calibration, a release gate, a reopening of
the terminal v1.9 NO-GO, an untouched-cohort run, or authorization for a precision, recall, or
false-positive claim. The untouched cohort must not be accessed. A v3 probe result is a lower bound
on tested application-runtime surfaces, never a completeness proof and never host/kernel isolation.

## Immutable inputs

Machine-readable bindings are in `bindings.json`. They freeze:

- final historical detector source `5c92625ebd89c6ee071690b7b9dc770a5ef76a3e`, tree
  `b6d5092768cc5ca3f1227a9812e457d2d8f04aff`, package `0.1.8`, build command, build-tree hashes,
  and recorded executable SHA-256 `d8e4fd99e1802bbd48fd71930c05efefb4fa526f6277d1f87ff82492e17cfafa`;
- the 24-repository v1.9 golden manifest, its raw and canonical hashes, and every frozen commit/tree;
- the terminal 24-report v1.9 execution-evidence record and terminal NO-GO record;
- v3 control merge `356aefe84cb43a87c324856497d4aafe8914725c`, exact wrapper/policy/hook/probe bytes,
  policy ID, and the surface list derived under the frozen local runtime; and
- Node `v26.5.0` on `darwin-arm64` and Apple Git `2.50.1`.

The eventual merge commit for this preregistration must be supplied to the runner. Before any clone
or scan, the runner must require local `HEAD` to equal that merge commit, independently confirm
`origin/main`, require the v3 control merge to be an ancestor, and compare every listed
preregistration asset with the exact Git blob at that merge. The preregistration merge must be a
strict ancestor of the first result commit.

## Historical local-Git compatibility

The v1.9 executable itself uses `child_process.execFileSync` for read-only local Git queries. V3
allows only the current hardened Git argv and environment, so invoking v1.9 directly behind the
unmodified v3 hook would conflate network isolation with a changed local-Git interface.

The committed experiment-only adapter resolves that confound without weakening v3. It loads after
the exact v3 hook, recognizes only the finite historical read-only argv/option shapes present in
the bound v1.9 source, requires their working directory to equal the frozen scan root, and rewrites
them through v3's exact hardened Git prefix and environment. Everything else still reaches v3's
denial. The adapter records only event kind, surface ID, or Git subcommand—never argv, paths, source,
credentials, output, or content. Each scan must contain exactly one `adapter_loaded` event.

Separately authored synthetic tests must prove that every historical Git shape needed by v1.9 is
translated, current hardened Git still passes, unrecognized Git and non-Git processes remain
denied, network and DNS calls remain denied and logged, and an incorrect scan root is rejected.

## Sole execution

No golden repository may be cloned or scanned before this preregistration merges. After merge:

1. create and push a fresh result branch at the exact preregistration merge;
2. check out the historical detector commit in a detached clean worktree, install the frozen
   lockfile, build twice with the bound local `tsup`, and require the complete bound build hashes on
   both builds;
3. authenticate the result branch, preregistration blobs, historical artifacts, runtime, v3 assets,
   manifest self-hash and 24 entry hashes, evidence IDs, commits, trees, and executable hash;
4. run the v3 probe once through the experiment wrapper and require every runtime-derived declared
   surface, the local-Git positive control, and all three local-Git negative controls to pass;
5. clone and detached-checkout the 24 golden repositories in manifest order outside the wrapper,
   with HTTPS-only Git transport and LFS smudging disabled, verifying exact commit and tree;
6. scan each repository once, sequentially, through the experiment wrapper with the historical
   invocation `scan {source} --out {output} --pack llm --quiet`;
7. retain each raw `llm-report.json`, its audit events, and the exact comparison record outside all
   repositories; and
8. write one raw JSON result and one human-readable rendering outside the repository, then commit
   those artifacts separately without rerunning.

The 24 scans together are the sole run. No retry is authorized. A binding, checkout, build, probe,
adapter-load, output-parse, or instrumentation failure ends the audit as `INSTRUMENT_FAILURE`; the
failure is preserved and no replacement run is licensed. A detector process error or missing
report is a measured execution difference, not a reason to retry.

## Locked comparison

For each repository, compare the new `llm-report.json` with its committed v1.9 evidence report.
Record raw-byte and whole-document canonical hashes, but decide equivalence only after deleting
exactly these JSON pointers from both documents:

- `/generatedAt`, because the run time necessarily changes;
- `/repo/path`, because the checkout location necessarily changes; and
- `/baseReportSha256`, because the historical base report includes run-environment identity and its
  digest therefore changes with those inputs.

Every other field is exact: schema, head SHA, input-source digest, lineage, findings, rule states,
coverage, assurance, claim boundary, ordering, and all nested values. Any other absent, extra, or
changed field is a difference. The result lists changed JSON pointers without source contents.

## Locked dispositions

- **`MATCH_NO_DENIED_SURFACE_ATTEMPTS`**: all 24 normalized payloads are exact, all scans complete,
  and the adapter logs no v3-denied surface. Licensed statement: *the final v1.9 detector showed no
  behaviorally observable dependence on a v3-denied application-runtime surface in this fixed
  24-repository audit; its historical read-only Git calls were translated through the hardened
  local boundary.*
- **`MATCH_WITH_DENIED_SURFACE_ATTEMPTS`**: all normalized payloads match, but one or more denied
  surfaces were attempted. Report the surface IDs and repositories. No statement that the newly
  denied paths were unused is licensed.
- **`DIFFERENCE`**: any detector process error, missing report, or non-excluded payload difference.
  Report repository IDs, process status, and changed JSON pointers. Do not infer network dependence
  unless a corresponding audited denied-surface event exists.
- **`INSTRUMENT_FAILURE`**: any pre-scan binding/control failure or audit-integrity failure. No
  comparison conclusion is licensed.

None of these states changes the accurate historical observation “5/5 declared v1 probes denied.”
Unless evidence shows that statement itself was false, the follow-up is an interpretive note, not
an erratum. No outcome may be described as proving comprehensive no-egress, and no outcome changes
the v1.9 NO-GO or any published calibration figure.
