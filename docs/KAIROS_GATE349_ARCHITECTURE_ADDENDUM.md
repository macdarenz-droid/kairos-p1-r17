# Kairos Gate 349 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #349 / run `34450189510` / job `102783930745` completed full SUCCESS on 2026-09-10 at exact head `8f0f4bd06f4989a675271b6f3e6f7755ee5b723b`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,618,603` bytes; SHA-256 `52c8513f8d3b89fddd3f5ebe361f5d2e43a57696bc96708855f045413e8e4fa7`; root exactly `kairos_p76/`; repository-root Git blob `b38fc9abe374af20d0586e7d0a0589c7b3db339b`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10141567780`, wrapper size `1,385,304` bytes, digest `sha256:0fbca234a138cc3bb7237b0173d5b30ae2c5ccaa77d0ca35e6610bf172653726`.
- `KAIROS_GATE_EVIDENCE`: id `10141568436`, wrapper size `1,260` bytes, digest `sha256:a1a68c9575aecf232a9f78fdb5417b5d2a44075c7ba65409eb31ed049f4ed003`.

The exact-run `KAIROS_CURRENT_CANDIDATE` artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate with the exact filename, size, SHA-256 and root above; ZIP integrity was clean.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact archive identity/integrity, authoritative Gate346 base plus candidate extraction, exact five-file presentation-state observation-bridge scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated bridge verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Identity-repair closure

Gate347 and Gate348 were gate-identity failures before candidate extraction/build/testing. Gate347 used a stale candidate size/SHA pair. Gate348 corrected the size but transcribed the candidate SHA incorrectly. Fresh helper-artifact and repository-root byte verification established the exact candidate identity above; Gate349 changed only the gate SHA expectation and canonically proved the unchanged candidate. Gate346 remained GOLDEN throughout those failed identity checks.

## Canonically released responsibility

Gate349 releases `src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge.ts` as the provider-neutral Home Dashboard Live Crypto Bubble semantic presentation-state observation bridge below React.

`createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(...)` owns only this adaptation:

1. accept one caller-owned Gate346 `HomeDashboardLiveCryptoBubblePresentationPolicy` and one downstream semantic observation sink;
2. return the released Gate344 `HomeDashboardLiveCryptoBubbleMetricObservationSink` shape;
3. for every exact upstream Bubble metric observation, delegate exactly once to Gate346 with the exact observation and exact caller-owned policy;
4. preserve the exact original metric observation and exact Gate346 projection result as separate inspectable fields downstream;
5. keep deterministic Gate346 `{ ok: false }` projection results as observation data rather than rewriting them as lifecycle errors;
6. forward the upstream `onError(error)` channel unchanged; and
7. leave downstream callback failure behavior caller-owned.

This keeps provider/acquisition truth, numeric Bubble metric truth, semantic presentation-state truth, and eventual React rendering ownership separate.

## Explicit non-scope

Gate349 does **not** own or change:
- clocks, observedAt generation, evaluation-time generation or freshness thresholds;
- Binance/provider transport, response mapping or request execution;
- active-USDT selection, stablecoin exclusion, quote-volume ranking, symbol tie-break or Top-N policy;
- acquisition cadence, browser visibility lifecycle, retry/backoff, runtime/session mutation or close semantics;
- design-system palette/tokens, CSS classes, opacity/dimming strength, labels/icons/accessibility copy, radius scaling, geometry/collision/layout, interactions or animation;
- DOM/React component state, Home route startup/teardown or visible rendering;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transitions.

## Next dependency-safe responsibility proof

Fresh Gate349 GOLDEN source leaves one deterministic composition seam between the already-released Binance Bubble observed runtime and the newly released semantic observation stream:

- Gate345 `src/app/binanceHomeDashboardLiveCryptoBubbleObservedRuntimeComposition.ts` already starts the Binance Home Bubble observed runtime and accepts a Gate344 Bubble metric-observation sink, preserving caller-owned `readObservedAt`, `readEvaluationTimeMs`, universe and browser-lifecycle options.
- Gate349 now adapts a caller-owned presentation policy plus downstream semantic observation sink into exactly that Gate344 Bubble metric-observation sink shape.
- Repository/candidate search finds no production consumer of `createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(...)` yet.
- `src/app/HomeRoute.tsx` remains a presentation placeholder and does not own runtime composition.

Therefore the smallest dependency-safe next responsibility is an app-level **Binance Home Dashboard Live Crypto Bubble presentation-observed runtime composition** below React.

Freeze the next contract before candidate construction:

1. add one app-level composition function, tentatively `startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime(...)`;
2. preserve the exact caller-owned `readObservedAt`, `readEvaluationTimeMs`, universe and browser-lifecycle options already owned by Gate345;
3. replace Gate345's raw Bubble metric `observationSink` option at this wrapper boundary with one required caller-owned Gate346 presentation policy plus one optional Gate349 semantic presentation-state observation sink;
4. construct exactly one Gate349 presentation-state observation adapter and pass that exact adapter unchanged as Gate345's `observationSink`;
5. delegate exactly once to `startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(...)` and return its bootstrap result unchanged;
6. do not add a second raw metric/freshness observation sink or duplicate provider/acquisition/freshness/metric/presentation truth; and
7. do not create clocks, session mutation, provider/universe/ranking policy, palette/tokens, radius/geometry/layout, persistence, DOM/React lifecycle, Home rendering, Your Trades, journal/chart/navigation/transitions.

Only after this app-level semantic-runtime composition is canonically released should a later Home/React slice own component lifecycle/state subscription and visible Bubble rendering from the released semantic stream.
