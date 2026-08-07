# Free LLM Pack usage

> **Experimental pre-release:** the Free LLM Pack is under calibration. Treat its findings as
> review prompts, not release assurance, until its frozen untouched-cohort release gate reaches GO.

The Free LLM Pack is an opt-in, deterministic static scan for observable application-integrity and
evaluation-hygiene weaknesses in supported LLM application code. It runs alongside the ordinary
Cejel scan but produces a separate result.

## Availability

The Free LLM Pack is not yet exposed through the public CLI or package exports. In particular,
`--pack llm` is not a supported Cejel flag and the CLI rejects it. Do not expect the released CLI
to write `llm-report.json`, `llm-attestation.json`, or `llm-certificate.html`.

This page documents the alpha detector's coverage and assurance boundary, not a currently
supported invocation. A public CLI API requires a separate design and release decision.

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
  Applicability requires a recognized OpenAI/Anthropic or `generateText`/`streamText` call shape,
  or the complete authenticated OpenAI-compatible REST request shape documented in the support
  matrix; LangChain metadata alone does not establish v1 applicability or framework-specific coverage.
  The eight rules below use deliberately bounded, local patterns; an import alone never creates
  a finding.
- **Python:** `.py` files using observable official OpenAI or Anthropic SDK imports and call/response
  shapes, explicitly decorated or registered model-facing tools, and narrowly recognized
  provider-neutral model/agent bases. The alpha follows bounded same-file model-output lineage
  through local helpers for `LLM-IOH-001` and `LLM-VAL-001`; recognizes fixture-backed official-SDK,
  abstract-model, and explicitly unset tool-limit forms for `LLM-AGY-002`; and supports bounded
  Python evaluation provenance and self-judge paths. Evaluation rules require an import-resolved
  official SDK client or a conservatively named local model/judge wrapper; they abstain from
  unresolved SDK-shaped receivers. The pack does not infer arbitrary framework magic or
  cross-module data flow.

If no supported production integration is detected, the pack is `not_applicable`. During alpha,
an applicable repository is always `assessed_with_limitations`. Rule-level `not_applicable` versus
`insufficient_data` depends on whether that rule's required surface is observable; absence of a
finding is never proof that a control exists.

## Rule catalogue

| Rule ID | Alpha check |
|---|---|
| `LLM-IOH-001` | Supported model output or a registered model-facing tool input reaches a recognized dynamic-evaluation, shell/process, raw-HTML, or executable-script materialization sink. |
| `LLM-VAL-001` | Model-produced structured data reaches a recognized consequential action without observable fail-closed runtime validation. |
| `LLM-AGY-001` | A locally exposed JavaScript/TypeScript tool calls a recognized import-resolved Node filesystem or child-process mutation API without an observable fail-closed allowlist or human-approval gate. |
| `LLM-AGY-002` | A literal unconditional model/tool loop lacks an observable mandatory bound, or a recognized model-facing agent class explicitly leaves its tool-call limit unset. |
| `LLM-DAT-001` | A narrowly named secret-like environment value appears directly inside recognized model-call arguments. |
| `LLM-PRV-001` | A local evaluation path with a recognized direct or called-helper model invocation emits an aggregate or bounded case result without model lineage or prompt, policy, or evaluation-configuration lineage. |
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

When a future public API exposes the pack, it must not add criteria to the base rubric, alter the
base score or verdict, or convert pack findings into generic Cejel findings. For the same
repository and scanner version, the serialized base `report.json` must remain unchanged whether
or not the pack is selected.

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
