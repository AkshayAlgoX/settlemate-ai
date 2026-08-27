# SettleMate AI — Reproducible Claims Verification Report

*Generated at: 2026-08-24T20:20:08.180Z (Total Verification Runtime: 249.54s)*

### Official Dataset SHA-256 Fingerprint: `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b`
### Metric Payload SHA-256 Seal: `9255d2507edbdec16344e1c37d0ce4a6995fe10527447c1813ae16fcdfbcbaa6`
### Bitwise Determinism Status: **PASS**

| Category | Metric Name | Measured Value | Stated in Docs | Unit | Status | Verification Command |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| Official Benchmark | Accuracy | **98.1** | 98.1 | % | [EXACT] | `npm run evaluate` |
| Official Benchmark | Precision | **98** | 98 | % | [EXACT] | `npm run evaluate` |
| Official Benchmark | Recall | **98** | 98 | % | [EXACT] | `npm run evaluate` |
| Official Benchmark | Adversarial Detection | **9/10** | 9/10 | ratio | [EXACT] | `npm run evaluate` |
| Official Benchmark | Adversarial Score | **90** | 90 | % | [EXACT] | `npm run evaluate` |
| Cardinality Topologies | Scenario Success Rate | **100** | 100 | % | [EXACT] | `npx tsx scripts/evaluate-cardinality.ts` |
| Track 04 Finance-Ops Loop | Batch Size | **55** | 55 | records | [EXACT] | `npx tsx scripts/benchmark-finance-ops-loop.ts` |
| Track 04 Finance-Ops Loop | Deterministic AI Bypass | **96.4** | 96.4 | % | [EXACT] | `npx tsx scripts/benchmark-finance-ops-loop.ts` |
| Track 04 Finance-Ops Loop | False Financial Writes | **0** | 0 | writes | [EXACT] | `npx tsx scripts/benchmark-finance-ops-loop.ts` |
| AI Claim Falsification | Mechanical Verification Throughput | **134511** | 134511 | claims/s | [EXACT] | `npx tsx scripts/benchmark-claim-verification.ts` |
| Cross-Partition Scale | Boundary Resolution Throughput | **149212** | 149212 | pairs/s | [EXACT] | `npx tsx scripts/benchmark-cross-partition-scale.ts` |
| Adversarial Robustness | Attack Vectors Defended | **10/10** | 10/10 | vectors | [EXACT] | `npx tsx scripts/full-system-adversarial-attack.ts` |
| Decision Receipt Integrity | Offline Non-LLM Verification | **VERIFIED** | VERIFIED | status | [EXACT] | `npm run verify:demo` |
| Master Golden Gate | Golden Stages Passed | **17/17** | 17/17 | stages | [EXACT] | `npx tsx scripts/golden-gate.ts` |
| Unit & Contract Suites | Test Suites Passed | **34/34** | 34/34 | suites | [EXACT] | `npm test` |
