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
  that is not on your machine, the skill tells Claude to ask before making a shallow
  `git clone` into a temporary directory and scanning that.

## Example prompts

- "Clone https://github.com/sindresorhus/slugify into a temporary folder and give me its Cejel
  trust score."
- "Scan https://github.com/sindresorhus/slugify with Cejel and explain the top findings and the
  criteria they come from."
- "Run Cejel on https://github.com/sindresorhus/slugify and save its trust badge to
  ./slugify-badge.svg."

## Support, privacy and terms

- Support: [GitHub issues](https://github.com/BargLabs/cejel/issues)
- Privacy policy: https://barglabs.ai/privacy
- Terms: https://barglabs.ai/terms
- Source and full documentation: https://github.com/BargLabs/cejel

Cejel is licensed under AGPL-3.0-only.
