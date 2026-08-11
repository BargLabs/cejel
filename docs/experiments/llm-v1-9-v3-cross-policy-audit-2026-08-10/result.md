# LLM v1.9 detector under v3 isolation — cross-policy audit result

Status: **MATCH_NO_DENIED_SURFACE_ATTEMPTS**

**CONSTRAINTS-VERSION: 2026-08-01.4**

Sole-run scans attempted: 24; normalized matches: 24/24; denied-surface events: 0.

This retrospective audit uses the already-spent v1.9 golden cohort. It is not a new calibration, does not alter the v1.9 NO-GO, and does not prove comprehensive no-egress.

## Bindings

- Preregistration merge: `395ac9259443af8df609b71b201d9649911f5ee3`
- Historical detector: `5c92625ebd89c6ee071690b7b9dc770a5ef76a3e` / `d8e4fd99e1802bbd48fd71930c05efefb4fa526f6277d1f87ff82492e17cfafa`
- V3 control merge: `356aefe84cb43a87c324856497d4aafe8914725c`
- V3 declared runtime surface: 102 paths / `4d90b554f5b395dc8f06b9789aadd762deb666cf8f7341c2dd384d74add6ba38`
- Golden manifest: `a710db4098e88090b1f49d90a6f88f4280038e9c5443f9581138f4206885b3b2` (24 repositories)

## Repository outcomes

| Repository | Exit | Match | Denied surfaces | Historical Git calls | Changed pointers |
|---|---:|:---:|---:|---:|---|
| EffNine/Conductor | 0 | yes | 0 | 16 | — |
| pyscripter/ChatLLM | 0 | yes | 0 | 14 | — |
| RYOITABASHI/Shelly | 0 | yes | 0 | 13 | — |
| DakshBhavsar007/Multi-Agent-Resume-Project | 0 | yes | 0 | 26 | — |
| Surya-Hariharan/Velune-CLI | 0 | yes | 0 | 21 | — |
| tattn/LocalLLMClient | 0 | yes | 0 | 16 | — |
| vndee/local-talking-llm | 0 | yes | 0 | 14 | — |
| Danielskry/Awesome-RAG | 0 | yes | 0 | 14 | — |
| Azure-Samples/rag-postgres-openai-python | 0 | yes | 0 | 30 | — |
| nguyenquoaca-hash/agentic-mesh | 0 | yes | 0 | 16 | — |
| Ankitha-GS/rag-qa | 0 | yes | 0 | 14 | — |
| jarrodwatts/claude-hud | 0 | yes | 0 | 16 | — |
| numtide/llm-agents.nix | 0 | yes | 0 | 16 | — |
| sreyun/aiops-monitor | 0 | yes | 0 | 18 | — |
| squesadag2000/InventoryForecastAnalysis | 0 | yes | 0 | 14 | — |
| twostraws/SwiftUI-Agent-Skill | 0 | yes | 0 | 14 | — |
| jim-schwoebel/awesome_ai_agents | 0 | yes | 0 | 14 | — |
| SitaraLiang/llm-finmath-reasoning-eval | 0 | yes | 0 | 14 | — |
| harnexa/nexa-gauge | 0 | yes | 0 | 27 | — |
| memoturn/memoturn | 0 | yes | 0 | 12 | — |
| Bryancruzcb/aegis-eval-harness | 0 | yes | 0 | 16 | — |
| manuhalapeth/abundant-ai-eval-design | 0 | yes | 0 | 14 | — |
| linny006/llm-eval-tracker | 0 | yes | 0 | 16 | — |
| ozturkoktay/insurance-llm-framework | 0 | yes | 0 | 14 | — |

## Claim boundary

Retrospective cross-policy audit on the already-spent v1.9 golden cohort. Not a calibration, release gate, untouched-cohort run, correction to the v1.9 NO-GO, or evidence that the v3 declared surface is complete.
