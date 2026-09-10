# Kairos Gate 343 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #343 / run `34434160306` / job `102735671766` completed full SUCCESS on 2026-09-10 at exact head `cd0629905d3db6325e38c283e540e101002ee55e`.

Exact canonical candidate:
`KAIROS_LIVE_CRYPTO_BUBBLE_METRIC_INPUT_PROJECTION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,595,701` bytes; SHA-256 `abaf94beb36d46e1e33ffff8b7e6bbd93db785a7260c132d2039b7cf1cee059a`; root exactly `kairos_p76/`; repository-root Git blob `727fc3c1aa40181ee807fcb743bef2ec2c541199`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10135782802`, wrapper size `1,366,212` bytes, digest `sha256:7a011e6792bef470e92c1576da7ee0806dbe9203477090dc8771e61b8da47873`.
- `KAIROS_GATE_EVIDENCE`: id `10135783064`, wrapper size `1,218` bytes, digest `sha256:e336e2d2afbeee9a9baa91ee1374eaa8a9ead66b561414f6787562b076ff30fd`.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact uploaded archive identity/integrity, authoritative Gate342 base plus candidate extraction, exact six-file Live Crypto Bubble metric-input scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated Bubble metric-input verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Canonically released responsibility

Gate343 releases `src/services/market-data/liveCryptoBubbleMetricInputProjection.ts` as the provider-neutral Live Crypto Bubble numeric metric-input projection owner below presentation.

`projectLiveCryptoBubbleMetricInputs(...)` owns only this composition:

1. accept one already-resolved `LiveMarketSummaryFreshnessEvaluationProjectionResult` from the released Gate338 owner;
2. fail closed on an upstream freshness-evaluation failure as `freshness-evaluation-invalid`, preserving the released failure reason;
3. preserve successful evaluation time, caller/scoped entry order, exact instrument/fact association, `ageMs`, and `freshness` without re-ranking or reinterpretation;
4. preserve an explicit missing fact as `fact: null` with `quoteVolume24h: null` and `movementPercent24h: null` rather than inventing numeric zero;
5. for each present fact, expose its exact canonical `quoteVolume24h` as the Bubble size-metric truth and delegate 24h percentage movement only to the released Gate342 derivation owner; and
6. fail closed on delegated movement failure as `movement-derivation-invalid`, preserving the exact entry index and delegated reason.

Stale and expired freshness classifications remain data. Gate343 does not decide whether they are hidden, dimmed, retained, or otherwise presented.

## Explicit non-scope

Gate343 does **not** own or change:
- active-USDT universe selection, stablecoin exclusion, quote-volume ranking, symbol tie-break, Top-N configuration or provider ordering;
- Binance-specific `priceChangePercent` or any second percentage truth;
- Bubble palette, positive/negative/near-zero color thresholds, radius/area scaling, geometry, collision/layout, labels, interaction or motion;
- stale/expired/missing visual treatment or visibility policy;
- acquisition/provider transport, response mapping, cadence, visibility lifecycle, retry/backoff, universe refresh or session mutation;
- clocks, observation-time ownership or freshness thresholds;
- persistence/IndexedDB/Saved Analysis;
- React/Home/Bubble rendering or component state;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transition truth.

## Next dependency-safe responsibility proof

Fresh Gate343 GOLDEN source exposes a deliberate remaining seam below presentation:

- Gate340 emits each resolved Home lifecycle result as one `HomeDashboardLiveMarketSummaryFreshnessObservation`, preserving the original acquisition result separately from its released freshness evaluation.
- Gate341 composes that Gate340 observer into the Binance Home live-market runtime and exposes only the caller-owned Gate340 `observationSink` seam.
- Gate343 now converts the exact released freshness-evaluation result into Bubble numeric metric truth, but production source has no consumer that invokes Gate343 from a Gate340 observation.
- `HomeRoute` remains a presentation placeholder and therefore must not become the first owner of this business/data composition.

The smallest dependency-safe next responsibility is therefore a **provider-neutral Home Dashboard Live Crypto Bubble metric-observation bridge below React presentation**.

Freeze the next contract as follows before candidate construction:

1. add one application-layer adapter, `createHomeDashboardLiveCryptoBubbleMetricObservationSink(...)`, that returns the already-released `HomeDashboardLiveMarketSummaryFreshnessObservationSink` shape expected by Gate341/Gate340;
2. for each upstream `onObservation`, delegate the exact `observation.freshnessEvaluation` value exactly once to Gate343 `projectLiveCryptoBubbleMetricInputs(...)`;
3. emit one downstream observation containing the exact original `freshnessObservation` object plus the exact `bubbleMetricProjection` result as separate fields, so acquisition/session status, freshness truth, and Bubble metric truth remain independently inspectable;
4. treat deterministic Gate343 `{ ok: false }` results as observation data, not lifecycle errors and not presentation decisions;
5. forward upstream `onError(error)` unchanged to the downstream error sink;
6. do not catch or reinterpret downstream sink callback failures; callback behavior remains caller ownership; and
7. introduce no time source, internal clock, acquisition/session mutation, provider policy, ranking, color, geometry, persistence, React state or route wiring.

This bridge should stop at the provider-neutral observation seam. A later app-level runtime composition may wire it into Gate341, and only a later presentation policy/React slice should decide how fresh/stale/expired/missing metric observations become visible Bubble UI.
