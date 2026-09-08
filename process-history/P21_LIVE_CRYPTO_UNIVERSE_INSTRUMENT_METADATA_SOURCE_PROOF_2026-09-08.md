# P21 Live Crypto Universe Instrument Metadata — Source Proof

Date: 2026-09-08
Worker: W16-P21-UNIVERSE-METADATA-SOURCE-PROOF-20260908T1530AEST

## Re-proved authority
- Latest canonical GOLDEN: **Live Market Summary Freshness Classification Policy Foundation** via `Kairos Controlled Roadmap Gate` #312 / run `34188023039` / job `101940182795` / exact head `ef0e9ff05802ee1a4d84b04ab4815ecaf010154c`, full SUCCESS.
- Engineering `main` re-proved at `05b5512bb83c70b503230f0b06bf6b5f2b9e2eb6`; primary architecture reconciliation is complete, primary-map blob `7454906704626261af12c432021e7be21a3ca9ef`.
- Fresh Actions re-proof before this checkpoint: zero queued and zero in-progress.
- Retry Ledger: `Kairos Retry Ledger [FRESHNESS_POLICY=CANONICAL_GOLDEN;DOCS=COMPLETE]`.

## User-approved P21 V1 universe authority
The Live Crypto Bubble Map V1 default universe is: actively tradable Binance Spot instruments quoted in USDT, ranked by descending 24h quote volume, deterministic symbol tie-break, configurable Top-30 limit, and configurable stablecoin exclusion. Universe policy and freshness policy must remain separate deterministic owners above provider facts and below presentation.

## Exact current-source finding
Canonical P21.2 `LiveMarketSummaryFact` already exposes the ranking input `quoteVolume24h`, plus instrument identity `{ venue, symbol }`, prices/24h OHLC-volume, caller-owned `observedAt`, and optional provider timestamp. It deliberately owns no universe semantics.

The canonical `MarketDataInstrument`/live-summary path does **not** expose the metadata needed to prove V1 eligibility: base asset, quote asset, or current tradability. Repository-wide search found no released Spot `exchangeInfo`/instrument-directory owner. Existing P21 request/acquisition seams accept caller-owned explicit instruments and therefore cannot themselves prove whether a symbol is currently tradable or USDT-quoted.

## Current official Binance research basis
Binance Spot's official API documentation identifies `/api/v3/exchangeInfo` as the exchange-information endpoint and the official Spot glossary defines `quoteAsset`, `symbol`, and `TRADING`; `TRADING` is the status in which orders can be placed. The same official REST documentation classifies public market-data endpoints as `NONE` security and recommends the public market-data base endpoint for public-only data.

This makes Spot exchange/symbol metadata the smallest dependency-compatible source for current tradability + quote-asset identity without introducing credentials, a paid provider, CoinGecko, journal data, or presentation ownership.

Official evidence consulted on 2026-09-08:
- https://developers.binance.com/en/docs/products/spot/rest-api
- https://developers.binance.com/en/docs/products/spot/faqs/spot_glossary

## Smallest dependency-safe responsibility
**Live Market Universe Instrument Metadata Fact Contract Foundation** only.

Add a provider-neutral market-data fact contract that can carry the minimum authoritative instrument metadata needed by a later deterministic universe policy:
- instrument identity (`venue`, `symbol`)
- base asset identity
- quote asset identity
- current trading-enabled truth

The fact contract/validation owner belongs in the existing market-data service boundary, alongside provider-neutral market facts. A later Binance Spot adapter may map official Spot exchange metadata into this contract. A later, separate universe-policy owner may combine these metadata facts with canonical 24h summary facts to apply USDT eligibility, stablecoin exclusion, quote-volume ordering, deterministic symbol tie-break and configurable Top-N.

### Why this prerequisite must precede universe ranking policy
- `quoteVolume24h` is already released, so ranking data exists.
- V1 eligibility cannot be determined from `{ venue, symbol }` string parsing without guessing quote-asset boundaries or current trading state.
- Hard-coding suffix parsing such as `symbol.endsWith('USDT')` would make product eligibility depend on symbol naming rather than authoritative provider metadata.
- Putting Binance `TRADING`/exchangeInfo response shape directly inside the application universe policy would mix provider semantics into the policy owner and violate the approved separation.
- The metadata fact is reversible, independently testable, provider-replaceable, and does not change user-facing behavior by itself.

## Explicit non-scope
No Binance HTTP request/transport/decoder/mapper yet; no exchangeInfo polling/cache/refresh cadence; no universe eligibility filtering; no USDT selection; no stablecoin exclusion; no quote-volume ranking/sort/tie-break/top-N; no freshness classification/age evaluation; no Home React wiring; no Bubble rendering/size/color/interactions; no Your Trades/journal ownership; no persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership.

## Next safe action
Under a verified execution lease, build exactly one deterministic NON-CANONICAL reconstruction helper from the exact canonical #312 candidate for this metadata-fact contract only. Keep the candidate delta to the metadata contract/validation + market-data export, focused tests, dedicated verifier/report, and package verifier registration. Require Node 22.16.0, npm 10.9.2, Lightweight Charts 5.2.1, exact-scope proof, typecheck/build, focused + full regression, clean `kairos_p76/` package boundary and ZIP integrity. Helper PASS remains non-canonical. Do not implement the Binance exchangeInfo adapter or universe policy in the same slice.