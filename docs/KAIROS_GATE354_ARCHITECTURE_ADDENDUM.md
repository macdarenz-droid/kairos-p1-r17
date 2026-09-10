# Kairos Gate 354 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #354 / run `34474836416` / job `102863010650` completed full SUCCESS on 2026-09-10 at exact head `37b745ce699c416730e165e5a64827442677c8e2`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_REACT_AREA_WEIGHT_VIEW_MODEL_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,642,825` bytes; SHA-256 `cea5061c6bd80c1e069b9fa0dfe351935ae8749438481c8145c0cd510fe99cf1`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10151444151`, wrapper size `1,405,328` bytes, digest `sha256:44e2326321b55d60dcbcaadde0050db25fc6439707944317709a4f045ec3b587`.
- `KAIROS_GATE_EVIDENCE`: id `10151444617`, wrapper size `1,384` bytes, digest `sha256:f813a86d49a8e6825c8fed8e3dac534d05b8161524ed3cda1c0055befbb467ef`.

The exact-run current-candidate artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate with the exact filename, size, SHA-256 and root above; ZIP integrity was clean. Every required canonical stage passed: corrected exact archive identity/integrity, Gate352 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript/build, dedicated React area-weight view-model verifier, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical uploads.

Gate353 / run `34474224151` remains failed evidence only. It stopped at exact archive identity because a stale candidate size/SHA tuple had been bound into the gate; it did not reach extraction, source scope, compilation, build or engineering regressions. Gate354 repaired only that identity tuple and retained the exact Gate352 base, five-file scope and verification strength.

## Canonically released responsibility

Gate354 releases `src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel.ts` as the pure app-level composition between released Gate351 React runtime state and released Gate352 normalized area-weight evidence.

`projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(...)` owns only this view-model seam:

1. accept one exact `HomeDashboardLiveCryptoBubbleReactRuntimeState` and preserve that exact object by reference;
2. when `latestObservation` is `null`, expose `areaWeightProjection: null` rather than fabricating market/presentation evidence;
3. when an observation exists, pass only its exact `presentationStateProjection` to released Gate352 exactly once;
4. expose the exact Gate352 result separately from Gate351 lifecycle/error state; and
5. preserve the last authoritative semantic observation and derived area-weight evidence even when a later acquisition failure is reflected in Gate351 state.

Gate351 remains the React lifecycle/state owner. Gate352 remains the normalized area-weight derivation owner. Gate354 introduces neither a second market-truth owner nor a second arithmetic owner.

## Explicit non-scope

Gate354 does **not** own or change:
- provider/transport, acquisition, retry, browser lifecycle or clocks;
- universe eligibility, ranking, Top-N or stablecoin-exclusion policy;
- movement/freshness derivation or thresholds;
- Decimal area-weight arithmetic beyond delegation to released Gate352;
- pixel radius, square-root/minimum/maximum radius, viewport/device geometry, collision/layout or label placement;
- design-system palette/tokens, CSS, opacity/dimming strength, accessibility copy, interaction or animation;
- DOM/visible React rendering or `HomeRoute` wiring;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation or transitions.

## Next dependency-safe responsibility proof

Fresh Gate354 GOLDEN source now contains two released app-level pieces that are still not composed in production: Gate351's `useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(...)` owns the React lifecycle/state binding, while Gate354's pure projector accepts that exact returned runtime state and exposes released Gate352 area-weight evidence. Current production source has no call site that connects those two released owners, and `src/app/HomeRoute.tsx` remains the P21.1 presentation foundation rather than a market/runtime composition owner.

Directly wiring the route to lower runtime + projection details would make the visible route a hidden composition owner. Moving immediately to circles would additionally require unreleased radius/layout/palette/accessibility decisions. Neither is dependency-safe.

Therefore the smallest dependency-safe next responsibility is a **Home Live Crypto Bubble React area-weight hook composition foundation** below visible rendering:

1. accept the same caller-owned `readObservedAt`, `readEvaluationTimeMs` and exact Gate351 runtime-binding options without creating defaults;
2. invoke released `useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(...)` exactly once per React render with those exact inputs;
3. pass the exact returned Gate351 runtime-state reference to released `projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(...)` exactly once;
4. return the exact Gate354 view-model result unchanged;
5. add no `useState`, `useEffect`, `useMemo`, timer, observer, provider call, retry, market policy, error taxonomy, Decimal arithmetic or retained second state owner; and
6. perform no CSS/theme, radius/geometry/layout, DOM/JSX, visible `HomeRoute` wiring, persistence or Your Trades/journal work.

This closes only the React consumer composition gap. It leaves all user-facing geometry/design decisions and actual route rendering to later controlled presentation responsibilities.