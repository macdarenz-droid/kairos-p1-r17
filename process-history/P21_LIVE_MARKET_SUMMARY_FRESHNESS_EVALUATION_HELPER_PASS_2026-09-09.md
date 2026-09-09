# P21 Live Market Summary Freshness Evaluation — Helper PASS

## Canonical authority at start

Latest FULL canonical PASS/GOLDEN remains `Kairos Controlled Roadmap Gate` #337 / run `34399961306`, job `102629102656`, head `83ff5967af19031d28fe1043f2b39936bc3ef1ac`.

Exact Gate337 candidate authority:
- `KAIROS_BINANCE_HOME_DASHBOARD_LIVE_MARKET_RUNTIME_BOOTSTRAP_FOUNDATION_CANDIDATE_2026-09-09.zip`
- size `1569620`
- SHA256 `95fb5c314b856e41c06e6ae8282af320f0aa643a7d7f716825c66d101ad909c3`

Gate337 post-PASS architecture reconciliation main commit: `a2b8a3a2ea03db9c4ac552ad4e1901bc3ee09110`.

## Source-proved next responsibility

Fresh Gate337 GOLDEN source shows that `LiveMarketSummaryFact.observedAt` is canonical caller-owned observation time, released scoped snapshots preserve exact instrument + present/missing fact association, and `liveMarketSummaryFreshnessClassificationPolicy.ts` already owns only the mapping of an already-computed non-negative observation age into `fresh | stale | expired`. The classifier intentionally owns neither a clock nor timestamp parsing and has no production consumer yet.

The smallest dependency-safe next responsibility was therefore frozen as a provider-neutral deterministic freshness-evaluation projection below presentation: accept an already-released scoped snapshot plus explicit caller-owned evaluation time; for each present fact validate through the released fact validator, compute age from canonical `observedAt`, delegate classification to the released freshness policy, and preserve the exact instrument/fact association. Missing facts remain explicitly missing and unclassified.

Frozen edge semantics:
- non-finite or negative evaluation time -> `evaluation-time-invalid`;
- invalid present fact -> `fact-invalid` via the released fact validator;
- canonical `observedAt` later than evaluation time -> `observation-after-evaluation` rather than clamping a negative age;
- missing `fact: null` -> `ageMs: null`, `freshness: null`;
- no internal `Date.now()`/clock ownership and no duplicate 15s/60s thresholds.

Explicit non-scope remains acquisition/provider transport, request/response mapping, polling/cadence/visibility/lifecycle/retry, universe/ranking/Top-N/stablecoin policy, state/session mutation, persistence, React/Home rendering, stale/expired presentation treatment, Bubble geometry/size/color/interactions, Your Trades/journal/chart/navigation/transitions.

## Non-canonical helper evidence

One deterministic helper chain was used:
- workflow: `Kairos Live Market Summary Freshness Evaluation Projection Reconstruction`
- run `34404263639`
- job `102643335708`
- helper head `4e27142e8baff97b848c1838d74b8287bd02f83e`
- conclusion: FULL SUCCESS

The helper passed exact Gate337 base identity/integrity, deterministic install, Node `22.16.0`, npm `10.9.2`, Lightweight Charts `5.2.1`, dedicated freshness-evaluation verification, released classifier verification, production TypeScript/build, focused freshness/scoped-snapshot/Gate337 regressions, full unit regression, all registered `verify:*` controlled-roadmap regressions, clean packaging, ZIP integrity, artifact upload, and repository-root byte placement.

Exact normalized Gate337 -> candidate delta is six files only:
1. `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_EVALUATION_PROJECTION_FOUNDATION_REPORT_2026-09-09.md`
2. `package.json`
3. `scripts/verify-live-market-summary-freshness-evaluation-projection-foundation.mjs`
4. `src/services/market-data/index.ts`
5. `src/services/market-data/liveMarketSummaryFreshnessEvaluationProjection.ts`
6. `tests/live-market-summary-freshness-evaluation-projection-foundation.test.ts`

Exact tested candidate:
- `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_EVALUATION_PROJECTION_FOUNDATION_CANDIDATE_2026-09-09.zip`
- size `1575134`
- SHA256 `6579e55613bccc80cc2d910c97b676111750f52d9d1115f88141ab854dfb2d1c`
- repository Git blob `58da52e2634cf7ca6804cd53b2e4fcdca871efc5`

Exact helper artifact:
- `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_EVALUATION_PROJECTION_CANDIDATE`
- artifact id `10124926245`
- wrapper size `1348911`
- wrapper digest `sha256:ccf973cbf72090a4c0d0251fc34335d8da561b30c405be35580148b195e8a9a4`

Repository-root placement is byte-identical to the tested nested candidate. Fresh main after helper placement is commit `178a18bcd9e431d707c93a33353f9d0c3150557d` (`candidate: add live-market freshness evaluation projection`).

## Canonical status / next exact action

The helper is NON-CANONICAL supporting evidence only. Gate337 remains GOLDEN. No newer canonical gate was active when this record was written.

Next exact controlled action: re-prove fresh main/Actions and exact Gate337 authority, then retarget only `.github/workflows/kairos-gate.yml` to verify the exact tested freshness-evaluation candidate above against the exact Gate337 base, preserving the canonical pinned toolchain, exact six-file scope, dedicated/lower-owner verification, focused regressions, full unit suite, all registered controlled-roadmap verifiers, historical closures, and exact-run `KAIROS_CURRENT_CANDIDATE` + `KAIROS_GATE_EVIDENCE` uploads. Until that canonical run FULL PASSES, Gate337 remains GOLDEN.