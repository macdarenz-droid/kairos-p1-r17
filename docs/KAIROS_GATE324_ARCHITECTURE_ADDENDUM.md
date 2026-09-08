# Gate 324 Architecture Addendum — Binance Spot exchangeInfo Browser Public REST Connector

Canonical authority: `Kairos Controlled Roadmap Gate` #324 / run `34279358453`, job `102240108984`, exact head `1b9eb026a5299c158a0a4a6596082632868dadaa`, full SUCCESS on 2026-09-09.

Production owner seam: `src/services/market-data/providers/binance/binanceSpotExchangeInfoBrowserPublicRestConnector.ts`, exported through `src/services/market-data/index.ts`.

Responsibility: concrete browser transport for the already-released Binance Spot exchangeInfo request-execution connector contract only. Exactly one native `globalThis.fetch` for the exact already-described request; exact caller-owned `AbortSignal` forwarding; exactly one `Response.text()` read; unchanged string return; unchanged native fetch/text rejection.

Canonical candidate: `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_BROWSER_PUBLIC_REST_CONNECTOR_FOUNDATION_CANDIDATE_2026-09-09.zip`, size `1,519,806`, SHA-256 `7fa3430bfa41f99bdb541f82839b26413475178614fc5c28a67436a1299faced`, root exactly `kairos_p76/`, integrity PASS.

Exact-run artifacts: `KAIROS_CURRENT_CANDIDATE` id `10077425684`, wrapper size `1,302,942`, digest `sha256:0eb78d801f418722eee8d044b9e850bd237b8ff62f6dcffd35086bd524f84e04`; `KAIROS_GATE_EVIDENCE` id `10077426089`, wrapper size `855`, digest `sha256:722a2e11ade792874eae83e0aadec6fa6a354fbe6543c8ccd26a01c7d007f737`.

Boundary: no endpoint/query ownership beyond released descriptor; no HTTP status/header interpretation; no credentials/custom headers/cache/redirect/timeout; no retry/backoff/rate/request-weight policy; no JSON decode or metadata mapping; no acquisition cadence/lifecycle; no USDT eligibility/stablecoin exclusion/24h quote-volume ranking/symbol tie-break/Top-N; no freshness; no Home/Live Crypto Bubble UI; no Your Trades/journal; no persistence/IndexedDB/Saved Analysis/chart/navigation/transitions.

Source/dependency proof after Gate #324: the next smallest missing seam is a **Binance Spot exchangeInfo browser instrument-metadata acquisition binding** only. It should compose the released Gate #323 instrument-metadata acquisition adapter with the released Gate #324 browser connector, preserve existing provider-neutral acquisition result and caller-owned cancellation semantics, and add no new transport/provider/universe/freshness/UI truth. The analogous released 24h browser acquisition binding establishes the dependency direction. Patch numbering is intentionally not inferred.

P21 remains open. Universe selection/ranking and freshness/cadence remain separate owners. Live Crypto Bubble Map remains market/provider truth only; Your Trades Bubble Map remains journal/trade plus released calculation truth only; dashboard transitions remain presentation-only.
