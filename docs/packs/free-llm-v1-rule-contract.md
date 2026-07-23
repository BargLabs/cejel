# Free LLM Pack v1 rule contract

- Status: v1.1 candidate; requires fresh calibration before a release claim
- Contract version: `cejel-free-llm-rules-v1.1-2026-07-23`
- Product boundary: static, deterministic, local/offline application-integrity checks
- Governing decision: ADR-0011

This catalogue freezes the identifiers and operational meaning of the first Free LLM Pack rules.
An implementation may improve how it recognizes the evidence described here without renaming a
rule. A change to a rule's applicability, defect definition, required evidence, or severity is a
contract change and requires a new contract version and a calibration delta.

## Common contract

### Finding threshold

A finding requires all of the following:

1. a supported language and recognizable LLM integration;
2. the rule-specific source, path, and sink or missing-control evidence;
3. a repository-relative file path plus a measured line for each decisive positive match;
4. a deterministic explanation of the observed path or configuration; and
5. no applicable exclusion below.

File-level absence findings may use `line: null`, but must point to the inspected manifest,
evaluation entry point, or LLM call that made the rule applicable. A detector must never invent
line 1. When the implementation cannot establish a required link, it abstains for that rule; it
does not infer a finding from package presence, variable names alone, or a missing file name.

### Applicability states

- `applicable`: a supported LLM call, agent/tool registration, or evaluation harness activates the
  rule and the detector has enough local source to decide.
- `not_applicable`: the required surface does not exist, such as no side-effecting tool for a tool-
  governance rule. This is excluded from scoring and is not a pass.
- `insufficient_data`: a relevant surface exists but unsupported language, dynamic construction,
  generated code, missing local configuration, or unresolved inter-file flow prevents a decision.
  This is excluded from scoring and appears as a coverage limitation.
- `finding`: all rule evidence requirements are satisfied.
- `verified_control`: the relevant surface exists and a recognized control satisfies the negative
  fixture contract. This is positive evidence, not a universal safety claim.

A repository with no detectable LLM integration is pack-level `not_applicable`. Selecting no pack
must leave the default Cejel result unchanged.

The v1 pack produces a separate pack artifact and certificate section. Its findings and coverage
states do not become generic Witan criteria, do not change A1-B6, and do not alter the base Cejel
score. Any future combined score requires a separate decision and calibration protocol.

### Pack artifact status and coverage

The machine-readable pack artifact records:

- `packId: "free-llm"`, contract version, detector version, generation time, and repository
  identity/commit;
- pack status: `assessed`, `assessed_with_limitations`, or `not_applicable`;
- the detected language and fixture-backed SDK signatures;
- a result for each of the eight rule IDs using `finding`, `verified_control`, `not_applicable`, or
  `insufficient_data`;
- zero or more findings with rule ID, severity, confidence, summary, and decisive evidence;
- coverage limitations and the excluded/unsupported paths that caused them; and
- a digest linking the pack artifact to the base Cejel report when both are emitted, plus a digest
  of the supported source snapshot used by the pack.

`assessed` means every applicable detected LLM surface was within v1's declared language/SDK and
flow boundary; it does not mean no weakness exists. `assessed_with_limitations` is required when at
least one relevant surface or rule is `insufficient_data`. `not_applicable` is required when no
supported LLM integration is detected. The artifact has no overall safety verdict, generic trust
score, or hallucination score.

### Severity and confidence are independent

Severity describes the consequence if the observed weakness is exercised. Confidence describes
how strongly the static evidence supports the finding.

| Field | Values | Meaning |
|---|---|---|
| Severity | `critical`, `warning`, `info` | Potential impact of the observed weakness |
| Confidence | `high`, `medium`, `low` | Certainty that the observed code has the stated weakness |

Public v1 findings require `high` or `medium` confidence. `low`-confidence matches are candidate
evidence for calibration only and must not affect a certificate. Severity must never be raised to
compensate for weak confidence.

The current native Cejel `WitanFinding` schema carries severity but neither a rule ID nor confidence.
The separate pack artifact must preserve the stable rule ID and confidence in its machine-readable
finding schema. Folding confidence into severity or placing it only in prose is prohibited. The
pack may reuse the compatible `WitanEvidencePointer` shape with `kind: artifact`; it must not add
LLM criterion IDs to the generic Witan rubric merely to carry these fields.

