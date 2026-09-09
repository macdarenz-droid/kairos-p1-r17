# Kairos Gate 337 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #337 / run `34399961306` / job `102629102656` completed full SUCCESS on 2026-09-09 at exact head `83ff5967af19031d28fe1043f2b39936bc3ef1ac`.

Exact canonical candidate:
`KAIROS_BINANCE_HOME_DASHBOARD_LIVE_MARKET_RUNTIME_BOOTSTRAP_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,569,620` bytes; SHA-256 `95fb5c314b856e41c06e6ae8282af320f0aa643a7d7f716825c66d101ad909c3`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10123441037`, wrapper size `1,344,347` bytes, digest `sha256:6802d40afe653e25598e2a064981fef15a931f7905a6f9d801c647e4a8e2dc08`.
- `KAIROS_GATE_EVIDENCE`: id `10123441792`, wrapper size `1,496` bytes, digest `sha256:c5fbe1ca38a8ec8bbf86b4f538d8ded433d43b3e736714515721949a5a05bbef`.

Every required canonical stage passed: setup/checkout, pinned Node/npm verification, exact archive identity and integrity, authoritative Gate336 base plus candidate extraction, exact controlled five-file Home live-market runtime-bootstrap scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated runtime-bootstrap verifier/runtime and lower-owner verification, focused runtime-bootstrap regressions, full unit regression, full controlled-roadmap regression, historical closures, and both canonical artifact uploads.

## Canonically released responsibility

Gate337 releases `src/app/binanceHomeDashboardLiveMarketRuntimeBootstrap.ts` as the non-presentation Home live-market runtime bootstrap for the released Binance Spot browser chain.

`startBinanceHomeDashboardLiveMarketRuntime(...)` owns only this orchestration:

1. delegate exactly one initial selected-scope acquisition to Gate336 `acquireBinanceSpotBrowserLiveMarketUniverseOnce(...)`;
2. preserve Gate336 `acquisition-failed` without starting a session or lifecycle;
3. treat an authoritative empty selected scope as successful idle runtime and avoid the lower Binance 24h request owner that rejects empty scope;
4. for a non-empty selected scope, create exactly one released `LiveMarketSummaryStateSession`;
5. create the released Binance Home scoped-snapshot acquisition port using the same caller-owned `readObservedAt` source;
6. start the released browser lifecycle adapter for the exact selected scope; and
7. expose only the selected `instruments` and one idempotent `close` boundary.

The state session remains internal. The bootstrap does not reinterpret provider data, selection policy, observation time, lifecycle cadence, acquisition results, or failures.

## Explicit non-scope

Gate337 does **not** own or change:
- universe refresh cadence, retry/backoff or provider request/decode/mapping semantics;
- active-USDT eligibility, stablecoin exclusion, quote-volume ordering, symbol tie-break or Top-N policy;
- freshness evaluation or freshness classification;
- persistence, IndexedDB or Saved Analysis;
- React/Home Dashboard/Bubble Map presentation, presentation state, stale dimming, bubble geometry/size/color/interactions or motion;
- route/navigation, chart, transitions, Your Trades Bubble Map, journal/trade truth, Risk/Reward or Calculation Brain truth.

The existing Home acquisition lifecycle remains the owner of entry/resume acquisition, visible 5-second scheduling, hidden suspension, in-flight cancellation and browser lifecycle cleanup. Gate337 does not create a second cadence owner.

## Next dependency-safe responsibility proof

Fresh Gate337 GOLDEN source now provides a running non-presentation Home live-market runtime and an observer seam that can deliver each released `HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult`, but no owner yet evaluates the freshness of the returned summary facts for later presentation:

- `LiveMarketSummaryFact.observedAt` is the canonical caller-owned observation timestamp.
- `liveMarketSummaryFreshnessClassificationPolicy.ts` already owns the user-approved deterministic `fresh | stale | expired` thresholds (fresh through 15s, stale through 60s, expired above 60s) and explicitly does not own a clock or timestamp parsing.
- `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_FOUNDATION_REPORT_2026-09-08.md` explicitly leaves a follow-on boundary to compute deterministic observation age from canonical `observedAt` plus caller-owned evaluation time and consume that released classification policy.
- Current production source contains no consumer of `classifyLiveMarketSummaryObservationAge(...)`; its only uses are its policy module, verifier and tests.
- `HomeRoute` remains presentation-only and disconnected, so moving clock/freshness semantics directly into React would violate the existing ownership split.

The smallest dependency-safe next responsibility is therefore a **provider-neutral live-market summary freshness-evaluation/projection boundary below presentation**. It should accept already-released scoped snapshot facts plus an explicit caller-owned evaluation time, compute only deterministic non-negative observation age from each canonical `observedAt`, delegate classification to the released freshness policy, and expose the resulting classification alongside the unchanged authoritative fact/instrument association for later Home presentation wiring.

Before implementation, freeze exact invalid/future-timestamp behavior and exact result shape from current timestamp-validation conventions; do not duplicate the 15s/60s constants or introduce an internal wall clock. This future slice must not own acquisition/cadence, provider behavior, universe/ranking, persistence, React state/rendering, stale visual treatment, Bubble geometry/color, navigation, Your Trades, chart or transitions.
