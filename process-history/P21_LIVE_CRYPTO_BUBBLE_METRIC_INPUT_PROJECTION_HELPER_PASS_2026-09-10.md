# P21 Live Crypto Bubble Metric-Input Projection — Helper PASS

Date: 2026-09-10
Canonical base at construction: Gate342 / `KAIROS_LIVE_MARKET_SUMMARY_24H_PERCENTAGE_MOVEMENT_FOUNDATION_CANDIDATE_2026-09-10.zip`

## Non-canonical helper evidence
- Workflow: `Kairos Live Crypto Bubble Metric Input Projection Reconstruction`
- Run: `34429925957`
- Job: `102723069437`
- Conclusion: SUCCESS
- Helper artifact: `KAIROS_LIVE_CRYPTO_BUBBLE_METRIC_INPUT_PROJECTION_CANDIDATE`
- Artifact id: `10134269723`
- Artifact wrapper SHA-256: `fad19a9770cc70573e40ecabf88ce3f499f40f7660030059411ffdf43f021d79`

## Exact tested candidate identity
- Filename: `KAIROS_LIVE_CRYPTO_BUBBLE_METRIC_INPUT_PROJECTION_FOUNDATION_CANDIDATE_2026-09-10.zip`
- Size: `1595701` bytes
- SHA-256: `abaf94beb36d46e1e33ffff8b7e6bbd93db785a7260c132d2039b7cf1cee059a`
- Git blob at repository root: `727fc3c1aa40181ee807fcb743bef2ec2c541199`
- Root placement main commit: `d15fa79a57b67b261bac30a76d50c2bfe96bc995`

The helper artifact was independently downloaded after helper success. Its wrapper SHA-256 matched the recorded artifact digest, it contained exactly one nested candidate ZIP, and the nested candidate size and SHA-256 above were recomputed from the downloaded bytes.

## Controlled candidate scope
Exactly six files differ from Gate342:
1. `src/presentation/dashboard/liveCryptoBubbleMetricInputProjection.ts`
2. `src/presentation/dashboard/index.ts`
3. `tests/presentation/dashboard/liveCryptoBubbleMetricInputProjection.test.ts`
4. `scripts/verify-live-crypto-bubble-metric-input-projection.mjs`
5. `package.json`
6. `KAIROS_LIVE_CRYPTO_BUBBLE_METRIC_INPUT_PROJECTION_FOUNDATION_REPORT_2026-09-10.md`

## Responsibility
The projection consumes the released freshness-evaluation result rather than recomputing freshness. A failed freshness evaluation fails closed. Successful entries preserve exact instrument/fact association, age, freshness and entry order. Missing facts retain null size/movement metrics. Present facts use the exact fact `quoteVolume24h` and delegate 24h percentage movement to the Gate342 owner. Movement derivation failure fails closed with deterministic entry evidence.

Non-scope remains acquisition/provider/cadence/session policy, ranking/Top-N/stablecoin policy, Bubble palette/color thresholds, radius/geometry/layout, stale/expired visual treatment, React/Home wiring, persistence, Your Trades/journal/chart/navigation/transitions.

## Verification status
The reconstruction helper passed its dedicated Bubble metric-input verifier, Gate342 movement verification, freshness-evaluation verification, pinned toolchain/dependency proof, TypeScript, production build, focused regressions, full unit regression, all registered `verify:*` roadmap regressions, clean packaging/integrity, artifact upload and root placement.

This helper PASS is supporting evidence only and does not promote authority. Gate342 remains GOLDEN until the exact candidate above receives FULL `Kairos Controlled Roadmap Gate` PASS with exact-run `KAIROS_CURRENT_CANDIDATE` and `KAIROS_GATE_EVIDENCE` artifacts.
