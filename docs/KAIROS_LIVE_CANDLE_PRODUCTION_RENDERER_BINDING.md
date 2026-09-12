# Live candle production renderer binding — 13 September 2026

## Responsibility

This bounded item-4 integration amendment connects the released P17 incremental engine path to the actual Lightweight Charts production renderer used by Analysis.

- `projectedChartRenderer.ts` accepts one caller-authoritative `ChartCandle`, projects it through the released chart projection, and forwards it to the active candle series through `updateLatest`.
- `lightweightChartsV5ProductionRenderer.ts` now composes the released incremental engine driver and exposes `updateLatestCandle` on the existing renderer instance.
- A full render remains the only way to establish or replace a series. Incremental updates fail closed before an initial candle render, after a price-line render, and after destruction.

The caller still owns provider subscription, instrument/timeframe matching, P16.19 update/backfill decisions, reconnect, hidden/offline behavior and cleanup. This slice adds no WebSocket, timer, route lifecycle, persistence, journal mutation, financial calculation, drawing, marker, or UI control.

UI VISIBLE: NO. Analysis continues to show the same historical chart until a later route/session composition supplies verified live updates.

## Canonical base

Gate412/run `34715445353`, job `103611731702`, head `984a92642ec12a8b89e44a222e86ddffede76b56` is FULL canonical PASS: all 33 stages succeeded. Exact-run candidate artifact `10304744045` and evidence artifact `10304689074` are present and bound to that head. The independently verified nested GOLDEN is `KAIROS_BINANCE_SPOT_TRADE_CANDLE_UPDATE_PROJECTION_FOUNDATION_CANDIDATE_2026-09-13.zip`, 3,628,221 bytes, SHA-256 `99c2bc4ce900287b1a187e6f0aae4ac912a424d2195a46cf958f853610e14a87`, Git blob `a226e5d91ccd2f03a156b331819290cc222a1e64`, with one `kairos_p76/` root and valid ZIP integrity.

## Verification before publication

- Dedicated ownership/source verifier: PASS; it and the strengthened existing P17.10 verifier both reject the Gate412 source.
- Focused renderer/engine regression: 5 files, 12 tests PASS.
- TypeScript and production build: PASS.
- Full unit regression: 306 files, 1,260 tests PASS.
- Local runtime was Node 24.19.0/npm 11.9.0, so no exact-toolchain PASS is claimed; the canonical environment must use Node 22.16.0/npm 10.9.2.
- Full unit/current/historical and canonical artifact checks remain mandatory.

P21 remains active. This is not live-route completion or a P21/P17 phase closure.
