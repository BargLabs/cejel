# Free LLM Pack v1 support and claims

- Applies to candidate: `cejel-free-llm-rules-v1.1-2026-07-23`
- Status: implemented experimental alpha; v1.2 calibration is an evidence-integrity NO-GO and
  v1.3 has not yet produced a release measurement

## Recognized syntax inventory

The matrix inventories bounded syntax recognized by the implemented alpha—not an aspirational
framework or package-version claim. A package name or import is only an applicability hint; it
never produces a finding without rule-specific source evidence. The normative per-rule claim
surface is the positive/negative structural pair in
`src/packs/llm/__tests__/fixture-coverage-manifest.json`; a syntax recognized by one rule does not
imply that every rule supports that syntax.

| Observable surface | JavaScript/TypeScript alpha | Python alpha |
|---|---|---|
| OpenAI call/output syntax | `.responses.create`, `.chat.completions.create`, `.output_text`, and `choices[].message.content` bounded patterns; authenticated JSON `POST` calls to an OpenAI-compatible `/chat/completions`, `/responses`, or `/messages` endpoint are recognized only when the request contains a model plus messages/input/prompt | Same bounded call/output shapes when an official `openai` import is present |
| Anthropic call/output syntax | `.messages.create` and `content[].text` bounded patterns when the official SDK import or call is visible | Same bounded call/output shapes when an official `anthropic` import is present |
| Vercel AI SDK | `generateText` and `streamText` calls; local `tool`/`defineTool`/`createTool` declarations for the action rule | Not implemented |
| Consequential actions | Direct local JavaScript/TypeScript JSON parse, named dispatch, tool exposure, and fail-closed gate patterns | Narrow `LLM-VAL-001` support for an `args_schema`-bound local `_run` dispatcher with observable validation; `LLM-AGY-001` is not implemented |
| Evaluation hygiene | Direct local JavaScript/TypeScript model invocation, bounded called-helper invocation, aggregate or per-case result, JSON emitter/return, lineage, denominator, and sole-judge patterns; a complete Flowise evaluation request/result path is recognized | Narrow configured producer/judge self-judge support for `LLM-EVL-002`; provenance and denominator rules are not implemented |
| LangChain / LangGraph | Import is recorded as metadata only; it does not establish v1 applicability or a framework-specific finding claim | Import establishes no Python rule coverage |
| Raw provider HTTP, local-model SDKs, external evaluators | Only the authenticated OpenAI-compatible request shape and complete local Flowise evaluation path above are implemented; all other raw HTTP, local-model SDK, and external-evaluator paths abstain | Not implemented; Cejel abstains or reports a limitation |

Initial deep detector support is limited to JavaScript/TypeScript and Python. Files in other Cejel-
recognized languages can establish repository context but cannot receive native Free LLM rule
findings in v1. A repository whose relevant integration is solely in another language receives an
explicit pack coverage limitation, not a clean result.

Structural support is syntax-signature- and fixture-manifest-versioned. Synthetic fixtures contain
source shapes, not installed dependency graphs, and therefore establish **no package or SDK version
claim**. A package version may be named only when it is separately observed at an immutable cohort
commit and its result is included in denominated calibration evidence. Even then, the measured
claim applies to the observed syntax and version combination, not automatically to the entire SDK
major. Unqualified phrases such as "supports all OpenAI applications" or "supports LangChain" are
prohibited.

## Synthetic fixture evidence

The machine-readable fixture manifest maps every enabled rule to at least one exact structural
signature and to both a positive and negative fixture. CI verifies that all eight enabled rule IDs
appear exactly once, every fixture exists, the positive produces the declared rule finding, and the
negative does not. Some rules have additional OpenAI or Anthropic syntax pairs where the alpha
documentation claims both shapes.

These fixtures prove deterministic implementation behavior on synthetic source only. They are not
calibration examples, customer repositories, package compatibility tests, or evidence of recall on
real applications.

## Current calibration decision

The frozen v1.2 cycle executed 24 golden and 24 untouched repositories. It ended in an
[evidence-integrity NO-GO](../../calibration/llm/reviews/v1.2-integrity-no-go-2026-07-23.md): the
golden run bound a required compatibility record by hash but did not retain its exact bytes in a
downloaded artifact. The untouched run emitted no findings, but TP, FP, FN, TN, precision, recall,
and false-positive rate are all **not estimable** because the measurement protocol correctly
stopped before calculation. This cycle supports no measured detector-performance claim.

