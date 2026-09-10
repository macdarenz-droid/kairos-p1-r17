# Kairos Gate 351 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #351 / run `34467424088` / job `102839159257` completed full SUCCESS on 2026-09-10 at exact head `d462c97bb530dd7eab3fdc17d500e528260bed22`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_REACT_RUNTIME_BINDING_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,630,333` bytes; SHA-256 `7bd9b572ea642229e95560e29ffa5d119bdf458f5caad80f3d5aabd1f91895ea`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10148474131`, wrapper size `1,394,992` bytes, digest `sha256:a1a65e861ff21acd48a6391fbcd8bd95c165de30f1686445d727415177f6314b`.
- `KAIROS_GATE_EVIDENCE`: id `10148474825`, wrapper size `1,439` bytes, digest `sha256:a74c696b31d31d02c625de20d52f33076ef900675e1e91c5f6f3a7577d09df32`.

The exact-run current-candidate artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate with the exact filename, size, SHA-256 and root above; ZIP integrity was clean. Every required canonical stage passed: exact archive identity/integrity, Gate350 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript/build, dedicated React runtime-binding verifier, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical uploads.

## Canonically released responsibility

Gate351 releases `src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime.ts` as the Home Dashboard Live Crypto Bubble React lifecycle/state binding below visible rendering.

`useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(...)` owns only this React-local lifecycle/state seam:

1. consume the exact Gate350 presentation-observed runtime composition using caller-owned observed-at, evaluation-time, universe, browser-lifecycle and Gate346 presentation-policy inputs;
2. start exactly one Gate350 runtime per effect activation;
3. preserve the latest exact Gate349 semantic observation by reference;
4. preserve observation/bootstrap error evidence separately without erasing the latest semantic observation;
5. expose explicit `starting`, `running`, `acquisition-failed` and `bootstrap-error` state;
6. close the exact successfully resolved runtime on teardown, including late asynchronous bootstrap resolution after unmount; and
7. avoid creating a second provider/acquisition/freshness/business-truth owner.

The R3 helper's exceptional-path harness changed only test strategy: its mocked starter resolves normally and throws from the returned object's `ok` getter, so the production hook's existing post-await `try/catch` path is exercised without an unhandled rejected Promise or mock-call-boundary throw. Production behavior was unchanged.

## Explicit non-scope

Gate351 does **not** own or change:
- concrete stablecoin exclusion values or neutral-movement threshold values;
- Binance/provider transport, universe eligibility/ranking/Top-N policy, freshness thresholds/cadence or internal clocks;
- design-system palette/tokens;
- Bubble area/radius scaling, pixel geometry, collision/layout, labels/copy, accessibility semantics, interactions or animation;
- visible Bubble circles or `HomeRoute` rendering/wiring;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transitions.

## Next dependency-safe responsibility proof

Fresh Gate351 GOLDEN source now provides a stable React-local state boundary containing the latest semantic Bubble observation plus separate lifecycle/error evidence, while `src/app/HomeRoute.tsx` remains an empty dashboard foundation and there is still no visible Bubble renderer.

Before visible circles can truthfully encode the user-approved rule that Bubble size represents 24h quote volume, the presentation layer needs one deterministic, provider-neutral size input that does not invent pixel radii or layout. Current source has no such owner: Gate343 exposes raw Bubble metric inputs; Gate346 adds movement/freshness semantics; Gate351 only preserves that semantic state in React.

Therefore the smallest dependency-safe next responsibility is a **Home Live Crypto Bubble normalized area-weight projection foundation** below React rendering.

Freeze the next contract before candidate construction:

1. accept one Gate346 presentation-state projection result without changing its entry order, instrument/fact identity, freshness state or movement semantic;
2. if the upstream presentation-state projection is not successful, preserve that exact failure as non-renderable evidence rather than coercing it;
3. for successful entries, inspect only already-released `quoteVolume24h` values on `availability: 'present'` entries;
4. derive a provider-neutral `areaWeight` as each present quote volume divided by the maximum present quote volume using the released Decimal kernel, preserving exact Decimal-string output;
5. keep missing entries explicitly missing with `areaWeight: null`;
6. when all present quote volumes are zero, keep their normalized weight at exact Decimal zero and leave any minimum visible radius to the later pixel/render owner;
7. do not sort/filter/re-rank, choose Top-N or stablecoin policy, derive movement/freshness again, convert to pixels, take square roots, choose min/max radii, choose colors/theme tokens, perform collision/layout, render DOM/React, or mutate runtime/session state; and
8. keep Live Crypto Bubble market truth completely separate from Your Trades/journal truth.

This projection is a reversible presentation-only preparation step: it makes volume-relative visual area truth explicit without selecting user-facing geometry or design identity. A later controlled React renderer can map this normalized area weight into theme-aware pixel radius/layout while continuing to preserve the exact metric and semantic evidence.