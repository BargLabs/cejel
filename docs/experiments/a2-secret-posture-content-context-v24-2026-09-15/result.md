# A2 secret-posture content-context rubric v24 paired rescore — result

Protocol decision: ________ (left blank by the harness: recorded by the operator after the hand review of every new and lost critical below)

- Mechanical bands all within preregistered limits: NO
- Hand review pending: no
- Preregistration commit: `ef253a8e64e70e27c9c440bc5b3cf02167c81a4e`
- Execution commit: `0ca3a9874f9c9a6ac79b79f59d61f3f981888a3a`
- Baseline rubric: `witan-rubric-v22-prospective-2026-08-10`; candidate rubric: `witan-rubric-v24-prospective-2026-09-15`
- Fixed generatedAt: `2026-10-01T00:00:00.000Z`
- Corpus: blob `d563653c6f1d7ee733693c0e9612fa52c323b162`, SHA-256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`
- Private row commit: `be2b4325a317fdfaafb68abf9c920a7d6242a830`
- Acquisition: git fetch --depth=1 of the corpus-pinned commit over https, detached checkout; git clone --local --no-hardlinks --no-checkout of the operator-supplied source, detached checkout of the pinned commit
- Completed rows: 24/24; errors: 0; retried rows: 0

The public default remains `witan-rubric-v17-2026-07-24`. This result neither promotes v24 nor rewrites any historical report.

| Band | Measured | Preregistered limit | Within limit |
|---|---:|---:|---|
| all 24 rows complete with no error row | 24 | 24 of 24 | yes |
| rows changing any criterion other than A2 (implementation failure) | 0 | ≤ 0 | yes |
| rows gaining a new critical committed-secret finding that is not a genuine committed credential | 0 | ≤ 0 | yes |
| rows changing A2 score, status, or secret_scan finding count/kind | 4 | ≤ 8 | yes |
| rows changing overall, code-trust or process-trust score | 4 | ≤ 4 | yes |
| rows changing comparative board placement | 8 | ≤ 2 | NO |
| rows changing verdict | 0 | ≤ 1 | yes |
| rows losing a committed-secret finding v22 reported that hand review confirms is genuine | 0 | ≤ 0 | yes |

| Repository | A2 score/status | secret_scan count/kind | Overall | Code | Process | Verdict | Coverage | Placement | Non-A2 |
|---|---|---|---:|---:|---:|---|---|---|---|
| react | 1.4/critical to 1.4/critical | 1 flag to 1 flag | 3 to 3 | 2.1 to 2.1 | 3.9 to 3.9 | conditional to conditional | code_trust 5/5; process_trust 3/6 to code_trust 5/5; process_trust 3/6 | 9 to 8 | identical |
| vue | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | conditional to conditional | code_trust 4/5; process_trust 3/6 to code_trust 4/5; process_trust 3/6 | 11 to 10 | identical |
| svelte | 3.6/verified to 3.6/verified | 0 no-finding to 0 no-finding | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | conditional to conditional | code_trust 4/5; process_trust 3/6 to code_trust 4/5; process_trust 3/6 | 4 to 4 | identical |
| django | 2.8/warning to 0/critical | 0 no-finding to 1 abstain | 3.1 to 2.6 | 2.6 to 1.6 | 3.6 to 3.6 | conditional to conditional | code_trust 3/5; process_trust 2/6 to code_trust 3/5; process_trust 2/6 | unranked to unranked | identical |
| flask | 3.2/verified to 3.2/verified | 0 no-finding to 0 no-finding | 2.9 to 2.9 | 2.7 to 2.7 | 3 to 3 | conditional to conditional | code_trust 4/5; process_trust 3/6 to code_trust 4/5; process_trust 3/6 | 8 to 7 | identical |
| fastapi | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 3 to 3 | 2.8 to 2.8 | 3.2 to 3.2 | conditional to conditional | code_trust 2/5; process_trust 3/6 to code_trust 2/5; process_trust 3/6 | unranked to unranked | identical |
| express | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 3 to 3 | 2.8 to 2.8 | 3.2 to 3.2 | conditional to conditional | code_trust 2/5; process_trust 3/6 to code_trust 2/5; process_trust 3/6 | unranked to unranked | identical |
| vite | 3.2/verified to 3.2/verified | 1 no-finding to 1 no-finding | 3.4 to 3.4 | 2.8 to 2.8 | 4 to 4 | conditional to conditional | code_trust 5/5; process_trust 3/6 to code_trust 5/5; process_trust 3/6 | 1 to 1 | identical |
| esbuild | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | conditional to conditional | code_trust 3/5; process_trust 3/6 to code_trust 3/5; process_trust 3/6 | 13 to 13 | identical |
| biomejs | 3.2/verified to 1.3/critical | 0 no-finding to 1 abstain | 3 to 2.6 | 2.9 to 2.2 | 3 to 3 | conditional to conditional | code_trust 3/5; process_trust 4/6 to code_trust 3/5; process_trust 4/6 | 6 to 11 | identical |
| requests | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | conditional to conditional | code_trust 3/5; process_trust 4/6 to code_trust 3/5; process_trust 4/6 | 7 to 6 | identical |
| pydantic | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | conditional to conditional | code_trust 3/5; process_trust 3/6 to code_trust 3/5; process_trust 3/6 | 3 to 2 | identical |
| axios | 3.6/verified to 2.7/info | 0 no-finding to 1 abstain | 3.3 to 3.2 | 2.6 to 2.4 | 3.9 to 3.9 | conditional to conditional | code_trust 5/5; process_trust 4/6 to code_trust 5/5; process_trust 4/6 | 2 to 3 | identical |
| zod | 3.6/verified to 3.6/verified | 0 no-finding to 0 no-finding | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | conditional to conditional | code_trust 3/5; process_trust 3/6 to code_trust 3/5; process_trust 3/6 | 5 to 5 | identical |
| scorecard | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | conditional to conditional | code_trust 4/5; process_trust 3/6 to code_trust 4/5; process_trust 3/6 | 10 to 9 | identical |
| ripgrep | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.1 to 2.1 | 2.1 to 2.1 | 2 to 2 | at_risk to at_risk | code_trust 3/5; process_trust 3/6 to code_trust 3/5; process_trust 3/6 | 14 to 14 | identical |
| guava | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 1.9 to 1.9 | 1.6 to 1.6 | 2.2 to 2.2 | at_risk to at_risk | code_trust 3/5; process_trust 2/6 to code_trust 3/5; process_trust 2/6 | unranked to unranked | identical |
| cobra | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | conditional to conditional | code_trust 2/5; process_trust 2/6 to code_trust 2/5; process_trust 2/6 | unranked to unranked | identical |
| sinatra | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.4 to 2.4 | 2 to 2 | 2.8 to 2.8 | at_risk to at_risk | code_trust 2/5; process_trust 4/6 to code_trust 2/5; process_trust 4/6 | unranked to unranked | identical |
| automapper | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.2 to 2.2 | 2 to 2 | 2.3 to 2.3 | at_risk to at_risk | code_trust 3/5; process_trust 2/6 to code_trust 3/5; process_trust 2/6 | unranked to unranked | identical |
| fmt | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | 2.6 to 2.6 | 2 to 2 | 3.2 to 3.2 | conditional to conditional | code_trust 3/5; process_trust 4/6 to code_trust 3/5; process_trust 4/6 | 12 to 12 | identical |
| carddemo | 0/not_applicable to 0/not_applicable | 0 no-finding to 0 no-finding | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | insufficient_source to insufficient_source | code_trust 0/5; process_trust 0/6 to code_trust 0/5; process_trust 0/6 | unrated to unrated | identical |
| alfred | 2.6/verified to 2.2/warning | 0 no-finding to 2 abstain | 3.4 to 3.3 | 2.8 to 2.7 | 3.9 to 3.9 | conditional to conditional | code_trust 5/5; process_trust 4/6 to code_trust 5/5; process_trust 4/6 | transparency to transparency | identical |
| cejel | 3.3/verified to 3.3/verified | 0 no-finding to 0 no-finding | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | conditional to conditional | code_trust 5/5; process_trust 3/6 to code_trust 5/5; process_trust 3/6 | transparency to transparency | identical |

## New critical committed-secret findings (v24 only)

None.

## Critical committed-secret findings v22 reported and v24 does not

None.

Source bindings:

- `src/witan/content-reads.ts`: blob `dd0f877adda3e5243ebf0c0a267a1d34e3a3511e`; SHA-256 `333dba53d99fb50e6158536ac459075b5a046fe1b0b0ab03e67878473dfd01ab`
- `src/witan/git-exec.ts`: blob `c9e90fd949cf9d8cbdb40c03c523be50d4016663`; SHA-256 `15905a159049872638b15fa431890dda77819ad75c55a68f72287e935fc20b6e`
- `src/witan/public-scan.ts`: blob `d55765a85a640c871f6fff05e62f2584d3226788`; SHA-256 `8d575def61d9e0c2cfa5d562f0c45979e515deb5d12cec722c1470aa86f43d33`
- `src/witan/repo-signals.ts`: blob `f2548b28436b572f5f9aef21087ac825ef661981`; SHA-256 `0c3b85f843b94bc1ca03f4e69fe47f5d968a3a6ef901e359660655802521a1be`
- `src/witan/rubric-version.ts`: blob `978449111de829fdb445fc938f692050247560a1`; SHA-256 `2f9a687541957e316ca609307d6126bc1442142fe23075a84939dfec2bd8d69b`
- `src/witan/rubric.ts`: blob `a03b85e00ccb7215b6410a5360209cf1dfdf3f41`; SHA-256 `8205db8debd24244356fb88253413641a233699fa04d19437b85ac505e89fd1a`
- `src/witan/schemas.ts`: blob `cd50df9a2dd4487d469686b3118bb46ec1260442`; SHA-256 `8820d3f7a88f490513b3b4209371240662c01344244201e6a59d55055e9642e9`
- `src/witan/scoring.ts`: blob `7de0f392b77f1820cb14465f8968b701432dd8e0`; SHA-256 `0ed59d847f9c2c8b0a6de6d0ad418fbf09592f105cee9dbb0651d36605fda32d`
- `src/witan/__tests__/fixtures/behaviour-corpus.ts`: blob `34bf848e9fd05c7cf66d443c6ebce870d684c345`; SHA-256 `4ce273f8bf0237a7d95a733eed2b8806b6735c9a0846e7a24a9a561e22672974`
- `scripts/a2-v24-paired-rescore.mjs`: blob `191bfa17f09691222eaa91df5f4104c14dfcbe9e`; SHA-256 `de32f274131ccf6eb94535049ea96c22df530f9de18d797e16204da21fbe9f62`

