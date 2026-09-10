# Kairos Gate 344 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #344 / run `34436437129` / job `102742358335` completed full SUCCESS on 2026-09-10 at exact head `bb7940a4790c278b49e964f35094639e8891d392`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_METRIC_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,601,034` bytes; SHA-256 `1a8845bbc6ad13f9e7c790663c7f18cb365cc020b54e4ff160639402358960e9`; root exactly `kairos_p76/`; repository-root Git blob `54903fb2c46df69258dc7f652c4eb605efad83a9`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10136578641`, wrapper size `1,370,201` bytes, digest `sha256:6338344bcc0c206ec819c53e2e29380825ae01147911719dbda2be03b9b2c2fe`.
- `KAIROS_GATE_EVIDENCE`: id `10136579080`, wrapper size `1,409` bytes, digest `sha256:11d621f13e81c14f108762ddd128774717d0f233fac17812072129b84d4f1dc0`.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact archive identity/integrity, authoritative Gate343 base plus candidate extraction, exact five-file Home Bubble metric-observation bridge scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated bridge verifier/runtime plus lower-owner verification, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Canonically released responsibility

Gate344 releases `src/application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge.ts` as the provider-neutral Home Dashboard Live Crypto Bubble metric-observation bridge below React presentation.

`createHomeDashboardLiveCryptoBubbleMetricObservationSink(...)` owns only this composition:

1. return the already-released Gate340 `HomeDashboardLiveMarketSummaryFreshnessObservationSink` shape;
2. for each upstream freshness observation, delegate the exact `freshnessObservation.freshnessEvaluation` value exactly once to Gate343 `projectLiveCryptoBubbleMetricInputs(...)`;
3. emit the exact original `freshnessObservation` object plus the exact resulting `bubbleMetricProjection` as separate fields;
4. preserve deterministic Gate343 `{ ok: false }` results as observation data instead of converting them into lifecycle errors or presentation decisions;
5. forward upstream `onError(error)` unchanged; and
6. leave downstream callback failure behavior to the caller rather than catching or reinterpreting it.

This preserves acquisition/session status, freshness truth, and Bubble numeric metric truth as distinct inspectable domains.

## Explicit non-scope

Gate344 does **not** own or change:
- Binance/provider transport, universe acquisition, active-USDT selection, stablecoin exclusion, quote-volume ranking, symbol tie-break or Top-N configuration;
- acquisition cadence, browser visibility lifecycle, retry/backoff, universe refresh, session mutation or close semantics;
- clocks, observedAt/evaluation-time ownership, freshness thresholds or freshness classification;
- Bubble palette, movement color semantics, neutral threshold, size/radius scaling, geometry, collision/layout, labels, interactions, animation or stale/expired/missing visual treatment;
- persistence/IndexedDB/Saved Analysis;
- React/Home route state or rendering;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transitions.

## Next dependency-safe responsibility proof

Fresh Gate344 GOLDEN source leaves one deliberate non-presentation seam before React:

- Gate341 `startBinanceHomeDashboardLiveMarketObservedRuntime(...)` already owns app-level composition of the Binance Home runtime and exposes one caller-owned Gate340 `observationSink` option.
- Gate344 now owns construction of a Gate340-compatible sink that converts each freshness observation into a Bubble metric observation.
- No production source composes the Gate344 sink into the Gate341 runtime; repository search finds Gate344's factory only in its own module/tests, while `HomeRoute` remains a presentation placeholder.
- The prior Gate343 architecture proof explicitly reserved this step for a later app-level runtime composition before any presentation policy/React slice.

Therefore the smallest dependency-safe next responsibility is an **app-level Binance Home Live Crypto Bubble observed-runtime composition** below React.

Freeze the next contract before candidate construction:

1. add one app-level wrapper around Gate341, tentatively `startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(...)`;
2. preserve the same caller-owned `readObservedAt` and `readEvaluationTimeMs` dependencies and the same universe/browser lifecycle options already accepted by Gate341;
3. replace Gate341's raw freshness-observation sink option at this wrapper boundary with a caller-owned Gate344 `HomeDashboardLiveCryptoBubbleMetricObservationSink` option, so this wrapper owns that adaptation slot explicitly;
4. construct exactly one Gate344 sink and pass it unchanged as Gate341's `observationSink`;
5. delegate exactly once to `startBinanceHomeDashboardLiveMarketObservedRuntime(...)` and return its bootstrap result unchanged, preserving initial-universe failure, authoritative-empty-scope, non-empty lifecycle and close semantics;
6. do not introduce an internal clock, provider/universe policy, freshness or Bubble presentation policy, persistence, React state or route wiring; and
7. do not merge or silently override an independently supplied Gate341 raw observation sink at the same boundary.

Only after that app-level composition is canonically released should a later presentation-policy/React slice decide how successful/missing/stale/expired Bubble metric observations are transformed into visible Home Bubble UI.
