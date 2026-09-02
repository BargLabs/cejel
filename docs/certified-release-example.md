# Certified releases with GitHub build provenance

A Cejel certificate can be composed with GitHub's native build provenance so a buyer can
verify that a release artifact was built from the exact commit named in the certificate.

This pattern was run end to end in the public
[`BargLabs/cejel-certified-release-example`](https://github.com/BargLabs/cejel-certified-release-example)
repository. Its single
[`certified-release` job](https://github.com/BargLabs/cejel-certified-release-example/blob/7febf41b68a2e610aa15d20da64c780c35330bab/.github/workflows/certified-release.yml)
builds and tests a small binary, generates GitHub build provenance for that binary, and runs
the published `BargLabs/cejel/action@v1` action on the same checkout. The Cejel action resolved
to released version `0.4.6`; no local or internal engine copy was used.

GitHub's current documentation uses
[`actions/attest@v4`](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
for new build-provenance implementations. `actions/attest-build-provenance` remains available
for existing users, but its v4 line is a wrapper over `actions/attest`.

## Verified example

| Evidence | Value |
|---|---|
| Workflow run | [33629765764](https://github.com/BargLabs/cejel-certified-release-example/actions/runs/33629765764) |
| Source commit | `7febf41b68a2e610aa15d20da64c780c35330bab` |
| Artifact | `cejel-certified-release-example-linux-x86_64` |
| Artifact SHA-256 | `5c6b0f50678f92929a276af903baeee23aaba7e6963794500d93041b8367b420` |
| Cejel report SHA-256 | `4854fc5994e7463f0f23610623311f4fca779b4f53203bc7f54b5d8a715bd26e` |
| Cejel action version | `0.4.6` |

The run completed successfully. Independent verification of the downloaded binary constrained
GitHub's signed provenance to the repository, workflow, `refs/heads/main`, and the source commit
above. The downloaded `report.json` and `certificate.html` name that same commit, and Cejel's
unsigned report-binding statement names the report digest above.

The example is deliberately small. Its Cejel verdict is `at_risk` at `1.8/4.0`; the provenance
binding does not change, improve, or endorse that verdict. Here, “certified commit” means the
commit identified by the Cejel certificate, not a promise of a particular score. (The score moved
from `1.6/4.0` under 0.4.5 to `1.8/4.0` under 0.4.6 with no change to this example repository's
content between runs; this document does not investigate which 0.4.6 change moved it.)

## Buyer verification recipe

Install a current [GitHub CLI](https://cli.github.com/) with `gh attestation verify` support,
authenticate it, and have `jq` plus `sha256sum` available. On macOS, use `shasum -a 256` in
place of `sha256sum`.

```bash
repo=BargLabs/cejel-certified-release-example
run_id=33629765764
evidence_dir=verified-certified-release
expected_commit=7febf41b68a2e610aa15d20da64c780c35330bab
expected_artifact_sha256=5c6b0f50678f92929a276af903baeee23aaba7e6963794500d93041b8367b420
expected_report_sha256=4854fc5994e7463f0f23610623311f4fca779b4f53203bc7f54b5d8a715bd26e

gh run download "$run_id" --repo "$repo" --dir "$evidence_dir"

artifact="$evidence_dir/certified-release-binary/cejel-certified-release-example-linux-x86_64"
report="$evidence_dir/cejel-certificate/report.json"
certificate="$evidence_dir/cejel-certificate/certificate.html"
cejel_binding="$evidence_dir/cejel-certificate/attestation.json"

test "$(sha256sum "$artifact" | cut -d ' ' -f 1)" = "$expected_artifact_sha256"
test "$(sha256sum "$report" | cut -d ' ' -f 1)" = "$expected_report_sha256"

certified_commit=$(jq -er '.repo.headSha' "$report")
test "$certified_commit" = "$expected_commit"
grep -F "$certified_commit" "$certificate"

jq -e --arg commit "$certified_commit" --arg report_sha "$expected_report_sha256" '
  .predicate.tool == {"name":"cejel","version":"0.4.6"} and
  .predicate.repository.headSha == $commit and
  .predicate.report.sha256 == $report_sha
' "$cejel_binding"

gh attestation verify "$artifact" \
  --repo "$repo" \
  --signer-workflow BargLabs/cejel-certified-release-example/.github/workflows/certified-release.yml \
  --source-digest "$certified_commit" \
  --source-ref refs/heads/main
```

The last command verifies the artifact digest and GitHub signature while enforcing the exact
source identity recorded by Cejel. A non-zero exit from any command means the chain did not
verify and must not be treated as certified-release evidence.

## Claim boundary

This chain proves that the verified artifact was built by the named GitHub workflow from the
certified commit, and that the downloaded Cejel report and certificate identify that same commit.

It does **not** audit the build steps themselves or prove that the artifact is safe. Cejel does
not verify the GitHub provenance: GitHub signs it, and the buyer verifies it with GitHub CLI.
Conversely, GitHub does not validate Cejel's findings or verdict. We compose the two records; we
do not rebuild the artifact during buyer verification.
