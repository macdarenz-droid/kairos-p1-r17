# Binance Spot historical candle acquisition foundation

## Authority, base and exact scope

After receiving the Gate405 FULL PASS and Cloudflare build command, the user said “Continue”. This authorizes the next dependency-backed foundation in the recorded chart integration plan. It does not establish that a physical UI review occurred. Manual-only control remains; no automation restart. This slice adds one bounded historical OHLC acquisition boundary under existing P15/P16 ownership, with no visible UI change or phase closure.

Fresh canonical GOLDEN405: run34696306217/job103560275701/head acef469e115c61412407bf0f840d5c15504feadd, all32actual stages successful. Exact-run candidate10299400624 and evidence10299370734 are nonexpired and match that head. Base source ZIP KAIROS_YOUR_TRADES_PROFIT_SIZE_UI_CANDIDATE_2026-09-12.zip;3482304bytes;SHA2564a0f1871c67defb68cd2968bf9655927f0db76b23f1e33c67605e5a82df7d205;Git blob5e1ca533a29661f5b3bb267eaa66bc59a5dc95a7. Fresh main e662e3c64ba91a2616f6710affb60e7d940ffe59 is its documentation-only completion child. Its current architecture/approval/plan/405report records are carried into the candidate. Work began with a verified fresh source extraction; no active chain.

Source proof: MarketDataAdapter has subscribe only; existing Binance adapters acquire price ticks and dashboard summaries. ChartRenderModel already accepts candles, and chartViewportHistoryDemand explicitly leaves history acquisition to its caller. AnalysisRoute still renders a saved-trade picker/details, not the chart. The missing responsibility is therefore bounded candle acquisition before route composition; no second chart renderer, live transport lifecycle or trade query is appropriate here.

## Provider contract research

Binance documents GET /api/v3/klines as a bounded candle page with case-sensitive intervals, a1000-row maximum and array fields for timestamps/OHLC. UTC is the default interval timezone; this adapter sends timeZone=0 explicitly. Opening time identifies a candle. See [official market endpoint reference](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market).

