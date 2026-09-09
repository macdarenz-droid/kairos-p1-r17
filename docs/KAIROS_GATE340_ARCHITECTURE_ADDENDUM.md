# Kairos Gate 340 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #340 / run `34414358508` / job `102675766867` completed full SUCCESS on 2026-09-09 at exact head `dbadc758169f570af6f8f4ff40359d687a3ad35b`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_MARKET_SUMMARY_FRESHNESS_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,580,635` bytes; SHA-256 `04b95a7cc3103fae230153af07e53fa12fea566f9990c3b090a1c99055f2e117`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10128773284`, wrapper size `1,353,133` bytes, digest `sha256:30eba76cdc46541ac1069f45c4afff6b7208efb6ed927a44bc584c7ca6c3aeb7`.
- `KAIROS_GATE_EVIDENCE`: id `10128773626`, wrapper size `1,506` bytes, digest `sha256:2e9fa3de038d999c59cc81dd7480ebd4f48ec332fa6d3e01216f2767b3d5bb29`.

Every required canonical stage passed: setup/checkout, pinned npm verification, exact uploaded archive identity/integrity, authoritative Gate338 base plus candidate extraction, exact controlled five-file Home freshness-observation bridge scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated Home freshness-observation bridge verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, and both exact-run canonical artifact uploads.

Gate339 / run `34413985174` remains failed evidence only: it stopped at the archive SHA identity assertion because its expected candidate SHA was stale. Gate340 changed the gate identity constant only and canonically verified the exact helper-tested/root candidate bytes; Gate339 is never a base.

## Canonically released responsibility

Gate340 releases `src/application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge.ts` as the provider-neutral, non-presentation Home lifecycle-result freshness-observation bridge.

`createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(...)` owns only this composition:

1. accept an explicit caller-owned evaluation-time source plus an optional observation/error sink;
2. for each released lifecycle `onResult`, read the evaluation-time source exactly once;
3. delegate the exact `result.scopedSnapshot` unchanged to Gate338 `evaluateLiveMarketSummaryScopedSnapshotFreshness(...)`;
4. emit the original acquisition result and the Gate338 freshness evaluation as separate fields, preserving acquisition/session status independently from per-fact freshness;
5. preserve deterministic Gate338 evaluation failures as observation data rather than lifecycle errors;
6. if the evaluation-time source throws, forward that exact error through the sink error channel and emit no observation for that result; and
7. forward the lifecycle `onError` channel unchanged without reading evaluation time.

The bridge does not catch or reinterpret downstream sink callback failures; sink behavior remains caller ownership.

## Explicit non-scope

Gate340 does **not** own or change:
- provider/Binance transport, request execution, decode or response mapping;
- baseline acquisition, state-session mutation or acquisition-result semantics;
- the 5-second cadence, visibility scheduling, overlap cancellation, retry or universe refresh;
- active-USDT eligibility, stablecoin exclusion, quote-volume ordering, symbol tie-break or Top-N policy;
- freshness thresholds, timestamp authority or an internal wall clock;
- persistence/IndexedDB/Saved Analysis;
- React/Home/Bubble rendering, stale/expired visual treatment, bubble geometry/size/color/interactions or motion;
- route/navigation, Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward or Calculation Brain truth.

## Next dependency-safe responsibility proof

Fresh Gate340 GOLDEN source now has the provider-neutral freshness-observation bridge, and the already-released Gate337 Binance Home live-market runtime bootstrap exposes the lifecycle observer option that can consume it. The runtime bootstrap still owns one initial universe acquisition, the summary state session, the Binance scoped-snapshot acquisition port and the browser lifecycle adapter; the new bridge owns only resolved lifecycle-result freshness observation. `HomeRoute` and `src/main.tsx` remain disconnected from these live-market owners.

The smallest dependency-safe next boundary is therefore an **app-level non-presentation Binance Home live-market observed-runtime composition** that injects one Gate340 observer into the already-released Gate337 bootstrap while preserving the two caller-owned time sources and the existing runtime result unchanged.

Before implementation, freeze the exact wrapper/options contract from current source conventions. In particular, the wrapper must not silently overwrite or ambiguously merge an independently supplied lifecycle observer. The narrow candidate should give the wrapper explicit ownership of the lifecycle observer slot, preserve caller-supplied browser document/timer and universe options unchanged, create exactly one Gate340 observer from caller-owned evaluation time + sink, delegate once to `startBinanceHomeDashboardLiveMarketRuntime(...)`, and return the bootstrap result unchanged.

Expected edge behavior follows existing lower owners and must be verified rather than reinterpreted: initial universe acquisition failure returns unchanged before any summary lifecycle observation; an authoritative empty selected scope produces the existing successful idle runtime and therefore no lifecycle observation; non-empty scope uses the existing lifecycle; runtime `close` remains the released close owner. Do not connect React presentation or invent universe-refresh cadence in this same slice.
