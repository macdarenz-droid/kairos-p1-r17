# Kairos Gate 358 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #358 / run `34497203617` / job `102938573967` completed full SUCCESS on 2026-09-10 at exact head `eb284b57a28035a4064431c74c405b46b89e7928`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_BROWSER_WALL_CLOCK_SOURCES_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,662,507` bytes; SHA-256 `ccf36b297a4aa2313c7bade557111fbe1e6a36ce1844dd041ed8d19a3297289f`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10160811706`, wrapper size `1,421,507` bytes, digest `sha256:927c2bb9b7edfa845d1cf724ef31ea5381c03ee86d08c40964f7d7750ccf25e3`.
- `KAIROS_GATE_EVIDENCE`: id `10160812639`, wrapper size `1,373` bytes, digest `sha256:8122ce895dd2da908e375e510a36fed1a1489c87d3ad045aa92e01b29258c8ae`.

Every required canonical stage passed: exact archive identity/integrity, Gate357 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated browser wall-clock source verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical uploads.

Independent exact-run artifact inspection re-proved the nested candidate filename/size/SHA, root exactly `kairos_p76/`, clean ZIP integrity, and no absolute paths, traversal paths, or symlinks.

## Canonically released responsibility

Gate358 releases `src/app/homeDashboardLiveCryptoBubbleBrowserWallClock.ts` as the concrete browser wall-clock source boundary for the Home Live Crypto Bubble path.

It owns only two separate current-time reads:
1. `readHomeDashboardLiveCryptoBubbleBrowserObservedAt()` returns the current wall-clock instant as an ISO-8601 string when acquisition asks for `observedAt`;
2. `readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs()` returns the current wall-clock epoch milliseconds when freshness evaluation asks; and
3. each source reads time independently per invocation rather than sharing a captured timestamp.

Gate351 retains React lifecycle/state ownership. Gate352 retains normalized area-weight arithmetic. Gate354 retains pure runtime-state-to-area-weight view-model ownership. Gate355 retains hook composition. Gate356 retains semantic textual presentation. Gate357 retains the thin injected runtime-to-presenter React composition.

## Explicit non-scope

Gate358 does **not** own or change:
- freshness thresholds or freshness classification semantics;
- provider timestamps, request execution, acquisition cadence/retry, or lifecycle scheduling;
- universe eligibility, stablecoin exclusion contents, ranking/tie-break, or Top-N policy;
- neutral-movement threshold configuration or palette/design-system truth;
- React state/effects, `HomeRoute` or router wiring;
- Bubble pixel radius/min/max sizing, collision/layout, label placement, SVG/canvas, interaction, CSS, animation, or transitions;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, or Calculation Brain.

The authoritative Bubble-size metric remains 24h quote volume. Gate358 supplies clocks only.

## Next dependency-safe responsibility proof

Fresh Gate358 GOLDEN closes the missing concrete browser-time dependency, but the released Gate357 component still requires three caller-owned inputs: `readObservedAt`, `readEvaluationTimeMs`, and `HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions`. Gate358 now owns the first two concrete browser sources, while the runtime options still carry deliberately separate universe/lifecycle/presentation-policy configuration.

Fresh Gate358 source tracing establishes that:
- the two Gate358 clock exports are not yet consumed by a production composition owner;
- `HomeDashboardLiveCryptoBubbleTextEvidenceRuntime` still receives both clock sources as explicit props;
- the existing browser lifecycle adapter already owns its document/timer defaults when lifecycle options are omitted, so no new lifecycle-default owner is required for this edge;
- the exact default excluded-stablecoin set remains caller/configuration-owned rather than released here;
- `HomeDashboardLiveCryptoBubblePresentationPolicy` still requires a caller-provided neutral movement threshold, so that product/design configuration must not be guessed here; and
- `HomeRoute` remains the P21.1 semantic placeholder, while Bubble geometry/design contracts remain unreleased.

The smallest dependency-safe next responsibility is therefore a **Home Live Crypto Bubble browser-clock React composition boundary** below `HomeRoute` and below Bubble geometry:
1. accept one exact `HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions` value from its caller;
2. render the released Gate357 textual-evidence runtime component exactly once;
3. inject the released Gate358 `readHomeDashboardLiveCryptoBubbleBrowserObservedAt` source unchanged;
4. inject the released Gate358 `readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs` source unchanged;
5. forward the exact caller-owned runtime options unchanged; and
6. introduce no own state/effects/memo/timers/clocks, provider/policy/arithmetic, configuration defaults, styling/geometry, route wiring, persistence, or Your Trades ownership.

This closes only the newly available browser-clock dependency edge. Concrete universe/stablecoin configuration, neutral-movement presentation policy, later route wiring, and Bubble geometry/design remain separate responsibilities and must be proven independently before use.