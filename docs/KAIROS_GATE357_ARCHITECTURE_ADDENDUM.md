# Kairos Gate 357 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #357 / run `34488586757` / job `102909116049` completed full SUCCESS on 2026-09-10 at exact head `8e476af2a4b35be273c1f20bca94420a4d9f5474`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_TEXT_EVIDENCE_RUNTIME_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`

Canonical candidate identity: size `1,658,313` bytes; SHA-256 `ab1ee95c0dc45b5847b6e2b7855c9b6dddef6590c630aaad889c739f3705111d`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10157229045`, wrapper size `1,418,445` bytes, digest `sha256:39aa3db646adcf60ae0fa2efcef448b74585e6ed3de247bef85f28690dd5e407`.
- `KAIROS_GATE_EVIDENCE`: id `10157229515`, wrapper size `1,226` bytes, digest `sha256:e7675b475a92172142da926e68de416c3989dd015267636eccc1203169272821`.

Every required canonical stage passed: exact archive identity/integrity, Gate356 base/candidate extraction, exact five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated textual-evidence runtime-composition verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical uploads.

## Canonically released responsibility

Gate357 releases `src/app/HomeDashboardLiveCryptoBubbleTextEvidenceRuntime.tsx` as the thin React composition owner between the released Gate355 runtime/view-model hook and the released Gate356 truthful textual presenter.

The component owns only this delegation:
1. accept the exact caller-owned `readObservedAt`, `readEvaluationTimeMs`, and Gate351 runtime-binding options;
2. call `useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(...)` exactly once with those exact references;
3. pass the exact returned Gate354-derived model to `HomeDashboardLiveCryptoBubbleTextEvidence` exactly once; and
4. introduce no second runtime, market-truth, calculation, presentation-policy, geometry, persistence, or route owner.

Gate351 remains React lifecycle/state owner. Gate352 remains normalized area-weight arithmetic owner. Gate354 remains pure runtime-state-to-area-weight view-model owner. Gate355 remains the hook composition owner. Gate356 remains semantic textual presentation owner.

## Explicit non-scope

Gate357 does **not** own or change:
- the concrete browser wall-clock implementation for acquisition `observedAt` or freshness evaluation time;
- concrete stablecoin exclusion configuration, Top-N policy value, or neutral-movement threshold configuration;
- provider/transport, acquisition/retry/cadence, page-visibility lifecycle, freshness thresholds, universe policy, movement semantics, or area-weight arithmetic;
- CSS/theme/palette/dimming, Bubble pixel radius/min/max sizing, collision/layout, label placement, SVG/canvas, interaction or animation;
- `HomeRoute` or router wiring;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward, Calculation Brain, navigation, or transitions.

The authoritative Bubble-size metric remains 24h quote volume. Gate352 normalized area weight remains presentation evidence only and Gate357 does not convert it to pixels.

## Next dependency-safe responsibility proof

Fresh Gate357 GOLDEN closes the injected React path from the released semantic runtime through the textual evidence presenter, but production route wiring is still blocked by several deliberately caller-owned inputs. `HomeRoute` remains the P21.1 semantic placeholder. The released runtime path requires separate acquisition `readObservedAt` and freshness `readEvaluationTimeMs` sources, while the existing universe, lifecycle, and presentation-policy options remain explicit inputs.

Fresh source and architecture evidence establishes that:
- `BinanceSpot24hPublicRestBaselineObservedAtSource` is intentionally a caller-owned `() => string` source consumed at acquisition time;
- `HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource` is intentionally a caller-owned `() => number` source read for freshness evaluation;
- the released freshness policy explicitly does not own `Date.now()` / `new Date()` or any internal wall clock;
- Gate351 and Gate357 explicitly forbid internal clock ownership; and
- no released app/browser boundary currently supplies these two concrete wall-clock sources for the Home Bubble presentation path.

The smallest dependency-safe next responsibility is therefore a **Home Live Crypto Bubble browser wall-clock source boundary**, before route wiring and before any Bubble geometry:
1. expose one production browser `readObservedAt` source that returns the current instant as a valid ISO-8601 string when called;
2. expose one production browser `readEvaluationTimeMs` source that returns the current epoch-millisecond wall-clock value when called;
3. keep the two source interfaces separate so acquisition observation time and later freshness evaluation time are not collapsed into one captured timestamp;
4. do not choose or change freshness thresholds, universe/stablecoin/Top-N values, neutral-movement thresholds, lifecycle options, provider behavior, polling cadence, or presentation geometry; and
5. do not wire `HomeRoute` yet.

This closes only the missing concrete browser-time dependency. Universe configuration, browser lifecycle configuration, presentation-policy defaults, and the later Bubble geometry/design contract remain separately controlled responsibilities. No implementation beyond this boundary is authorized by this document alone; fresh source and exact candidate evidence must still be re-proved before construction.