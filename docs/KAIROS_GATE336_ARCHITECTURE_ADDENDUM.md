# Kairos Gate 336 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #336 / run `34390439493` / job `102597153321` completed full SUCCESS on 2026-09-09 at exact head `abaec478e5c2c8e715398fdfc660e8faafae37fa`.

Exact canonical candidate:
`KAIROS_BINANCE_SPOT_BROWSER_LIVE_MARKET_UNIVERSE_ACQUISITION_BINDING_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,563,495` bytes; SHA-256 `c744aff5d7c0367d1a3509e0135e24afbbe520d59da5f6fb1273feba547a96e2`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10119820092`, wrapper size `1,338,728` bytes, digest `sha256:cee10e06ed5edaa9f9c0653d6b925938efb18833137019a3e962ec0ce243705c`.
- `KAIROS_GATE_EVIDENCE`: id `10119820789`, wrapper size `1,329` bytes, digest `sha256:b599127e8d241243b93be6410abc1515881f9d31022dffe46f6d5e9cfcb64ad7`.

Every required canonical stage passed: setup/checkout, pinned Node/npm verification, exact archive identity and integrity, authoritative Gate335 base plus candidate extraction, exact controlled six-file Binance Spot browser Live Market Universe acquisition binding scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated Binance browser binding verifier/runtime plus required ownership verifiers, focused binding regressions, full unit regression, full controlled-roadmap regression, historical closures, and both canonical artifact uploads.

## Canonically released responsibility

Gate 336 releases `src/services/market-data/providers/binance/binanceSpotBrowserLiveMarketUniverseAcquisitionBinding.ts`, exported through `src/services/market-data/index.ts`, as the concrete **Binance Spot browser dependency binding for the provider-neutral one-shot Live Market Universe acquisition orchestration**.

`acquireBinanceSpotBrowserLiveMarketUniverseOnce(...)` owns only concrete dependency composition:

1. create the already-released Binance Spot browser `exchangeInfo` instrument-metadata acquisition port;
2. create the already-released Binance Spot browser 24h baseline acquisition port using the caller-owned `readObservedAt` source;
3. delegate both ports, caller options and optional `AbortSignal` to Gate335 `acquireLiveMarketUniverseOnce(...)`;
4. return the Gate335 `LiveMarketUniverseAcquisitionResult` unchanged.

Gate336 does not reinterpret provider data, universe policy, selection semantics, observation time or failures. The concrete lower browser bindings remain the owners of request/transport/decode/mapping behavior; Gate335 remains the owner of provider-neutral universe acquisition sequencing and policy delegation.

## Explicit non-scope

Gate 336 does **not** own or change:
- active-USDT eligibility, stablecoin exclusion semantics, quote-volume ordering, symbol tie-break or Top-N/Top-30 policy;
- endpoint/request description, HTTP execution, browser fetch semantics, JSON decode, provider response mapping, provider error taxonomy, retry/backoff or request-weight policy;
- `observedAt` generation or freshness classification;
- state/session construction, last-good retention, persistence or IndexedDB;
- Home visibility/resume/5-second cadence, timer scheduling, lifecycle races or polling;
- React/Home Dashboard/Bubble Map rendering, bubble geometry/size/color, navigation, chart or transitions;
- Your Trades Bubble Map, journal or trade truth.

## Next dependency-safe responsibility proof

Fresh Gate336 GOLDEN source proves all lower pieces needed for a first Home live-market runtime composition now exist, but they still have no production composition owner:

- `acquireBinanceSpotBrowserLiveMarketUniverseOnce(...)` can obtain the selected authoritative Binance Spot instrument scope without moving universe policy into Home.
- `createLiveMarketSummaryStateSession()` owns one provider-neutral in-memory current summary state but currently has no production constructor/owner.
- `createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort(session, readObservedAt)` binds an already-created state session to the existing Binance 24h baseline state/snapshot capability while preserving caller-owned observation time.
- `createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(port, scope, ...)` already owns browser visibility/timer wiring and starts the released Home acquisition lifecycle for an **already-selected** scope.
- `src/main.tsx` performs app bootstrap but currently creates none of these live-market owners, and `src/app/HomeRoute.tsx` remains a presentation placeholder with no live-market data ownership.

The smallest dependency-safe next responsibility is therefore a **Home live-market runtime bootstrap/composition boundary** outside presentation. It should orchestrate only the already-released owners in dependency order: obtain the initial selected scope through the Gate336 Binance browser universe binding; create one `LiveMarketSummaryStateSession`; create the Binance Home scoped-snapshot acquisition port for that session and the same caller-owned observation source; start the Gate333 browser lifecycle adapter for the selected scope; and return an explicit close/dispose boundary plus any non-presentation runtime handles required by later application wiring.

This future bootstrap must not invent universe-refresh cadence, retry policy, freshness semantics, persistence, React state, Bubble Map visual projection, navigation or provider policy. In particular, Gate336 universe acquisition is one-shot; no periodic universe-refresh policy is implied by the existing 5-second Home summary acquisition cadence. Exact API/result shape must be frozen from fresh GOLDEN source before implementation.
