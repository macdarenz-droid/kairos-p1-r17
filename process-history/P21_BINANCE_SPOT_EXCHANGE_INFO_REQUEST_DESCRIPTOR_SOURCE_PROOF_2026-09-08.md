# P21 Live Crypto — Binance Spot Exchange Info Request Descriptor Source Proof — 2026-09-08

## Authority re-proved
- Latest canonical GOLDEN: **Live Market Universe Instrument Metadata Fact Contract Foundation** via `Kairos Controlled Roadmap Gate` #313 / run `34192273207`, job `101952590811`, exact head `7597411be395b869ce787833c431979bf07bcebe`, full SUCCESS.
- Current engineering main at source proof: `4cdc7abec2bd6997977806537aa6ea21d4af8dfb`.
- Primary architecture-map reconciliation for #313 is complete; the canonical metadata fact owner is `src/services/market-data/liveMarketUniverseInstrumentMetadataFact.ts`, exported through `src/services/market-data/index.ts`.

## Fresh source and ownership evidence
1. The canonical #313 metadata fact owns only provider-neutral validated instrument identity plus authoritative `baseAsset`, `quoteAsset`, and current `tradingEnabled` truth. It explicitly does not own Binance HTTP `/api/v3/exchangeInfo`, decoding, mapping, transport, or universe policy.
2. Existing canonical Binance Spot provider architecture already establishes a dependency-safe seam order for public REST market data:
   - pure provider request descriptor (`P21.7`),
   - externally supplied request execution boundary (`P21.8`),
   - deterministic response decode (`P21.9`),
   - response composition/mapping (`P21.10`+),
   - later concrete browser transport/acquisition bindings.
   Therefore a pure request descriptor is the established smallest provider-side first responsibility when adding another public Binance REST data source.
3. Current official Binance Spot documentation identifies `GET /api/v3/exchangeInfo` as a public `NONE`-security endpoint and permits `https://data-api.binance.vision` for public market-data endpoints. Binance exchange-information semantics provide symbol metadata including base asset, quote asset, and trading status such as `TRADING`.
4. No current released Kairos owner obtains exchange-information metadata. Inferring quote asset or tradability from symbol text would violate the no-guess rule and the new canonical metadata fact boundary.

## Source-proven next responsibility
**Binance Spot Exchange Information Public REST Request Descriptor Foundation** only. Patch number intentionally not inferred.

The owner belongs under the existing Binance provider seam and should describe only one public request:
- venue: existing Binance Spot venue truth;
- method: `GET`;
- base URL: existing canonical public market-data base `https://data-api.binance.vision`;
- path: `/api/v3/exchangeInfo`;
- no credentials;
- no universe selection/ranking semantics.

This is a safe, reversible, dependency-compatible technical choice inside the already-approved Binance Spot V1 provider boundary. No user approval is required.

## Explicit non-scope
- No `fetch`, XHR, WebSocket, concrete browser transport, or request execution.
- No JSON parsing or Binance exchangeInfo payload decoding.
- No mapping to `LiveMarketUniverseInstrumentMetadataFact` yet.
- No exchangeInfo cache, refresh cadence, polling, retry, rate-limit, or request-weight policy.
- No USDT eligibility filter, stablecoin exclusion, 24h quote-volume ranking, symbol tie-break, Top-N policy, or Bubble presentation.
- No freshness-age computation/classification changes.
- No Home React wiring, stale/expired UI, Bubble geometry/size/color/interactions.
- No Your Trades/journal truth, persistence/IndexedDB, Saved Analysis, chart/navigation, or transition ownership.

## Next controlled action
From exact canonical #313 only, reconstruct and verify one non-canonical candidate containing this pure request descriptor plus focused test/verifier/report/export registration. Only after exact helper success, clean-package identity proof, and zero competing Actions may the canonical gate be retargeted. Helper success is never canonical promotion authority.
