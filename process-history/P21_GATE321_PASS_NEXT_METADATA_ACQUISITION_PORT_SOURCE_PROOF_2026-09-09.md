# P21 Gate321 PASS + next metadata acquisition-port source proof — 2026-09-09

## Fresh canonical state
- Engineering main observed at `08f8b2fe64c2ae85dd927219c44171d01c0c7afa` after successful primary architecture reconciliation.
- Latest canonical GOLDEN is Binance Spot Exchange Information Public REST Round Trip Composition Foundation.
- Canonical `Kairos Controlled Roadmap Gate` #321 / run `34254917222`, job `102158147289`, exact head `a233ef2da22020eeed5d960b9d759ec9d8f26a26`, full SUCCESS.
- Canonical candidate artifact: `KAIROS_CURRENT_CANDIDATE` id `10067919395`; inner candidate `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_ROUND_TRIP_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-09.zip`, size `1,508,727`, SHA-256 `704925a6235a061561eacef5dda832fa9919001b2153af45a6e72e14d3b6b307`, root exactly `kairos_p76/`, integrity PASS.
- Canonical gate evidence: artifact id `10067919789`; inner report SHA-256 `ecbedfe3f25033cb61e4421b41161d93a9fec8cdec4d2b57e203a44dca7d68f7`, integrity PASS.
- Primary living architecture reconciliation completed on main; final map records Gate321 ownership and explicit non-scope. No active helper residue remains.

## Source-proven next responsibility
The smallest missing dependency-safe responsibility after Gate321 is a **provider-neutral Live Market Universe Instrument Metadata Acquisition Port Contract Foundation**. Patch number intentionally not inferred.

Evidence:
1. Canonical Gate313 already owns provider-neutral `LiveMarketUniverseInstrumentMetadataFact` truth (`instrument`, `baseAsset`, `quoteAsset`, `tradingEnabled`) and explicitly leaves acquisition/polling/provider transport outside that fact contract.
2. Canonical Gate321 now owns one caller-driven Binance exchangeInfo round trip through released descriptor -> injected execution -> response delivery, but explicitly owns no acquisition lifecycle or product universe policy.
3. The already-released 24h-summary architecture establishes the dependency order `provider-neutral fact contract -> provider-neutral acquisition port -> provider adapter`, with `LiveMarketSummaryBaselineAcquisitionPort` keeping caller scope/cancellation separate from downstream provider/transport details.
4. There is no current provider-neutral metadata acquisition port found in source/search evidence. Jumping directly from Gate321 to a Binance acquisition adapter would therefore force the provider adapter to invent its upstream application-facing contract.

## Intended responsibility boundary
Define only the provider-neutral contract by which a caller can request authoritative instrument metadata facts. The contract should return released `LiveMarketUniverseInstrumentMetadataFact` values and expose only caller-owned cancellation/options needed by later adapters. Exact method shape/result semantics must be derived from existing Kairos acquisition-port conventions before implementation; do not guess them from this checkpoint.

## Explicit non-scope
- no Binance request descriptor/execution/round-trip widening;
- no concrete fetch/XHR/WebSocket/browser transport or HTTP Response/status/header/body semantics;
- no Binance adapter implementation yet;
- no cache/polling/refresh/resume/visibility/retry/rate/request-weight policy;
- no USDT eligibility, configurable stablecoin exclusion, 24h quote-volume ranking, symbol tie-break or Top-30 product policy;
- no freshness classification/cadence;
- no Home/Bubble presentation, Your Trades, journal, persistence, chart, navigation or transitions.

## Next safe action
Fresh-check same-worker liveness, lease, main and Actions. If zero competing chain, inspect the exact released acquisition-port/result conventions (especially P21.4 and related validation semantics), then implement exactly one provider-neutral metadata acquisition-port contract slice from Gate321 GOLDEN with focused verifier/tests and required regressions. Do not start a Binance metadata acquisition adapter or universe policy in the same slice.