The v1.3 candidate recognizes two previously missed golden provenance paths. A local regression over
the same 24 golden repositories emits five exactly adjudicable findings, corresponding to five of
the six known positive golden opportunities, with no additional findings. This is development
evidence only—not an untouched result, release metric, or GO decision.

## Repository and execution boundary

The alpha pack reads tracked/local JavaScript, TypeScript, and Python source within its declared
size boundary. Manifest, configuration, and non-source evaluation-artifact inspection is deferred.
It does not:

- call a model or model provider;
- execute the target application or its prompts;
- send source, prompts, labels, or findings over the network;
- inspect provider-side prompts, policies, logs, or defaults that are absent locally;
- infer runtime identity hidden behind an alias;
- operate as a runtime firewall, proxy, guardrail, or red-team service; or
- treat an unobserved control as absent when external middleware may supply it.

Generated, vendored, dependency, fixture, snapshot, and example paths are excluded by default.
Path classification is detector-defined in this version. There is no repository override surface;
unusual layouts must be reported as a limitation or correction request.

## Permitted claims

The primary public claim is:

> Cejel identifies observable application-integrity and evaluation-hygiene weaknesses that can
> allow unsupported model output to pass into consequential paths.

Once the release gate passes, narrower claims may state that the named pack version:

- scans supported JavaScript/TypeScript and Python integration patterns locally and offline;
- emits findings with repository evidence, stable rule IDs, severity, and detection confidence;
- distinguishes `not_applicable` from `insufficient_data`;
- reports measured finding recall and incorrect-finding rates on the named frozen cohort, with
  denominators and exclusions; and
- ingests attributed external SARIF without representing it as a native Cejel detection.

Measured claims must name the detector version, cohort, eligible count, reviewed-finding count,
review procedure, and correction record. Results from the golden set must not be presented as
untouched validation.

## Prohibited claims

No CLI, report, certificate, badge, website, sales material, or launch post may claim or imply that
the Free LLM Pack:

- measures a model's general hallucination rate;
- proves an LLM, agent, RAG system, application, or repository is safe;
- prevents or eliminates hallucinations, prompt injection, data leakage, or excessive agency;
- tests the factual accuracy, truthfulness, alignment, or intelligence of model responses;
- provides runtime enforcement, continuous monitoring, or a human approval service;
- covers all languages, SDKs, agent frameworks, provider versions, OWASP LLM risks, or application
  paths;
- certifies undeclared provider-side configuration or behavior;
- converts an external scanner finding into a Cejel-validated result merely by ingesting it; or
- transfers a measured cohort result to every application or future detector version.

The phrases "hallucination detector," "hallucination rate," "AI safety certificate," "OWASP LLM
Top 10 compliant," and "secure LLM application" are prohibited for this pack unless surrounded by
text that unambiguously rejects the claim; avoid them in headlines even as disclaimers.

## Current Cejel integration constraints

The public repository already provides a tracked file-inventory collector and an additive
`WitanDomainSignalCollector` seam. The Free LLM v1 implementation may reuse that inventory boundary,
but its result is a separate pack artifact and certificate section rather than a new set of generic
Witan score criteria. Keeping pack findings out of A1-B6 prevents the opt-in pack from repricing the
base score.

Three small contract gaps must be resolved before public implementation:

1. Native `WitanFindingSchema` has severity and evidence but no stable rule ID or confidence, so the
   pack needs its own strict finding/result schema.
2. `WitanEvidenceKindSchema` has no LLM-specific kind; v1 can reuse the compatible evidence-pointer
   shape with `artifact` without inventing a new kind.
3. The sealed public scan path intentionally exposes no domain collectors, so explicit `--pack llm`
   selection needs a separate opt-in path while the no-pack path remains unchanged.

These are prerequisite interface decisions, not permission to change default scoring or extend the
closed `WitanCriterionIdSchema`. The preferred shape is a strict pack-owned result schema plus a
separate rendering section, with only the minimum CLI selection and artifact plumbing added
centrally. A no-pack scan of the same tree and scanner version must remain byte-for-byte unchanged.

## Release-language checklist

Before release, confirm that public wording:

- names the Free LLM Pack version;
- names JavaScript/TypeScript and Python plus fixture-backed syntax signatures;
- names package versions only when separately observed and measured at immutable cohort commits;
- says static and local/offline;
- distinguishes observed weakness, verified control, `not_applicable`, and `insufficient_data`;
- links every finding to evidence;
- publishes untouched-cohort denominators and limitations;
- links the correction record; and
- does not summarize a pack result as a universal model or application score.
