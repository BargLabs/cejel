# Security Review: cejel-secfix

## Scope

Security diff review of all six changed source and test files in BargLabs/cejel PR #40, from 41a5e66469c67db4c520fa7e4a984fc965ae28c9 to 53e1bf38dad3231b76abe83d26f37413821c07ed. The review focused on whether D8 findings F-04/F-05 are closed at both Git sinks without adding a new bypass.

- Scan mode: branch_diff
- Target kind: git_diff
- Target ID: target_sha256_1d6e39abc982215ea041770d5c93def1e58a9d0004c801e219e4e6d4c02dba45
- Revision range: 41a5e66469c67db4c520fa7e4a984fc965ae28c9...53e1bf38dad3231b76abe83d26f37413821c07ed
- Snapshot digest: codex-security-snapshot/v1:sha256:b5bb2575d3ca569bb8f76ed8c4cf899e5350dbbc88511b4ea715e2c6d69d9282
- Inventory strategy: diff
- Included paths: .
- Excluded paths: none
- Runtime or test status: Focused regression suite passed 20 of 20 tests. Review workers independently observed checkout/helper 10 of 10 and freeze/helper 15 of 15 passes.
- Artifacts reviewed: Full Git diff and complete head contents for all six changed files, Generated repository threat model, Deterministic diff worklist and six full-file completion receipts, Focused Git transport boundary test output
- Scan context: The threat model was generated during this scan from immutable head revision 53e1bf38dad3231b76abe83d26f37413821c07ed. No candidate survived discovery, so candidate validation and attack-path phases were not applicable.

Limitations and exclusions:
- The valid GitHub HTTPS test uses a controlled Git executor rather than a live network clone; it verifies boundary flow and policy propagation without depending on GitHub availability.
- The scan is limited to the PR diff and directly supporting files; unrelated repository code was not audited.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | Static full-file diff review plus executable Node regression canaries and one real Git file-transport refusal. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The changed calibration scripts cross a privileged repository-reference-to-Git-process boundary. A candidate or frozen manifest may contain attacker-controlled repository identity fields, while Git transport helpers, credential helpers, ambient configuration, and checkout filters can execute with calibration-runner authority. The required invariant is that only the exact canonical GitHub HTTPS identity reaches Git and every invocation independently denies all non-HTTPS transports and ambient helper configuration.

### Assets

- Calibration runner process and filesystem authority
- GitHub workflow credentials and ambient Git credentials
- Integrity of frozen cohort commits, trees, manifests, and published calibration claims
- Confidentiality of private calibration evidence

### Trust Boundaries

- Candidate cohort document to git ls-remote
- Frozen manifest repository entry to git clone and checkout
- Ambient runner Git configuration and helper environment to each Git subprocess

### Attacker Capabilities

- Supply repository_id and repository.url values in candidate or frozen cohort data
- Choose a Git transport-helper syntax if repository.url is not bound before the sink
- Control repository content after a permitted clone

### Security Objectives

- Reject every repository reference except the exact canonical https://github.com/\<owner\>/\<repository\> identity before Git is invoked
- Deny every Git protocol except HTTPS at process scope
- Prevent terminal prompts, credential helpers, SSH helpers, proxy commands, system/global Git config, hooks, and LFS smudge from introducing executable behavior
- Retain immutable commit and tree verification after checkout

### Assumptions

- The runner, same-UID processes, installed git executable, node executable, and PATH are trusted operator infrastructure.
- Calibration executes on the documented POSIX runner surface.
- Repository data alone is hostile; a fully compromised host is out of scope.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Frozen cohort checkout and clone boundary | Untrusted manifest URL selecting a Git transport helper before immutable commit/tree verification | No issue found | The exact canonical GitHub HTTPS reference is derived before clone; clone, checkout, and rev-parse all receive the shared process policy. Hostile URL canaries prove the Git executor is not reached. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/finding_discovery_report.md |
| Candidate freeze and ls-remote boundary | Untrusted candidate URL selecting a Git transport helper before a frozen manifest exists | No issue found | The exact canonical GitHub HTTPS reference is derived before ls-remote and the sink receives the same deny-by-default process policy. All four hostile transport variants are refused before the Git runner. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/finding_discovery_report.md |
| Shared canonical repository reference and Git process policy | Protocol-policy bypass through ambient Git configuration, credential helpers, prompts, SSH/proxy helpers, or checkout-time filters | No issue found | The helper denies all protocols except HTTPS, clears helpers, strips ambient Git and SSH controls, suppresses prompts, supplies null system/global config and a fresh HOME, and skips LFS smudge. Focused tests passed 20/20, including a real Git file-transport refusal. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/finding_discovery_report.md |
