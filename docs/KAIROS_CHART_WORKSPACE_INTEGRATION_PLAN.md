# Chart workspace integration — user concerns recorded 12 September 2026

## Current product gap

After first inspecting the deployed UI following Gate404, the user expected trade visualization on actual candles and a TradingView-like Analysis chart workspace, including analysis without choosing a saved trade first. These are accepted product requirements. Existing component tests do not resolve these concerns. The user authorized addressing them in proper slices and deferring work only where dependencies belong later.

| Concern | Verified current source | Still required |
| --- | --- | --- |
| Profit/loss bubble sizes | HomeDashboardYourTrades had equal radius; current P21 candidate adds saved-result weights | Full canonical sizing gate and deployed review |
| Journal visualization | JournalTradeMap/JournalTradeMapGraphic show a symbolic, explicitly not-to-scale guide | Actual market candles with exact saved references and explicit missing-data states |
| Analysis workspace | AnalysisRoute calls loadTradeReview and renders a picker or TradeReviewDetails; it does not mount a chart | Chart-first route usable without saved trades, market/timeframe controls, pan/zoom and optional saved-trade context |
| Real live candles | P17 ChartRenderModel supports OHLC; P15/P16 own adapters and Binance trade-stream lifecycle | Verified historical candles and initial/live continuity composed into the route |
| Drawing/RR/save UI | P18/P19/P20 own components, logical composition and persistence | Production chart integration and rendered draw/edit/save/reload evidence |

Roadmap state remains P17/P18/P19/P20 component systems closed, P21 active, P22–P40 later. Do not renumber phases or treat historical closure as completed routes. This ledger records integration amendments to existing owners. P40 is final polish; missing functional candles are not deferred merely as polish.

## Subsequent bounded slices in dependency order

1. **Finish current P21 profit sizing.** Preserve Gate404 drag behavior and saved result truth. Require full canonical PASS and both artifacts. The following entries are recorded scope, not implementation included in this ZIP.
2. **Candle source and identity, existing P15/P16 boundary.** Audit/reuse market-data types, adapters, trade subscriptions and reconnect owners. Supply missing bounded historical OHLC acquisition/validation and timeframe contracts where absent. Specify venue, instrument, timeframe, timestamps, ordering, limits, cancellation, stale responses and unavailable/offline states. Verify current provider documentation before implementation. Reuse Binance Spot only for explicitly identified supported spot instruments; BTCUSD must not silently become BTCUSDT. Do not invent history or missing execution facts, or call a tick stream complete historical candles.
3. **Standalone Analysis candles, P17 composition.** Reuse createLightweightChartsV5ProductionRendererFactory, chartRenderContract and existing viewport/history lifecycle. Show candles without requiring a saved trade, with market/timeframe controls and loading/empty/error states. Verify mobile pan/zoom, resize, themes, cleanup and rapid market/timeframe changes. Preserve Journal/Your Trades links; selected trades add optional context. A historical-only first slice must be labeled accordingly.
4. **Live candle continuity, P15/P16 plus P17.** Prove snapshot plus updates, current-candle replacement/next-candle append, reconnect/backfill without duplicate/misordered bars, hidden/offline behavior and cleanup. Reuse transport/subscription owners; no duplicate route timers/provider lifecycle. Describe the chart as live only after provider-connected evidence, distinct from deterministic fixture regression evidence.
5. **Exact trade overlays and existing tools.** Use P14 execution IDs/times/prices and P19 planned entry/stop/target/RR meaning on the matching chart. Missing/ambiguous evidence remains explicit; a single exit cannot manufacture an entry. Integrate P18 drawing create/edit/delete and P20 save/load in separate bounded slices where needed. Preserve P11 financial truth and readonly trade review. Require rendered interactions and saved-analysis round trips with no journal mutation. Journal can retain a compact truthful summary linking into the chart.
6. **Review and remaining roadmap.** Reassess the actual P21 experience, close only with evidence and user review, then prove the next P22 responsibility from current ownership. Further indicators, replay, provider/asset expansion and advanced TradingView-like features need their own roadmap scope; none is silently bundled or promised here.

Each implementation slice starts from latest FULL GOLDEN, has one owned responsibility and canonical evidence, and updates this ledger's actual status. The next responsibility after reviewed sizing is item2's source/identity/history boundary, not an unsupported cosmetic chart or automatic P22 progression. This planning document introduces no dependency, provider policy, runtime, schema or phase closure.