## Frozen v1 rules

### `LLM-IOH-001` — Model output reaches a code or command sink

**Defect.** Text derived from an LLM response reaches dynamic code evaluation, an operating-system
command, a raw SQL execution surface, or an executable template/HTML sink without a recognized
intervening constraint appropriate to that sink.

**Required evidence.** A supported LLM response accessor; a same-function or deterministically
resolved inter-procedural data path; the consequential sink; and the absence of the applicable
recognized control on that path. The finding points to the sink line and names the response source.

**Recognized controls.** Fixed command plus an argument array after an allowlist check; parameterized
query APIs with the model value only in bound parameters; parsing to a closed schema before mapping
to a fixed operation; or HTML escaping/sanitization at the final render boundary.

**Exclusions.** Displaying model text as inert terminal/plain text; writing it to a non-executable
file; examples, test fixtures, snapshots, vendored/generated code; parameterized SQL; shell commands
that are constant and do not contain model-derived data; and sanitizer names without a supported
sanitizer signature.

**Applicability.** `not_applicable` when no supported sink consumes model-derived output;
`insufficient_data` when aliases, callbacks, reflection, or unsupported wrappers obscure the path.

**Default severity/confidence.** `critical` for code, shell, or raw SQL execution; `warning` for
executable HTML/template contexts. Confidence is `high` for a direct path and `medium` for a fully
resolved supported inter-procedural path.

### `LLM-VAL-001` — Consequential structured action lacks validation

**Defect.** Model-produced structured data selects or parameterizes a consequential action without
successful validation against a closed schema or equivalent typed allowlist before dispatch.

**Required evidence.** A model response parsed or asserted as structured data; a direct path from at
least one model-controlled field to an action dispatcher or side-effecting tool; and no recognized
validation on every path between them. The evidence points to the dispatch line and identifies the
unvalidated field.

**Recognized controls.** Runtime validation that fails closed, such as a closed Zod/JSON Schema/
Pydantic model with checked parse result; an exhaustive enum/allowlist mapping to fixed operations;
or provider structured-output enforcement followed by local validation. TypeScript types, casts,
prompt instructions, and JSON parsing alone are not runtime validation.

**Exclusions.** Read-only rendering or summarization; validated data later transformed without new
model input; test/example/generated code; and actions whose operation and arguments are both fixed
by application code.

**Applicability.** `not_applicable` without a consequential structured action; `insufficient_data`
when the validator or dispatcher is dynamically imported, externally configured, or unsupported.

**Default severity/confidence.** `critical` for execution, deployment, money movement, access-control
change, or destructive write; otherwise `warning`. Direct local flow is `high`; fully resolved
supported inter-procedural flow is `medium`.

### `LLM-AGY-001` — Side-effecting tool lacks an authority boundary

**Defect.** An LLM or agent can invoke a recognized side-effecting tool while the inspected path
contains neither a restrictive allowlist/permission check nor an explicit human approval gate.

**Required evidence.** The tool definition or registration; an import-resolved, independently
observable side-effecting API; the model/agent exposure point; and a complete inspected path showing
no recognized gate before the side effect. The alpha detector recognizes selected Node filesystem
and child-process mutation APIs. Unbound business-operation names such as `publish` or `sendEmail`
do not establish a side effect on their own. The finding points to registration or dispatch and
identifies the side effect.

**Recognized controls.** A deny-by-default allowlist evaluated at dispatch; capability-scoped
credentials plus an explicit operation allowlist; or a blocking human-approval state whose positive
decision is required before execution. Logging, post-action notification, a confirmation prompt to
the model, and a descriptive tool name are not authority boundaries.

**Exclusions.** Read-only retrieval; pure calculations; tools available only in tests; unreachable
tool declarations; and tool registries whose effective permissions are external or dynamically
assembled, which are `insufficient_data` rather than findings.

**Applicability.** `not_applicable` when no supported side-effecting tool is exposed. Unsupported
custom policy middleware or remotely supplied policy produces `insufficient_data`.

