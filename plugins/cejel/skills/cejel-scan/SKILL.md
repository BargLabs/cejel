---
name: cejel-scan
description: Score a repository's engineering-trust signals with Cejel and read the resulting certificate. Use when the user asks how trustworthy, well-tested, or production-ready a codebase is, wants a trust score, certificate, or badge for a repository, asks whether AI-written code is backed by tests and CI, or wants to compare a repository against Cejel's published rubric.
allowed-tools: mcp__plugin_cejel_cejel__scan
---

# Scan a repository with Cejel

Cejel scores a repository against a published rubric and returns a trust certificate with
cited evidence. The scan runs offline on this machine: no network calls, no telemetry, no
model call, and the MCP server writes no files. The `scan` tool is the same deterministic
scoring the `cejel` CLI runs, so the same repository scores the same way every time.

## When to run a scan

Run `scan` when the user wants evidence about a repository's engineering discipline, for
example:

- "How trustworthy is this repo?" or "Is this codebase production-ready?"
- "Does this AI-written code actually have tests and CI behind it?"
- "Give me a trust score, certificate, or badge for this repository."
- Comparing two repositories, or the same repository before and after a change.

Do not run it to answer a question about one function or file, and do not present it as a
security audit, a vulnerability scan, or a code review.

## How to run it

1. The tool takes a local path. For the current project, pass its root directory. If the user
   names a remote repository, ask before cloning it; if they agree, make a shallow clone into a
   temporary directory (`git clone --depth 1 <url> <tmpdir>`) and scan that directory. The clone
   is your network access, not Cejel's; say so if the user asks about the offline promise.
2. Call `scan` with `{ "path": "<absolute path>" }`. The default `summary` format is enough for
   most questions. Use `{ "format": "json" }` only when the user wants every criterion and its
   evidence.
3. After a scan, the full HTML certificate and the SVG badge are available as the server's two
   resources (`last-scan/certificate.html` and `last-scan/badge.svg`). Offer them when the user
   wants something to share.

## How to read the certificate

- `overallScore`, `codeTrustScore`, `processTrustScore`: scores on a 0 to 4 scale. Code trust
  covers what the source shows (tests, secrets, isolation, claim-vs-reality); process trust
  covers how work on it is run and recorded (CI and QA discipline, traceability, audit trail).
- `verdict`: one of `Verified`, `Conditional`, `At risk`, `Unverified`, `Insufficient source`,
  `Insufficient evidence`. Report it as written; do not soften or upgrade it.
- `topFindings`: the most severe findings, each with a `criterionId` and a `severity`
  (`critical`, `warning`, `info`). Quote the finding's summary and name its criterion so the
  user can check the evidence.
- `scanLimitations`: anything that degraded evidence collection. Each one qualifies every
  score and the verdict. Always mention them when present.
- Null scores with `Insufficient source` or `Insufficient evidence` mean Cejel abstained: the
  repository has no ratable source, or no criterion could be measured. That is a correct
  output. Never estimate or invent a score in its place.
- `contributingSources` and `externalSources`: findings from other scanners that were folded
  in. Attribute them to their source tool, not to Cejel.

## What a score is, and what it is not

A Cejel score is evidence for the user's own judgment. It is not an audit, a certification by
Barg Labs, or a guarantee that the code is correct, secure, or free of defects. Static analysis
misses things, so a good score does not mean nothing is wrong, and a finding is a pointer to
check, not a verdict on the authors. When you summarise a scan:

- State what was measured and cite the criteria and findings behind the score.
- Say that the user should weigh it alongside their own review.
- Never describe a high score as "safe", "secure", "audited", or "certified", and never claim
  Cejel found every problem.
