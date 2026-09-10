# Kairos Gate 346 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #346 / run `34445525964` / job `102769370723` completed full SUCCESS on 2026-09-10 at exact head `6315101bc70bfe5fa8d24b3310153977c1c452a5`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_PROJECTION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,613,187` bytes; SHA-256 `7541f423e42df50968dc1e49dbe019ab6aff6825d7ad3d98b7ff21df92d990c8`; root exactly `kairos_p76/`; repository-root Git blob `d7656233da186ac6ce8c3b2816bbfead93fe1b5f`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10139726322`, wrapper size `1,380,951` bytes, digest `sha256:96655b8112f625009d53af2758222bfb5cdde84bf21dd11fc61fcc93f012f5c7`.
- `KAIROS_GATE_EVIDENCE`: id `10139726706`, wrapper size `1,412` bytes, digest `sha256:5bcf71d4c2e7b88c9c81a163e48222e15109c410d0c26b5b9aa33ce83c39677d`.

The exact-run `KAIROS_CURRENT_CANDIDATE` artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate with the exact filename, size, SHA-256 and root above.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact archive identity/integrity, authoritative Gate345 base plus candidate extraction, exact five-file Home Bubble presentation-state projection scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated presentation-state verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

## Canonically released responsibility

Gate346 releases `src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection.ts` as the provider-neutral semantic presentation-state projection for Home Live Crypto Bubble observations below React rendering.

`projectHomeDashboardLiveCryptoBubblePresentationState(...)` owns only this semantic projection:

1. preserve the exact incoming Gate344 Bubble metric observation as source truth;
2. fail closed when the embedded Gate343 Bubble metric projection is invalid, preserving the exact upstream failure object;
3. validate the caller-owned `neutralMaxAbsoluteMovementPercent` as a non-negative `DecimalString` policy;
4. preserve each exact metric-entry association and classify only availability (`present` / `missing`), movement meaning (`positive` / `negative` / `neutral`) and freshness presentation state (`missing` / `fresh` / `stale` / `expired`);
5. use released Decimal owners for absolute-value and comparison semantics, with the caller-owned neutral boundary inclusive; and
6. fail closed with deterministic entry index evidence when a supposedly present/missing entry is internally inconsistent or movement semantic derivation fails.

This keeps exact numeric metric truth, freshness truth and semantic presentation state separately inspectable.

## Explicit non-scope

Gate346 does **not** own or change:
- Binance/provider transport, response mapping or public REST execution;
- active-USDT selection, stablecoin exclusion, quote-volume ranking, symbol tie-break or Top-N policy;
- acquisition cadence, browser visibility lifecycle, retry/backoff, runtime/session mutation or close semantics;
- observedAt/evaluation-time generation, internal clocks, freshness thresholds or freshness classification;
- actual design-system palette/token values, CSS classes, opacity, stale dimming strength, labels/icons, accessibility copy, radius scaling, geometry/collision/layout, interactions or animation;
- DOM/React component state, Home route startup/teardown or runtime wiring;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transitions.

## Next dependency-safe responsibility proof

Fresh Gate346 GOLDEN source leaves one small deterministic composition seam before React rendering:

- Gate344 already owns the provider-neutral `HomeDashboardLiveCryptoBubbleMetricObservationSink` that emits exact Bubble metric observations from released freshness observations.
- Gate346 now owns pure semantic projection of one exact Bubble metric observation under an explicit caller-owned neutral-movement policy.
- Repository/candidate search finds `projectHomeDashboardLiveCryptoBubblePresentationState(...)` only in its own source, dedicated verifier/report and tests; no production observation sink consumes it yet.
- `src/app/HomeRoute.tsx` remains a presentation placeholder and still says `No dashboard insights are connected yet.`

Therefore the smallest dependency-safe next responsibility is a provider-neutral **Home Dashboard Live Crypto Bubble presentation-state observation bridge** below React.

Freeze the next contract before candidate construction:

1. add one application-layer factory, tentatively `createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(...)`;
2. accept one caller-owned Gate346 presentation policy and one downstream presentation-state observation sink;
3. return the already-released Gate344 `HomeDashboardLiveCryptoBubbleMetricObservationSink` shape so the bridge can plug into the existing observed-runtime composition without altering runtime ownership;
4. on each upstream Bubble metric observation, call Gate346 exactly once with the exact observation plus the exact caller-owned policy;
5. emit the exact original Bubble metric observation and exact Gate346 projection result as separate inspectable fields rather than flattening or duplicating numeric/freshness truth;
6. preserve deterministic Gate346 `{ ok: false }` as observation data, not lifecycle error; forward upstream `onError(error)` unchanged; and leave downstream callback failure behavior caller-owned;
7. do not create clocks, runtime/session behavior, provider/universe/ranking/freshness policy, design tokens, radius/geometry/layout, DOM/React lifecycle, persistence or navigation ownership.

Only after this semantic observation bridge is canonically released should a later React/Home composition decide component state, startup/teardown and visible rendering from the released presentation-state stream.
