# Kairos Gate 341 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #341 / run `34419801691` / job `102692537923` completed full SUCCESS on 2026-09-10 at exact head `a3fd51ae8820cbcfb96ec793b47e11773f091fca`.

Exact canonical candidate:
`KAIROS_BINANCE_HOME_DASHBOARD_LIVE_MARKET_OBSERVED_RUNTIME_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,585,557` bytes; SHA-256 `88b17a1b9a6cbcdbe37d33cad1908934718d9bfb293d06d63cf2e1a9da836e05`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10130626049`, wrapper size `1,357,426` bytes, digest `sha256:f13ad8009c49a7c67079bdce5d004369a0502545c61ed65cc1af7d946106e27b`.
- `KAIROS_GATE_EVIDENCE`: id `10130626385`, wrapper size `1,412` bytes, digest `sha256:a411470ee7eff28661e344e384635646b984467d1c493723b59492c84d0f7e3e`.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact archive identity/integrity, authoritative Gate340 base plus candidate extraction, exact controlled five-file observed-runtime composition scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated observed-runtime composition and lower-owner verification, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Canonically released responsibility

Gate341 releases `src/app/binanceHomeDashboardLiveMarketObservedRuntimeComposition.ts` as the app-level, non-presentation Binance Home live-market observed-runtime composition owner.

`startBinanceHomeDashboardLiveMarketObservedRuntime(...)` owns only this composition:

1. accept the caller-owned Binance acquisition `readObservedAt` source and the separate caller-owned freshness `readEvaluationTimeMs` source;
2. expose universe options unchanged and only document/timer lifecycle overrides, deliberately omitting the lifecycle `observer` slot from caller options so ownership is unambiguous;
3. create exactly one Gate340 `createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(...)` using the exact evaluation-time source and optional observation sink;
4. preserve caller document/timer lifecycle references while injecting that one observer;
5. delegate exactly once to Gate337 `startBinanceHomeDashboardLiveMarketRuntime(...)`; and
6. return the exact Gate337 bootstrap result unchanged.

Observer construction reads neither caller-owned time source. Initial universe acquisition failure remains unchanged before lifecycle observation exists; authoritative empty selected scope remains Gate337's successful idle runtime and emits no lifecycle observation; non-empty scope continues through the released lifecycle; runtime `close` remains Gate337/lifecycle ownership.

## Explicit non-scope

Gate341 does **not** own or change:
- React/Home/Bubble rendering, component state, layout, geometry, interactions, accessibility copy, stale/expired visual treatment, or motion;
- provider/Binance transport, endpoint/request execution, decode or response mapping;
- active-USDT eligibility, stablecoin exclusion, quote-volume ordering, symbol tie-break, Top-N selection, or universe refresh;
- acquisition cadence, visibility scheduling, overlap cancellation, retry/backoff, or session-state semantics;
- freshness thresholds, canonical `observedAt`, or an internal wall clock;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation, or transition truth.

## Next dependency-safe responsibility proof

Fresh Gate341 GOLDEN source now provides the complete non-presentation path from one initial selected Binance universe through repeated scoped 24h fact acquisition and caller-time freshness observations. Gate340 observations preserve the exact `LiveMarketSummaryFact` and classification independently from acquisition/session status. `LiveMarketSummaryFact` already exposes the raw `quoteVolume24h` required by the approved Live Crypto bubble-size truth, but it does **not** expose a 24h percentage-movement value. Current production source has no owner deriving that percentage for P21, while the approved P21 contract requires bubble color truth to be 24h percentage movement.

The smallest dependency-safe next responsibility is therefore a **provider-neutral Live Market Summary 24h percentage-movement derivation boundary**, still below Bubble presentation. It should consume one already-validated released `LiveMarketSummaryFact`, compute the signed change as `lastPrice - open24h` through the released Decimal kernel, and delegate percentage calculation to the already-released generic percentage calculator using `open24h` as the denominator. The result must remain `DecimalString` truth and preserve the exact instrument/fact association; it must not convert to JavaScript floating point or choose colors, thresholds, geometry, ranking, or UI state.

Fresh source semantics already make `open24h` strictly positive through `validateLiveMarketSummaryFact`, so the zero-denominator case is unreachable for a validated fact. Before implementation, freeze the exact public result/error shape and whether this owner accepts only a validated fact or performs released validation itself. Do not add Binance-specific `priceChangePercent` ownership, duplicate Decimal arithmetic, or begin Bubble rendering in the same slice.
