# Analysis live-candle browser subscription composition — 13 September 2026

## Canonical base

Built only from FULL Gate414/run34721256424/job103627429881/head37546d6fae3e21313320617672f73775679c137a. Every canonical stage succeeded. Exact-run nonexpired artifacts `KAIROS_CURRENT_CANDIDATE`10306362920 and `KAIROS_GATE_EVIDENCE`10306193222 were downloaded and matched their artifact digests. The nested candidate is `KAIROS_ANALYSIS_LIVE_CANDLE_PROJECTION_RENDERER_COORDINATION_CANDIDATE_2026-09-13.zip`; 3,639,661 bytes; SHA-256 `7486c927b2645d7bec0fe52b8aff641b91268fadae67a2681dfba0ef5795f9e5`; Git blob `06893acca20d9f0abceac4e9881c6f4591785608`; exact `kairos_p76/` root and clean ZIP integrity. Gate413 is the rollback.

## One bounded responsibility

`src/app/binanceAnalysisLiveCandleBrowserSubscriptionComposition.ts` composes two released owners without absorbing either:

- P16.17 `subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect` retains Binance browser transport, receipt time, reconnect scheduling/policy/sample and close lifecycle.
- Gate414 `createBinanceAnalysisLiveCandleProjectionRendererSession` retains exact instrument/interval identity, current candle, stale/gap/rejection disposition and P17 incremental rendering.
- This application boundary creates one session for the caller's exact scope, passes validated stream observations to it, reports every disposition and forwards connection state/errors unchanged.
- Gap observations emit the existing exact backfill request without rendering. Subscription validation failures and the returned close lifecycle are preserved unchanged.

The caller still owns initial history acquisition/render, authoritative backfill execution and session replacement, route selection/unmount, hidden/offline behavior and visible connection status. Those responsibilities require later bounded composition and browser evidence before Analysis may be described as continuously live.

## Preserved boundaries

No new WebSocket, fetch, timer, retry policy, history request, route mount, UI, persistence, IndexedDB, schema, journal write, financial calculation, execution inference, FX, drawing, marker, Live Bubble or provider-expansion behavior is introduced. P14/P18/P19 ownership and immutable recorded facts are unchanged. UI VISIBLE:NO. P21 remains active.

## Verification completed before publication

- Dedicated static ownership verifier passed.
- Gate414 coordination, P16.17 reconnect subscription, P16.19 candle projection, Gate413 renderer binding and P17.10 production renderer verifiers passed unchanged.
- Focused subscription/coordination/reconnect suite: 3 files, 14 tests passed.
- TypeScript and production build passed.
- Full unit regression: 308 files, 1,272 tests passed.

The local runtime was Node24.19.0/npm11.9.0, so no exact-toolchain local claim is made. The canonical gate must use Node22.16.0/npm10.9.2, preserve Lightweight Charts5.2.1, run every current and historical check and upload both exact-run artifacts. Local evidence is not canonical PASS.
