# P21 Binance Spot exchangeInfo request descriptor — gate #314 PASS, primary architecture map complete, next-source proof

Date: 2026-09-08

## Canonical promotion

The latest canonical GOLDEN is **Binance Spot Exchange Information Public REST Request Descriptor Foundation** (patch number intentionally not inferred).

- Canonical workflow: `Kairos Controlled Roadmap Gate` #314 / run `34195620691` / job `101962579345`.
- Exact gate head: `a42c2480d7d11b624ec93466e102718ab6d5f01f`.
- Result: full SUCCESS. Every required gate stage passed, including exact controlled scope, deterministic install, exact Lightweight Charts 5.2.1 proof, TypeScript/build, dedicated exchangeInfo descriptor verification, current full unit regression, full controlled-roadmap regression, historical closures, and both exact-run artifact uploads.
- Canonical owner: `src/services/market-data/providers/binance/binanceSpotExchangeInfoPublicRestRequest.ts`, exported through `src/services/market-data/index.ts`.
- Responsibility: pure public Binance Spot exchange-information request descriptor for `GET https://data-api.binance.vision/api/v3/exchangeInfo`, empty query, no credentials and no product filtering.

## Exact canonical artifacts

- `KAIROS_CURRENT_CANDIDATE`: artifact id `10044020112`, wrapper size `1,271,076`, digest `sha256:c2ed121e6bc4dd59a54cd58fa4b8355c982747ff9bd2c8b9ee071e261c62d9af`.
- Candidate wrapper contains exactly `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_REQUEST_DESCRIPTOR_FOUNDATION_CANDIDATE_2026-09-08.zip`; inner size `1,478,000`; SHA-256 `c06073f0a30893df5f58f34069789be82b3afa0f26258330249a78d3bb81556d`; Git blob `d04540980f44101ad88fdd88f5848565ea8e2f51`; outer and inner ZIP integrity PASS.
- `KAIROS_GATE_EVIDENCE`: artifact id `10044020584`, wrapper size `1,161`, digest `sha256:53812f771276b1c83021747e3d818ebda53a68549a2890b3d317cc28d35426ab`.
- Evidence wrapper contains exactly `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_REQUEST_DESCRIPTOR_FOUNDATION_REPORT_2026-09-08.md`; inner size `1,642`; SHA-256 `f33ce544980622142c4e04f18f3cf77407a5179bf0e1e8e5e4e598db67296118`; wrapper integrity PASS.

### Evidence correction

An earlier non-canonical helper continuity assertion listed candidate size `1,478,648` and SHA-256 `5243f6eb72b3ad9220d414eb61d5e3d39eef5355692006aadd985c7725070f42`. Exact committed-tree and exact gate-artifact re-proof show that assertion was stale/incorrect. Canonical truth is the exact committed/gated `1,478,000` bytes / `c06073f0a30893df5f58f34069789be82b3afa0f26258330249a78d3bb81556d` candidate above.

## Primary living architecture map reconciliation

Primary reconciliation is COMPLETE.

- Append-only helper definition commit: `e1d758efd5da2fd6161f4e5a111df11d47982646`.
- Helper run: `34196702303`, full SUCCESS.
- Helper-produced architecture-map commit: `baf4101f1b0a404105691f7f24804f1c4ce24d4b`.
- Helper cleanup / final engineering main: `17e98768fc215ceb3029c03ff6a31912f6b45772`.
- Final compare from exact gate head `a42c2480d7d11b624ec93466e102718ab6d5f01f` to final main changes exactly one final-tree file: `docs/KAIROS_ARCHITECTURE_MAP.md`, with `+15 / -0`.
- Final primary-map blob: `848a3b9b9b2aa9adf0744d781d059291cc095ff3`.
- Temporary helper nets to no final-tree residue. Earlier architecture bytes are preserved unchanged before the appended checkpoint.

## Exact non-scope retained

No request execution, fetch/XHR/WebSocket, response acquisition, JSON decode, metadata mapping, cache/polling/refresh/retry/rate-limit/request-weight policy, USDT filtering, stablecoin exclusion, quote-volume ranking/tie-break/Top-N, freshness changes, Home React/stale presentation/Bubble rendering, Your Trades/journal, persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership is added by the canonical descriptor slice.

## Next smallest dependency-safe responsibility — SOURCE PROOF ONLY

The next smallest safe responsibility is **Binance Spot Exchange Information Public REST Request Execution Boundary Foundation** only (patch number intentionally not inferred).

Evidence:

1. Canonical #314 now owns only an already-described `BinanceSpotExchangeInfoPublicRestRequestDescriptor`.
2. Released Binance 24h architecture already proves the provider pattern `request descriptor -> injected request execution boundary -> response decode -> response composition -> concrete browser transport`.
3. Released `binanceSpot24hPublicRestBaselineRequestExecution.ts` establishes the smallest execution owner: accept one already-described request plus an externally supplied connector, invoke the connector exactly once, and return its Promise/result unchanged; optional caller-owned `signal?: AbortSignal` is forwarded unchanged without owning cancellation policy.
4. The exchangeInfo descriptor has compatible provider request shape (`venue`, `method`, `baseUrl`, `path`, `query`, `url`) and requires no new product/business semantics to obtain an execution seam.
5. Therefore a dedicated exchangeInfo execution boundary is a reversible, dependency-compatible technical owner fully inside the already-approved Binance Spot provider boundary. No user approval is required.

### Next-slice non-scope

The execution-boundary slice must not implement concrete `fetch`/XHR/WebSocket transport, `Response`/status/header/body handling, JSON decode, exchangeInfo symbol semantics, mapping to `LiveMarketUniverseInstrumentMetadataFact`, metadata cache/polling/refresh/retry/rate-limit/request-weight policy, universe filtering/ranking, freshness, Home/Bubble UI, persistence or Your Trades ownership. It must not infer symbol suffixes or product eligibility.

## Next safe action

From exact canonical #314 only, implement and verify exactly this request-execution boundary as the next controlled candidate. Do not combine it with response decode, metadata mapping, universe policy, polling/cadence or UI. Use execution lease for repository mutation and promote only through exact `Kairos Controlled Roadmap Gate`.
