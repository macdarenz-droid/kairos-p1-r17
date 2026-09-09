# Kairos Gate 335 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #335 / run `34383617776` / job `102574251967` completed full SUCCESS on 2026-09-09 at exact head `2263b3ac2038848e44e562881335e3246292fd36`.

Exact canonical candidate:
`KAIROS_LIVE_MARKET_UNIVERSE_ACQUISITION_ORCHESTRATION_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,558,343` bytes; SHA-256 `6be8caa519df5060503f5182bfcc6ff8e41a49d92cf18cb8d11aa6dbf5a2e9d5`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10117237134`, wrapper size `1,333,812` bytes, digest `sha256:a2bba10f165939f93ea3b8925a138966a4d07d2f6356275fbb33e9dcd985c4eb`.
- `KAIROS_GATE_EVIDENCE`: id `10117237648`, wrapper size `1,240` bytes, digest `sha256:752ab7bf61d7e7614e4913577bd979e23e7328abe10c26aa506fd808af3264bb`.

Every required canonical stage passed: setup/checkout, pinned Node/npm verification, exact archive identity and integrity, authoritative Gate334 base plus candidate extraction, exact controlled provider-neutral universe-acquisition scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated universe-acquisition orchestration verifier/runtime, focused regressions, full unit regression, full controlled-roadmap regression, historical closures, and both canonical artifact uploads.

## Canonically released responsibility

Gate 335 releases `src/services/market-data/liveMarketUniverseAcquisitionOrchestration.ts`, exported through `src/services/market-data/index.ts`, as the provider-neutral **one-shot Live Market Universe acquisition orchestration owner**.

`acquireLiveMarketUniverseOnce(...)` owns only sequencing across already-released boundaries:

1. acquire authoritative instrument metadata through `LiveMarketUniverseInstrumentMetadataAcquisitionPort`;
2. delegate active/exact-USDT/caller-configured stablecoin eligibility to the released eligibility policy and derive the exact eligible instrument acquisition scope;
3. if that scope is empty, return an authoritative empty selected scope without issuing an invalid baseline request;
4. acquire one authoritative 24h baseline for that exact eligible scope through `LiveMarketSummaryBaselineAcquisitionPort`;
5. delegate final metadata-to-summary association, quote-volume ordering, symbol tie-break and Top-N selection to Gate334 `composeLiveMarketUniverse(...)`;
6. return only the selected `readonly MarketDataInstrument[]` scope.

The same optional caller-owned `AbortSignal` is forwarded to both acquisition ports. The orchestration does not create cancellation policy. Acquisition failures preserve the already-released single `acquisition-failed` result truth.

## Explicit non-scope

Gate 335 does **not** own or change:
- Binance or any other provider choice;
- endpoint/request description, HTTP execution, browser transport, JSON decode, response mapping, provider error taxonomy, request weight, retry or backoff;
- the eligibility rules themselves, quote-volume ordering, symbol tie-break, stablecoin configuration semantics, or Top-N/Top-30 policy;
- `observedAt` production or freshness classification;
- state/session construction, last-good retention, persistence or IndexedDB;
- visibility, resume, 5-second cadence, timers, lifecycle race handling or polling;
- React/Home Dashboard/Bubble Map rendering, bubble geometry/size/color, navigation, chart or transitions;
- Your Trades Bubble Map, journal or trade truth.

## Next dependency-safe responsibility proof

Fresh Gate335 GOLDEN source shows both concrete Binance browser-ready acquisition dependencies already exist independently:

- `createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort()` composes the released Binance Spot `exchangeInfo` browser REST connector with the provider-neutral metadata acquisition port.
- `createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt)` composes the released Binance Spot 24h browser REST connector with the provider-neutral baseline acquisition port while keeping `readObservedAt` caller-owned.

Gate335 `acquireLiveMarketUniverseOnce(...)` currently has no production consumer that composes those two concrete browser-ready ports. Home lifecycle/browser adapters, by contrast, already consume an **already-selected** `readonly MarketDataInstrument[]` scope and therefore must not absorb universe acquisition/provider dependency composition.

The smallest dependency-safe next responsibility is therefore a **Binance browser Live Market Universe acquisition binding/composition** only: compose those two already-released browser-ready Binance ports with Gate335 one-shot provider-neutral orchestration, preserve the caller-owned `readObservedAt`, options and optional signal, and return the Gate335 result unchanged.

That future binding must not become a new universe-policy, freshness, cadence/lifecycle, state/session, persistence or Home/Bubble presentation owner. No next implementation is authorized by this document alone; fresh canonical/source evidence must still be re-proved before construction.