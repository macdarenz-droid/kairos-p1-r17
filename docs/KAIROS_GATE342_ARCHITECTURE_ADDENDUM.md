# Kairos Gate 342 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #342 / run `34425285844` / job `102709105806` completed full SUCCESS on 2026-09-10 at exact head `1c80dedda1891745764974139161179304772322`.

Exact canonical candidate:
`KAIROS_LIVE_MARKET_SUMMARY_24H_PERCENTAGE_MOVEMENT_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,590,138` bytes; SHA-256 `bdc7c8ed86f69c0fa877da04964de242beecabca3430c84aeebd4f0f1be086cf`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10132602505`, wrapper size `1,361,365` bytes, digest `sha256:ec8640a422ac3b5f761422490662da43a1a8d2edf533855193448fe50b995496`.
- `KAIROS_GATE_EVIDENCE`: id `10132602911`, wrapper size `1,229` bytes, digest `sha256:580ff9363932f52479a9f3f3f92e35c129fac9b47321aedc80da6244f92f48ac`.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact uploaded archive identity/integrity, authoritative Gate341 base plus candidate extraction, exact controlled Live Market Summary 24h percentage-movement scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated 24h percentage-movement verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Canonically released responsibility

Gate342 releases `src/services/market-data/liveMarketSummary24hPercentageMovement.ts` as the provider-neutral Live Market Summary 24h percentage-movement derivation owner.

`deriveLiveMarketSummary24hPercentageMovement(...)` owns only this derivation:

1. accept one canonical `LiveMarketSummaryFact`;
2. delegate full fact validation to released `validateLiveMarketSummaryFact(...)`;
3. compute the signed 24h price change as `lastPrice - open24h` through released Decimal subtraction;
4. delegate percentage calculation to the released generic percentage calculator using validated `open24h` as denominator;
5. preserve the exact validated fact and instrument association; and
6. return the 24h movement as canonical `DecimalString` truth.

Released fact semantics make `open24h` strictly positive before arithmetic. Invalid facts fail closed as `fact-invalid`; unexpected released Decimal/percentage calculation failure is surfaced only as `movement-calculation-invalid`.

## Explicit non-scope

Gate342 does **not** own or change:
- Binance `priceChangePercent` or any second provider-specific percentage truth;
- JavaScript floating-point price/percentage arithmetic;
- Bubble palette, positive/negative/near-zero visual thresholds, geometry, radius scaling, layout, interaction or motion;
- quote-volume ranking, Top-N selection, symbol tie-break or stablecoin exclusion;
- freshness classification/evaluation, acquisition cadence, visibility lifecycle, retry/backoff or universe refresh;
- state-session mutation or persistence/IndexedDB/Saved Analysis;
- React/Home/Bubble rendering or component state;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transition truth.

## Next dependency-safe responsibility proof

Fresh Gate342 GOLDEN source now exposes both raw `quoteVolume24h` on each canonical Live Market Summary fact and a released provider-neutral `movementPercent24h` derivation. The existing Gate338 freshness projection independently preserves each scoped instrument/fact association plus `ageMs` and `freshness`, and Gate340 observations preserve acquisition/session status separately from that freshness evaluation. Production source still has no consumer that composes those already-released values into a Bubble-ready metric record, while `HomeRoute` remains a presentation placeholder.

The smallest dependency-safe next responsibility is therefore a **provider-neutral Live Crypto Bubble metric-input projection below presentation**. It should consume an already-resolved successful freshness-evaluation projection, preserve each entry's exact instrument/fact/freshness association, keep missing facts explicit, use canonical `fact.quoteVolume24h` as bubble-size metric truth, and delegate present facts to Gate342 for canonical 24h movement-percent truth. It must not choose palette/colors, near-zero thresholds, radius scaling, geometry/layout, visibility rules for stale/expired entries, ranking, or React state.

Before implementation, freeze the exact projection result/error and missing-fact shapes from neighboring provider-neutral projection conventions. In particular, do not silently collapse `missing`, `stale`, and `expired` into one state and do not reinterpret a failed freshness evaluation as Bubble data. The projection should remain a pure composition of released truth owners, leaving user-facing treatment to later presentation policy/wiring.