**Default severity/confidence.** `critical` for money movement, deployment, credential/access change,
external communication, or destructive mutation; otherwise `warning`. A direct local registration-
to-dispatch path is `high`; a resolved framework middleware path is `medium`.

### `LLM-AGY-002` — Agent execution has no observable bound

**Defect.** A model/tool execution cycle can repeat without a detectable maximum step count,
deadline/timeout, cancellation condition, or budget enforced outside the model.

**Required evidence.** A supported agent-loop API with a known unbounded configuration, or an
explicit loop containing an LLM/tool call; and no application-enforced terminating bound on all
paths. Evidence points to the loop or agent invocation.

**Recognized controls.** A finite numeric step/iteration limit; an enforced deadline or abort
signal; or an application-side budget whose exhaustion exits before another model/tool call. A
prompt asking the model to stop and a break dependent only on model output do not qualify.

**Exclusions.** One-shot model calls; bounded retry libraries; loops over a finite materialized
collection; streaming-token iteration; tests/examples; and framework agents whose documented
version has a finite default. Unknown framework defaults yield `insufficient_data`.

**Applicability.** `not_applicable` without an agent or repeated model/tool cycle; dynamic limits
that cannot be resolved locally yield `insufficient_data`.

**Default severity/confidence.** `warning`; `high` for an explicit unbounded loop, `medium` for a
supported framework invocation whose effective configuration is locally resolvable.

### `LLM-DAT-001` — Secret-bearing value enters model content or application logs

**Defect.** A value read from a recognized secret-bearing source flows into model message/content,
retrieval context sent to a provider, or application logging as data rather than authentication.

**Required evidence.** A recognized secret source; a direct or supported resolved data path; and a
model-content or log sink. Evidence points to the sink and identifies the source without reproducing
the secret value.

**Recognized secret sources.** Environment/config/secret-manager keys with established credential
semantics (`PASSWORD`, `TOKEN`, `SECRET`, `API_KEY`, `PRIVATE_KEY`, authorization/cookie values), or
literal credentials already classified by Cejel's core secret detector. Names such as `userData`,
`context`, `record`, or `customer` alone do not establish sensitive data.

**Recognized controls.** Removal or irreversible redaction of the secret-bearing field before the
sink, verified on the observed path. Provider transport encryption, a privacy statement, or a
generic `sanitize` function without a supported redaction contract is not sufficient evidence.

**Exclusions.** Credentials passed only to an SDK client constructor or authorization header;
secret names without values in examples; synthetic fixtures; test/generated/vendor code; hashed or
redacted values where the raw value cannot reach the sink.

**Applicability.** `not_applicable` when no recognized secret source reaches an LLM or log surface;
potential PII or regulated data without a declared schema is `insufficient_data`, not a finding.

**Default severity/confidence.** `critical` for raw credentials/private keys; otherwise `warning`.
Direct flow is `high`; supported resolved inter-procedural flow is `medium`.

### `LLM-PRV-001` — Declared evaluation lacks reproducible system provenance

**Defect.** A repository computes or publishes an LLM evaluation result but the evaluation entry
point does not bind the result to a resolvable model identifier and the prompt/policy or evaluation
configuration used for that run.

**Required evidence.** An identifiable evaluation runner with a recognized local model invocation
before the result emission; evidence that it records a metric/result; and absence of both required
lineage elements in the result artifact or an adjacent versioned manifest referenced by it.
Recognized invocations include import-resolved supported SDK calls, an authenticated JSON `POST` to
an OpenAI-compatible model endpoint, and a narrowly identified local Flowise evaluation request.
A local helper may carry the invocation only when the result-producing scope observably calls that
helper before emitting the result. A model call elsewhere in the repository does not establish that
an unrelated metrics writer is an LLM evaluation. Evidence points to the evaluation entry point or
result schema.

**Minimum recognized lineage.** A non-floating model/provider identifier when observable, plus a
content digest, immutable repository reference, or versioned artifact reference for the applicable
system prompt/policy and evaluation configuration. A repository commit alone is positive evidence
only when the result binds that commit and the referenced files to the run.

**Exclusions.** Applications with no declared evaluation result; generic HTTP requests that lack
the complete recognized endpoint, authentication, request-body, and evaluation markers; uncalled
model helpers; exploratory notebooks that make no published comparison or quality claim; provider
versions that are not observable, which must be reported as a limitation rather than fabricated;
test fixtures and documentation examples.

