# Time-based trade snapshot — feasibility review

## Request and status

While canonical Gate406 was running, the user asked whether entering the instrument and exact opening/closing dates and times could retrieve real historical candles, derive approximate reference prices and show the trade visually, while precise manual journaling continues to use recorded execution prices. The instruction was to research and inspect the last GOLDEN during the gate. This document is a feasibility proposal, not implemented functionality or authorization to insert an untested feature into Gate406.

Read-only inspection matched the relevant source files byte-for-byte to FULL Gate405's SHA256-verified archive. Gate406's candle-history foundation is the pending dependency inspected alongside it. No current gate/source/workflow mutation was made for this inquiry.

## Feasibility and proposed experience

Yes: a time-assisted snapshot can use real historical candles plus explicitly estimated market-reference entry/exit prices. It requires exact provider/venue/instrument, long/short, opening and closing instants, and explicit input timezone/UTC conversion. Dates alone cannot identify an instrument, broker fill, position size, fees or intended stop/target. Show planned stop/target/RR only when supplied; a shaded trade interval is not automatically a risk/reward box. Future times, unavailable history, closed sessions and oversized timestamp gaps must be shown as unavailable/pending rather than fabricated.

| Mode | User supplies | Visual result | Truth |
| --- | --- | --- | --- |
| Quick time-based snapshot | Supported venue/instrument, side, opening/closing date-times and timezone | Real historical candle window with estimated entry/exit reference markers | Estimated market reference; never silently an actual fill |
| Exact manual journal | Actual execution prices, quantities, times and relevant costs | Same candle context with exact recorded execution markers | Recorded execution truth; existing P11/P13 calculations remain authoritative |

Suggested marker price policy, to be finalized in its own slice: prefer the last available historical market trade at or before each requested instant, within an explicit maximum lookup age. This avoids using a later price as if it had existed at the requested time. Retain requested time, matched market-event time and time gap. Do not advertise the result as the user's broker fill or promise a fixed accuracy percentage. Spread, execution venue, slippage and multiple/partial fills can differ.

If only candles are available, the containing candle identifies the interval and its OHLC, not the exact traded price at an arbitrary instant inside it. A clearly disclosed candle-based estimate/range may be a fallback; no interpolation or candle-close-at-entry assumption is approved here. Chart display timeframe and estimation resolution should remain distinct so switching a5m chart to15m does not silently change the estimated entry price.

## Current source evidence

- src/application/market-reference/executionMarketReferenceTruth.ts explicitly separates journal execution and external market-reference facts, with mayOverwriteExecution:false. Reuse/extend this boundary for estimates; never mutate TradeExecutionRecord with fetched reference prices.
- TradeRecord already has opening/closing dates and side. TradeExecutionRecord has exact price, quantity and timestamp. Its source union includes replay, but that is not sufficient evidence of an estimated-fill contract; do not overload that field and allow estimates to flow into actual performance.
- P14 tradeVisualizerFacts currently projects planned levels and actual exits. Exact actual-entry visualization still needs a truthful execution projection; planned entry must not be relabeled as actual.
- P17 chartRenderContract already separates chart market data and exact journal execution references. An estimated marker needs its own reference provenance, not a fabricated executionId.
- P11 metrics aggregate actual execution prices/quantities. Timestamp-only mode can show market movement, duration and an explicitly hypothetical result only if separately supplied assumptions/policy support it. It must not populate actual P&L, win rate or profit-size bubbles.
- P20 SavedAnalysis currently stores market, drawings and risk/reward objects. It does not store a reproducible candle/reference snapshot or estimate provenance. Durable offline snapshots need a controlled model/repository/backup-compatible extension, not an arbitrary object stuffed into that record.

Proposed estimate provenance includes provider/venue/symbol, requested instant and input timezone, matched event/candle time, method/resolution, exact decimal reference price, time gap and acquisition time. Manual recorded prices remain authoritative and can coexist with reference prices for comparison without either overwriting the other.

## Official data research

Binance's public market reference documents historical klines and aggregate trades, with timestamp filters and returned price/event-time fields. Candle data includes1-second intervals and is bounded per request. This supports the proposed lookup approach in principle; availability for a particular requested date/instrument still requires an actual request. See [official market endpoints](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market).

The REST documentation describes chronological results, recent results through endTime, and default millisecond timestamps. See [official REST information](https://developers.binance.com/en/docs/products/spot/rest-api). Public klines and aggregate trades are available on the existing unauthenticated market-data base. See [official market-data-only endpoints](https://developers.binance.com/en/docs/products/spot/faqs/market_data_only).

No successful native provider lookup is claimed: the current environment's earlier probe failed with DNS EAI_AGAIN. This is a documented feasibility conclusion, not live-data acceptance evidence.

## Recommended placement in the roadmap

1. Finish Gate406's bounded historical candle acquisition foundation unchanged.
2. Compose the standalone historical Analysis chart using existing P17, explicit instrument/timeframe selection, cancellation/stale response handling and real browser/provider-availability evidence.
3. Add the time-assisted snapshot as a separate controlled integration amendment: readonly date/time preview and estimated-reference contract first; exact manual execution overlays share the same chart. Use P15/P16 for historical market-reference lookup, P10/P14 for input/visualization boundaries and P17 for rendering. A past-trade snapshot does not require a continuously running live stream.
4. Add durable estimate/candle provenance through the appropriate P20/P5/P6 contracts before claiming saved/offline snapshot fidelity. Preserve exact manual records, backup/restore and actual-performance exclusions.
5. Continue live candle updates and remaining drawing/RR/save UI integration in dependency order; future stocks/forex/futures providers remain separately scoped.

This can be a forward amendment from latest FULL GOLDEN; do not rewrite earlier passed archives or wait until P40 merely because it touches earlier phase owners. Initial coverage is explicit supported Binance Spot instruments. “Whatever trade” is a future multi-provider goal, not current universal coverage. The feature and its detailed approximation/fallback policy await their own implementation decision and canonical evidence.

## Gate completion after this research

Gate406 subsequently completed FULL PASS: run34699361404/job103568267556/head 02a0efe039cad60119336f590d9f4f039c3e921e, all33actual stages and both exact-run artifacts verified. Historical acquisition is now GOLDEN; the time-assisted feature remains a researched proposal. This note and the completion records are a documentation-only child of the tested head, with no modification to its ZIP or workflow.
