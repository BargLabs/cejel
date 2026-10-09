# Cejel for Claude

Cejel scores a repository's engineering-trust signals (tests, secrets, isolation,
claim-vs-reality, and CI discipline) against a published rubric and returns a trust
certificate with cited evidence. This plugin gives Claude the Cejel `scan` tool and a skill
that tells Claude when to run a scan and how to read the certificate.

A Cejel score is evidence for your own judgment. It is not an audit, a certification, or a
guarantee that code is correct or secure.

## What the plugin contains

- **MCP server `cejel`**: started by `npx` from the `@cejel/cejel` npm package, pinned to
  the exact version this plugin release names in its `.mcp.json`. It
  exposes one tool, `scan` (read-only, non-destructive, idempotent, no network), and two
  resources: the HTML certificate and the SVG badge from the most recent scan.
- **Skill `cejel-scan`**: when to run a scan, how to read the scores, verdict, findings and
  scan limitations, and how to describe a result without overstating it.

## What it runs, sends and fetches

- **Scanning is offline.** The `scan` tool reads the repository at the path you give it and
  returns the certificate. It makes no network calls, sends no telemetry, calls no model, and
  writes no files. It runs your local `git` binary through one hardened subprocess with
  network transports disabled.
- **Starting the server fetches the package once.** The first time the server starts, `npx`
  downloads `@cejel/cejel` at the pinned version from the npm registry and caches it. That is a
  one-time install by `npx`, not part of the scan.
- **Remote repositories are cloned by Claude, not by Cejel.** If you ask about a repository
  that is not on your machine, the skill tells Claude to ask before making a full `git clone`
  into a temporary directory and scanning that.

## Example prompts

- "Clone https://github.com/BargLabs/cejel into a temporary folder and give me its Cejel
  trust score."
- "Scan https://github.com/BargLabs/cejel with Cejel and explain the top findings and the
  criteria they come from."
- "Run Cejel on https://github.com/BargLabs/cejel and save its trust badge to
  ./cejel-badge.svg."

## Known issues

- **Cejel's certificate for its own repository currently cites three pieces of evidence that do
  not support the credit given:** the B6 review gate, the B6 fail-closed check and the A3 error
  boundary. The detectors match strings in Cejel's own detector source, tests and review notes.
  The fix changes scoring, so it ships with a published before-and-after. In a measurement on a
  full clone of v0.6.2 with these credits removed, Cejel's own score fell from 3.4 to 3.1; the
  shipped fix may land slightly differently. Tracked in
  [#433](https://github.com/BargLabs/cejel/issues/433).
- **Inside a checkout of the Cejel repository itself,** `npx @cejel/cejel@<version>` may run
  whichever `cejel` is on your `PATH` instead of the pinned version. Run it from another
  directory. Tracked in [#436](https://github.com/BargLabs/cejel/issues/436).

## Support, privacy and terms

- Support: [GitHub issues](https://github.com/BargLabs/cejel/issues)
- Privacy policy: https://barglabs.ai/privacy
- Terms: https://barglabs.ai/terms
- Source and full documentation: https://github.com/BargLabs/cejel

Cejel is licensed under AGPL-3.0-only.
