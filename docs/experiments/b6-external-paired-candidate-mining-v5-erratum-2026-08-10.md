# B6 external paired candidate mining v5 — ciphertext-verification erratum (2026-08-10)

Status: **BINDING CLARIFICATION; acquisition not yet run**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Bound preregistration

| Artifact | Immutable binding |
|---|---|
| V5 preregistration merge | `28e2ab6d7bd214c28481715d5995ab26844b9431` |
| V5 preregistration blob / SHA-256 | `c931e641dcf08ca13bfa6c0e54069485b32ff03c` / `0dbbce94874cf5f3ac4b80fdb46359b49eb7e3028b64a7d2bcafe296df21c61e` |

No live v5 request, v4 archive read, candidate-source read, detector invocation, or result-producing
action occurred before this erratum.

## Ambiguity and correction

The preregistration's immutable-binding table requires the v5 harness to verify the v4 encrypted
live-response artifact's blob, byte count, and SHA-256. A later exposure-closure sentence says that
v5 "does not access the v4 encrypted archive." Read literally, the latter would prohibit reading
the ciphertext bytes needed to verify the mandatory SHA-256.

For v5, **access** in that sentence means semantic or private-evidence access. The harness must read
the committed ciphertext bytes only to verify the exact bound Git blob, byte count, and SHA-256.
That mechanical ciphertext verification is required before the first live request and is not
response reuse.

The harness must not:

- decrypt or extract the v4 archive;
- parse, deserialize, inspect, copy, or reuse a v4 response;
- derive a repository identity, PR number, URL, path, source byte, candidate count, exclusion,
  rank, selection, corpus row, or oracle row from the v4 ciphertext; or
- use a v4 response as a cache, pagination input, retry input, or substitute for any v5 request.

Synthetic tests must prove that v4 binding verification reads the ciphertext only as opaque bytes
for blob/size/SHA-256 equality and exposes none of those bytes to acquisition or parsing code.

## Unchanged protocol

This clarification changes no query, page, cutoff, order, retry status, retry delay, rate threshold,
endpoint, exposure exclusion, rank, resource bound, oracle, prediction, terminal state, privacy
boundary, ancestry requirement, or claim boundary. V5 still begins at query 1, page 1 and issues its
own complete search frame. There remains one invocation and no rerun, resume, response reuse, manual
substitution, detector run, or Cejel scan.

The eventual merge containing this erratum and its document blob are additional mandatory
cross-repository bindings. The Alfred v5 harness may not be committed before those values exist.
