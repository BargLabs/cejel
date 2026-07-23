# Free LLM Pack usage

> **Experimental pre-release:** the Free LLM Pack is under calibration. Treat its findings as
> review prompts, not release assurance, until its frozen untouched-cohort release gate reaches GO.

The Free LLM Pack is an opt-in, deterministic static scan for observable application-integrity and
evaluation-hygiene weaknesses in supported LLM application code. It runs alongside the ordinary
Cejel scan but produces a separate result.

## Run the pack

From a development build or release that contains the pack:

```bash
./cejel scan . --pack llm
```

With the npm CLI:

```bash
npx @cejel/cejel scan . --pack llm
```

Use `--out <dir>` to change the default `.cejel` output directory. `--quiet` suppresses both
terminal summaries but still writes every artifact.

The ordinary scan writes its usual `report.json`, `attestation.json`, `certificate.html`, badge,
and summary files. Selecting the pack adds:

- `llm-report.json` — the strict, machine-readable pack result, including status, coverage,
  limitations, rule results, findings, evidence locations, a digest of the pack's source snapshot,
  and a digest of the base report;
- `llm-attestation.json` — an in-toto statement binding the exact `llm-report.json` bytes to the
  pack version, generation time, and base-report digest; and
- `llm-certificate.html` — a self-contained rendering of the pack result.

The pack artifact and attestation say `assurance.status: "unsigned"` and
`issuer: "self-generated"`. Cejel binds the files together but is not an independent signer.

Verify the pack artifact binding with:

```bash
./cejel verify .cejel/llm-report.json .cejel/llm-attestation.json
```

or:

```bash
npx @cejel/cejel verify .cejel/llm-report.json .cejel/llm-attestation.json
```

Successful verification confirms the artifact schema and digest, pack identity and version,
generation time, input-source digest, and base-report digest binding. It does not verify a
signature or signer identity. The CLI refuses to emit the pair if supported source changes between
the base and pack reads.

## Current alpha coverage

The detector reads tracked local source when scanning a Git repository, with a local filesystem
fallback outside Git. It excludes dependency, generated, build, coverage, and similar trees and
reads supported source files no larger than 512 KB in the local fallback (tracked Git source is
subject to the detector's 1 MB read ceiling). Native finding rules exclude tests, fixtures,
and examples; rules that infer missing action or evaluation controls also exclude documentation
before making an absence finding.

Current native source coverage is:

- **JavaScript/TypeScript:** `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.
  Integration metadata can record OpenAI, Anthropic, Vercel AI SDK, and LangChain imports.
  Applicability requires a recognized OpenAI/Anthropic or `generateText`/`streamText` call shape;
  LangChain metadata alone does not establish v1 applicability or framework-specific coverage.
  The eight rules below use deliberately bounded, local patterns; an import alone never creates
  a finding.
- **Python:** `.py` files using observable official OpenAI or Anthropic SDK imports and call/response
  shapes. The alpha applies `LLM-IOH-001`, `LLM-VAL-001`, `LLM-AGY-002`, `LLM-DAT-001`, and
  `LLM-EVL-002` to narrowly fixture-backed Python shapes. Python action validation is limited to an
  `args_schema`-bound local `_run` path, and Python self-judge detection is limited to a complete
  local configured producer/judge class. `LLM-AGY-001`, `LLM-PRV-001`, and `LLM-EVL-001` still
  require the supported local JavaScript or TypeScript paths.

If no supported production integration is detected, the pack is `not_applicable`. During alpha,
an applicable repository is always `assessed_with_limitations`. Rule-level `not_applicable` versus
`insufficient_data` depends on whether that rule's required surface is observable; absence of a
finding is never proof that a control exists.

## Rule catalogue

| Rule ID | Alpha check |
|---|---|
| `LLM-IOH-001` | Direct supported model output reaches a recognized dynamic-evaluation, shell/process, or raw-HTML sink. |
| `LLM-VAL-001` | A model-produced structured field reaches a named consequential JavaScript/TypeScript dispatcher without observable fail-closed runtime validation. |
| `LLM-AGY-001` | A locally exposed JavaScript/TypeScript tool calls a recognized import-resolved Node filesystem or child-process mutation API without an observable fail-closed allowlist or human-approval gate. |
| `LLM-AGY-002` | A literal unconditional loop has a complete local body containing a recognized model call. |
| `LLM-DAT-001` | A narrowly named secret-like environment value appears directly inside recognized model-call arguments. |
| `LLM-PRV-001` | A local evaluation path with a recognized model invocation emits an aggregate without model lineage or prompt, policy, or evaluation-configuration lineage. |
| `LLM-EVL-001` | A local evaluation path with a recognized model invocation emits an aggregate without an eligible-case denominator (including a directly traced local alias) or raw case results. |
| `LLM-EVL-002` | The sole local model-assisted judge resolves to the same model as the producer, with no recognized independent adjudicator. |

Every finding carries a stable rule ID, severity, detector confidence, and local file-and-line
evidence. These are static source-pattern checks, not whole-program data-flow analysis.

## Offline and score-isolation guarantees

The pack does not:

- call a model or provider;
- execute the application, prompts, tools, or evaluations;
- send source, prompts, labels, or findings over the network; or
- inspect provider-side configuration, policies, logs, or middleware that is absent locally.

`--pack llm` is additive. It does not add criteria to the base rubric, alter the base score or
verdict, or convert pack findings into generic Cejel findings. For the same repository and scanner
version, the serialized base `report.json` is unchanged whether or not the pack is selected.

## Claim and assurance boundary

The Free LLM Pack identifies observable static weaknesses that can allow unsupported model output
to pass into consequential application paths. It does **not**:

- measure a model's general hallucination rate or factual accuracy;
- prove that an LLM, agent, RAG system, application, or repository is safe;
- prevent hallucinations, prompt injection, data leakage, or excessive agency;
- provide runtime enforcement, monitoring, or a human-approval service;
- claim complete SDK, framework, language, provider-version, or OWASP coverage; or
- turn an unsigned self-generated statement into independent assurance.

Calibration results, fixture-backed syntax signatures, separately observed package versions,
measured recall, and incorrect-finding rates must be published with their denominators and
limitations before this pack can leave experimental status. A synthetic fixture does not establish
SDK-version compatibility. Until then, use the output for review and correction, not as a universal
safety certificate.
