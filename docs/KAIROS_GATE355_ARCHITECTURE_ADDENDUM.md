# Kairos Gate 355 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #355 / run `34478624004` / job `102875489489` completed full SUCCESS on 2026-09-10 at exact head `7e622ba537adf854a2e07298dfb87874a5b0d0e4`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_REACT_AREA_WEIGHT_HOOK_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,648,385` bytes; SHA-256 `9adeffe4565da676eba4ce04d1f6b56960f7e206090db42be7d48e82fecabb71`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10153032501`, wrapper size `1,410,241` bytes, digest `sha256:415fe7116629b682394ece4b571d856ccaa7476c7bb79fee371194262dda2292`.
- `KAIROS_GATE_EVIDENCE`: id `10153033040`, wrapper size `1,397` bytes, digest `sha256:977c868e111de6e31b34f4bb945e98e3bfe7192ad139cbf08eb2eb258cfee23b`.

The exact-run current-candidate artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate with the exact filename, size, SHA-256 and root above; ZIP integrity was clean. Every required canonical stage passed: exact archive identity/integrity, Gate354 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript/build, dedicated React area-weight hook-composition verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical uploads.

## Canonically released responsibility

Gate355 releases `src/app/useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel.ts` as the thin React composition seam between released Gate351 lifecycle/state binding and released Gate354 area-weight view-model projection.

The hook owns only this delegation:
1. accept caller-owned `readObservedAt`, `readEvaluationTimeMs` and Gate351 runtime-binding options without inventing defaults;
2. invoke `useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(...)` exactly once per React render with those exact inputs;
3. pass the exact returned Gate351 runtime-state reference to `projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(...)` exactly once; and
4. return the exact Gate354 result unchanged.

Gate351 remains the lifecycle/state owner, Gate352 remains the normalized area-weight arithmetic owner, and Gate354 remains the pure runtime-state-to-area-weight view-model owner.

## Explicit non-scope

Gate355 does **not** own or change provider/transport, acquisition/retry/cadence, clocks, universe/ranking/Top-N/stablecoin policy, movement/freshness classification, Decimal arithmetic, pixel radius or square-root/min/max sizing, viewport/collision/layout, design palette/tokens/CSS, accessibility copy, DOM/visible rendering, `HomeRoute` wiring, persistence/Saved Analysis, Your Trades/journal/chart/Risk-Reward/navigation/transitions.

## Next dependency-safe responsibility proof

Fresh Gate355 GOLDEN closes the remaining app-level React composition gap below visible rendering, but `src/app/HomeRoute.tsx` is still only the P21.1 dashboard placeholder. Current design-system tokens still provide no Bubble-specific radius, collision/layout, Bubble palette, dimming-strength or label-placement contract. Choosing those values now would invent unreleased user-facing design semantics.

Kairos already has a dependency-safe precedent in `JournalTradeMap.tsx`: exact semantic facts are exposed through a first textual presentation boundary before later geometry is introduced. Applying the same ownership discipline to P21 avoids making `HomeRoute` or a Bubble renderer a hidden market/composition owner.

Therefore the smallest next responsibility is a **Home Live Crypto Bubble textual evidence presentation foundation** below route wiring and geometry:
1. accept one exact released Gate354 view-model value as a prop; do not call the provider/runtime hook itself;
2. expose the exact released runtime status and last-error evidence without reclassifying them;
3. expose the exact Gate352 projection state and, when successful, each entry in existing order with its exact symbol/availability/freshness/movement/quote-volume/area-weight evidence;
4. preserve missing and projection-failure evidence explicitly instead of fabricating values;
5. perform no sorting/filtering/ranking, no market/freshness/movement/area-weight arithmetic, no retained state/effects/timers/providers, and no CSS/theme/palette/radius/geometry/layout/SVG/canvas work; and
6. do not wire `HomeRoute` yet.

This creates the first truthful, accessible React presentation consumer while keeping the later Bubble geometry/design contract separately controllable.