**Applicability.** `not_applicable` without an evaluation/result surface. Dynamic or external result
lineage that cannot be inspected locally yields `insufficient_data`.

**Default severity/confidence.** `info`; `high` only when the complete local result-writing path is
inspected, otherwise `medium`. This rule does not assert that the evaluated model is inaccurate.

### `LLM-EVL-001` — Evaluation result omits its eligible denominator or exclusions

**Defect.** An LLM evaluation publishes an aggregate rate, percentage, or average while failing to
retain the eligible-case denominator, or silently discarding errors, refusals, abstentions, or
excluded cases from the reported population.

**Required evidence.** A recognized local model invocation before the result emission; the case
iteration; outcome classification/filtering; aggregate calculation; and emitted result. A model call
elsewhere in the repository does not establish evaluation applicability. A denominator finding
requires proof that only the aggregate is emitted. An exclusion finding requires a resolved path
showing a relevant outcome is filtered or caught without its count appearing in the result.

**Recognized controls.** Result artifacts carrying eligible total and per-outcome counts, including
errors/refusals/abstentions/exclusions where those outcomes exist; or raw case-level results from
which those denominators are reproducibly derived. A locally assigned alias is accepted when its
lineage to the same eligible collection's `.length` denominator is directly observable.

**Exclusions.** Non-evaluation telemetry; counts without a rate/average claim; unit tests asserting a
single known result; exploratory scripts that do not emit or publish an aggregate; and external
evaluation platforms whose raw result schema is unavailable locally.

**Applicability.** `not_applicable` without an aggregate LLM evaluation result. Unresolved external
reporters and dynamically selected filters yield `insufficient_data`.

**Default severity/confidence.** `warning`; `high` for a complete local aggregation/emission path and
`medium` for a fully resolved supported helper chain.

### `LLM-EVL-002` — Evaluated system is its own sole judge

**Defect.** The same configured model system that produces evaluated responses is the only judge of
their quality, with no independent rule, evidence check, human adjudication path, or distinct judge
configuration.

**Required evidence.** The producer model/configuration; judge model/configuration; equality of the
resolved configured system identity; and the absence of any additional adjudicator on the result-
acceptance path. Evidence points to the judge invocation and identifies the shared configuration.

**Recognized independent checks.** Deterministic exact/schema/property checks appropriate to the
declared criterion; evidence-source verification; recorded human review/adjudication; or a distinct
judge identity/configuration whose role and version are retained. A different prompt to the same
configured model is not, by itself, independent.

**Exclusions.** Self-critique used only to improve a draft when it is not the evaluation result;
multi-judge designs with a recorded independent decision path; deterministic grading; tests and
examples; unresolved model aliases or provider-managed versions, which yield `insufficient_data`.

**Applicability.** `not_applicable` without model-assisted evaluation. If producer or judge identity
cannot be resolved, return `insufficient_data` rather than assuming equality.

**Default severity/confidence.** `warning`; only `high` confidence ships in v1 because model identity
and the absence of another adjudicator must both be resolved.

## Cross-rule behavior

- One code path may produce multiple findings only when each rule identifies a distinct missing
  control. For example, raw model output reaching `exec` can trigger `LLM-IOH-001`; it does not also
  trigger `LLM-VAL-001` unless structured model fields independently dispatch an action.
- Findings deduplicate by rule ID plus decisive repository path and line.
- The pack reports the strongest supported severity for a duplicated path and retains every
  evidence pointer used to reach it.
- Negative evidence suppresses only the rule/path it controls. A validator on one dispatch path
  does not verify sibling paths.
- SARIF findings from another tool remain attributed external findings. They do not count as native
  Cejel rule detections or calibration true positives unless the calibration protocol labels and
  adjudicates them separately.

## Versioning rule

The eight IDs above are stable within v1. Message edits and added SDK signatures do not require a
new ID if the defect, required evidence, exclusions, and severity remain unchanged. Any expansion
from direct/resolved flows to heuristic semantic inference, any new default severity, or any changed
applicability condition requires a new contract version and fresh untouched-cohort measurement.
