# Analysis live-candle projection-to-renderer coordination — 13 September 2026

## Canonical base

Built only from FULL Gate413/run34718213202/job103619135962/headbc1473833d436e90fa9a4c6bd30a25dd76a82dce. Every one of Gate413's 34 canonical stages succeeded. Both exact-run nonexpired artifacts were downloaded and matched their recorded digests; the nested candidate matched 3,633,181 bytes, SHA-256 `41e1de8c9ffbf386245fb9b5506b0dccceee5329a481f7e09d4bb5e125880a4e`, Git blob `796a17caca6cdd5ce877de46408df37074b04c64`, exact `kairos_p76/` root and clean ZIP integrity. Gate412 is the rollback.

## One bounded responsibility

`src/app/binanceAnalysisLiveCandleProjectionRendererCoordination.ts` composes two released owners without absorbing either:

- P16.19 `projectBinanceSpotTradeCandleUpdate` retains exact Binance Spot identity, interval/bucket, stale and gap semantics.
- P17 `ProjectedIncrementalCandleRendererLifecycle.updateLatestCandle` retains numeric projection and incremental chart mutation.
- This application session retains only the latest authoritative candle for the caller-selected scope. It advances after, never before, a successful renderer update.
- A gap emits an exact instrument/interval/observation backfill request and leaves chart/session state unchanged. Other invalid scope/source conditions fail closed; stale observations are ignored.

The caller still owns initial history acquisition/render, subscription and reconnect, history reacquisition, rapid selection replacement, route/unmount/hidden/offline lifecycle and user-facing connection status. Those responsibilities need later bounded composition and browser evidence before Analysis may be called live.

## Preserved boundaries

No WebSocket, fetch, timer, retry, persistence, IndexedDB, schema, journal write, financial calculation, execution inference, FX, drawing, marker, Live Bubble or provider-expansion behavior is introduced. P14/P18/P19 ownership and immutable recorded facts are unchanged. UI VISIBLE:NO. P21 remains active.

## Verification completed before publication

- Dedicated static ownership verifier passed.
- P16.19 projection, Gate413 renderer binding, P17.10 production-renderer and P2 design-system verifiers passed unchanged.
- Focused projection/renderer/coordination suite: 3 files, 14 tests passed.
- TypeScript and production build passed.
- Full unit regression: 307 files, 1,266 tests passed.

The local runtime was Node24.19.0/npm11.9.0, so no exact-toolchain local claim is made. The canonical gate must use Node22.16.0/npm10.9.2, preserve Lightweight Charts5.2.1, run every current and historical check and upload both exact-run artifacts. Local evidence is not canonical PASS.
