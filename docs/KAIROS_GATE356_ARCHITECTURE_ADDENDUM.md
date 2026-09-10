# Kairos Gate 356 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #356 / run `34484471804` / job `102895150657` completed full SUCCESS on 2026-09-10 at exact head `a44c96e713693388792176e7566a8cf956b834e5`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_TEXT_EVIDENCE_PRESENTATION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,653,737` bytes; SHA-256 `26d29214fa066252a7742d0abc4dda124a25bfca176f20ce574ba2156d4558a7`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10155483000`, wrapper size `1,414,868` bytes, digest `sha256:d0da7814e4a37f585159907e1126ad6d9976d8610d58d5d575b804715b77aed0`.
- `KAIROS_GATE_EVIDENCE`: id `10155483439`, wrapper size `1,231` bytes, digest `sha256:a664065fabf3eb462f71d66b6b48caa8e3df14ef3d5ad83328bff2be67215396`.

The exact-run current-candidate artifact was independently downloaded after the run. Its wrapper contained exactly one nested candidate at the exact filename, size and SHA-256 above. Fresh ZIP inspection proved root exactly `kairos_p76/`, clean archive integrity, no absolute paths, no traversal and no symlinks. Every required canonical stage passed: exact archive identity/integrity, Gate355 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript/build, dedicated textual-evidence verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures and both canonical uploads.

## Canonically released responsibility

Gate356 releases `src/app/HomeDashboardLiveCryptoBubbleTextEvidence.tsx` as the first truthful visible React consumer of already-released Home Live Crypto Bubble evidence.

The component owns only semantic presentation of one exact Gate354 view model passed as a prop:
1. expose the released Gate351 runtime status and whether later runtime error evidence is present;
2. preserve explicit absence when there is no latest market observation;
3. preserve an exact released Gate352 projection failure reason and optional entry index;
4. on successful projection, render entries in their existing order and expose only released symbol, availability, freshness state, movement semantic, 24h quote volume, 24h movement percentage and normalized area-weight evidence; and
5. keep missing values explicit rather than fabricating zero/current market facts.

Gate351 remains lifecycle/state owner, Gate352 remains normalized area-weight arithmetic owner, Gate354 remains pure runtime-state-to-area-weight view-model owner, and Gate355 remains the React hook composition owner.

## Explicit non-scope

Gate356 does **not** own or change the runtime hook, provider/transport, acquisition/retry/cadence, clocks, universe/ranking/Top-N/stablecoin policy, movement/freshness/area-weight calculations, retained state/effects/timers, Bubble radius transform, min/max sizing, viewport/collision/layout, palette/theme/dimming, label placement, SVG/canvas, `HomeRoute` wiring, persistence/Saved Analysis, Your Trades/journal/chart/Risk-Reward/navigation/transitions.

The authoritative Bubble-size metric remains 24h quote volume. Gate352 area weight is normalized presentation evidence only; Gate356 introduces no pixel-radius conversion.

## Next dependency-safe responsibility proof

Fresh Gate356 GOLDEN now provides both sides of a complete injected React presentation path: Gate355 can derive the exact Gate354 view model from caller-owned runtime inputs, while Gate356 can render that exact model without taking runtime ownership. `src/app/HomeRoute.tsx` is still a placeholder, and fresh source inspection shows no released app owner yet supplies concrete `readObservedAt`, `readEvaluationTimeMs`, live-universe/runtime-binding options, or presentation-policy defaults at the route boundary. Wiring the route now would therefore require inventing configuration/clock ownership. Bubble-specific radius, collision/layout, palette/dimming and label-placement contracts also remain unreleased.

Therefore the smallest next responsibility is a **Home Live Crypto Bubble textual-evidence runtime composition component** below `HomeRoute` and Bubble geometry:
1. accept exact caller-owned `readObservedAt`, `readEvaluationTimeMs` and Gate351 runtime-binding options as props without choosing defaults;
2. call released `useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(...)` exactly once with those exact inputs;
3. pass the exact returned Gate354 view-model reference directly to released `HomeDashboardLiveCryptoBubbleTextEvidence` exactly once;
4. add no own state/effect/memo/timer/observer/provider/policy/arithmetic/default clock/configuration; and
5. perform no CSS/theme/palette/geometry/layout/DOM-data rederivation, route wiring, persistence, Your Trades or navigation ownership.

This closes only the missing React composition edge between the released hook and released textual presenter while keeping concrete browser/runtime defaults and the later Bubble visual contract separately controllable.