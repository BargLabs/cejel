# CI heal-log to Cejel ingest mapping

This is the first documented consumer of the generic ingest v1 contract. Both committed fixtures
are synthetic and contain no real counterparty data:

- input: [`fixtures/heal-log.synthetic.json`](fixtures/heal-log.synthetic.json)
- mapped v1 ingest: [`fixtures/heal-log-ingest-v1.synthetic.json`](fixtures/heal-log-ingest-v1.synthetic.json)

**The certificate records what was healed; it does not validate the healing.**

## Mapping

One heal-log file becomes one generic v1 signal. Each attempt becomes one finding.

| Heal-log value | Generic v1 value |
| --- | --- |
| producer | root `tool`; the synthetic example uses `synthetic-ci-heal-log` |
| all attempts | one `signals[0]` in `B6`, the nearest process-trust attribution namespace |
| record-only intent | `signals[0].weight = 0`; no score adjustment |
| `outcome` | `ruleId = ci-heal/<kebab-case outcome>` |
| record classification | `severity = info`; this means recorded information, not a verified success |
| `attempt`, `exitCode`, `matchedFailurePattern`, `actionTaken`, `outcome` | an explicit, ordered `message` beginning `RECORDED attempt N` |
| attempt identity | `location` fragment ending `#attempt-N` |

`B6` is an attribution location, not a claim that privileged-operation human gating passed. The
zero weight is load-bearing. A future mapping that intends a score effect is a different contract
and needs separate evidence and review.

If any required per-attempt value is absent, the mapper must reject that record. It must not infer
an outcome or emit a default pass/fail. Native `insufficient_data` remains `insufficient_data`
after this record-only signal is consumed.

## Worked example

The synthetic input contains two attempts and maps to exactly **one signal with two findings**.
After ingest, the relevant `report.json` section is:

```json
{
  "consumedSignals": [
    {
      "source": "synthetic-ci-heal-log",
      "provenance": "operator_supplied",
      "dimension": "B6",
      "findingCount": 2,
      "severityBreakdown": {
        "critical": 0,
        "warning": 0,
        "info": 2
      },
      "nativeScore": 0,
      "scoreAdjustment": 0,
      "adjustedScore": 0,
      "findings": [
        {
          "ruleId": "ci-heal/healed",
          "severity": "info",
          "message": "RECORDED attempt 1: exitCode=1; matchedFailurePattern=\"lockfile is out of date\"; actionTaken=\"regenerated lockfile from committed manifests\"; outcome=\"healed\".",
          "location": "synthetic-ci/heal-log.json#attempt-1"
        },
        {
          "ruleId": "ci-heal/passed-after-heal",
          "severity": "info",
          "message": "RECORDED attempt 2: exitCode=0; matchedFailurePattern=\"none\"; actionTaken=\"no further action\"; outcome=\"passed_after_heal\".",
          "location": "synthetic-ci/heal-log.json#attempt-2"
        }
      ]
    }
  ]
}
```

The HTML certificate's **External findings** section renders both messages as `RECORDED` events.
On the no-native-evidence test fixture, B6 remains `insufficient_data`, proving that the mapping
does not manufacture a pass or fail.