The existing data-api.binance.vision base supports public klines without credentials. See [official market-data-only endpoints](https://developers.binance.com/en/docs/products/spot/faqs/market_data_only). Default response timestamps are milliseconds, result order is chronological and Unicode symbols are supported. See [official REST information](https://developers.binance.com/en/docs/products/spot/rest-api). These facts were checked during this slice; no unofficial wrapper or new dependency was used.

## Owners and behavior

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Neutral request/page/result contract | src/services/market-data/MarketCandleHistoryPort.ts | Exact instrument/interval, bounded UTC opening-time window and decimal OHLC; market reference only |
| Binance request validation/description | providers/binance/binanceSpotCandleHistoryRequest.ts | Existing venue/public REST base; exact encoded symbol; supported interval; integer limit1–1000; optional ordered epoch-ms bounds |
| Response decode/validation | providers/binance/binanceSpotCandleHistoryResponse.ts | One JSON page; consumed OHLC/time facts; whole-page rejection on invalid facts; existing decimal kernel comparisons |
| Acquisition composition | providers/binance/binanceSpotCandleHistoryAcquisition.ts | One injected request, HTTP/error classification, immutable request binding, receipt time and cancellation propagation |
| Native browser fetch | providers/binance/binanceSpotCandleHistoryBrowserConnector.ts | Public GET, omitted credentials, rejected redirects, no-store, original signal, HTTP/body/Retry-After evidence |
| Receipt timestamp syntax | existing marketDataObservationSemantics.ts | Exports its existing parseIsoUtcInstant helper unchanged for reuse; no new clock/freshness owner |

No default market/timeframe is selected by this port. BTCUSD is never aliased to BTCUSDT, symbols are never uppercased, and malformed UTF-16 cannot silently change identity when URL-encoded. A successful request proves the scope supplied to this endpoint; actual instrument discovery/selection stays with callers and existing metadata owners. The row format contains no symbol/interval echo, so the immutable request descriptor supplies scope identity, not an invented response field.

OHLC stays in DecimalString form, using existing parsers and P11 decimalSubtract for ordering checks. No binary price conversion or financial calculation is added. Response validation checks12field row shape, finite representable safe-integer epoch timestamps, requested interval duration (calendar month handled separately), open/high/low/close consistency, increasing nonoverlapping bars, opening-time window and page limit. Only consumed OHLC/time facts are mapped; volume and other unused provider fields are not claimed validated. Valid gaps remain gaps. No sorting, duplicate removal, synthetic candles, history completeness claim or closed-candle flag is invented. The latest row can still be forming; its advertised closing time is preserved.

Empty200pages are valid empty history, distinct from invalid JSON/provider error objects/non200HTTP. HTTP errors preserve status and Retry-After; no retry/fallback is scheduled here. Pre-aborted requests perform no I/O, the original signal reaches native fetch, and cancellation still wins if an injected transport ignores it. Requests are independently bound to copied/frozen scope even when callers mutate objects or concurrent requests finish out of order. The future route/application caller must cancel superseded work and suppress responses from an older selection; this port stores no selected-market state.

The caller supplies observedAt through an injected receipt-time source. No internal Date.now, timer, cache, persistence, journal mutation, authentication or order action exists. Existing dashboard sizing/drag, themes, P11 financial facts, P14 executions, P17 chart engine, P18/P19 tools and P20 persistence are retained.

## Test evidence and honest limits

Fourteen focused tests pass: exact URLs/Unicode/no aliasing, all supported request intervals, limits/windows/invalid scopes, precision/extreme decimals, possibly forming last bar, empty-vs-error, whole-page malformed OHLC/time rejection, duplicate/reversed/overlapping bars, genuine gaps, inclusive window edges, leap-month duration, HTTP failures/Retry-After, cancellation before/during transport, immutable scope with out-of-order completion, reused receipt validation, and production native connector composition with exact fetch options. Transport data is synthetic test evidence, never labeled real prices. Dedicated ownership/static checks pass.

Pinned Node22.16.0/npm10.9.2 clean verify:p1 passed install, TypeScript,301files/1241tests and production build. A final defensive malformed-scope/UTF-16 guard was followed by a focused14-test rerun and typecheck; canonical full/current/historical regression must run on the frozen archive. Dependencies and lockfile are unchanged; one dedicated verify:binance-spot-candle-history package script is added.

A single read-only native request to the public BTCUSDT5m endpoint was attempted locally and failed at DNS with EAI_AGAIN. Therefore actual provider connectivity/CORS remains unverified here; neither test fixtures nor official documentation are claimed as a successful live connection. No alternate host/proxy/provider was used. The new canonical foundation check is deterministic. Before any production chart is described as live, require provider-connected evidence in a suitable environment, distinct from regression fixtures.

## Packaging and next responsibility

Candidate: KAIROS_BINANCE_SPOT_CANDLE_HISTORY_FOUNDATION_CANDIDATE_2026-09-12.zip. Clean kairos_p76/ source root, exact intended delta from405, current completion docs carried, no build/cache/evidence/log residue or removals. Preserve every canonical405stage, full registered verifiers, historical closures, browser regression and artifact upload; add the dedicated candle history stage and this report. Only a FULL canonical PASS with both exact-run artifacts establishes GOLDEN. This report is a pre-gate checkpoint.

UI VISIBLE: NO. Historical acquisition is now available for composition; the deployed Analysis/Journal chart is not changed by this foundation. After FULL PASS, the next bounded responsibility is standalone historical-candle Analysis composition using the existing P17 renderer and explicit supported instrument/timeframe selection, with cancellation/stale-response handling and real browser evidence. Existing metadata supplies instrument choices; ambiguous saved trade symbols cannot pick a venue automatically. Native provider connectivity must be demonstrated or clearly reported unavailable. Live candle continuity, exact trade overlays and tools/save integration follow their recorded dependencies. P21 remains open and P22 has not begun.
