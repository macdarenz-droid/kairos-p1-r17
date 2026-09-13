# Analysis live-candle browser runtime sources — 13 September 2026

## Gate416 failure and deterministic R1 repair

Gate416/run34726183322/job103640583096/head79d9af022814e5fe5f9b1450a8f7fcbab8a22707 is failed evidence only. Steps 1–34 passed, including exact archive/scope, the dedicated browser-source checks, TypeScript, production build, real-browser evidence, the full unit suite and the full controlled-roadmap suite. Historical closures then failed one inherited saved-trade-review fixture.

The failure was a test-date rollover, not a product or browser-source defect. The fixture inserted 501 records with the fixed timestamp `2026-09-13T00:00:00.000Z` and asserted that the original record was older. The canonical run crossed that timestamp, so the newly saved original correctly sorted ahead of those supposed “newer” records. R1 retains Gate416's production bytes and changes only that fixture timestamp to the deterministic maximum ISO instant `9999-12-31T23:59:59.999Z`. This continues to prove exact older-identity loading beyond the 500-item recent window without depending on wall-clock date. Five consecutive focused runs passed, 9/9 tests each; the full 309-file/1,275-test suite, TypeScript, production build and dedicated browser-source verifier also passed. No expectation, product behavior or verifier is weakened. Gate415 remains GOLDEN until R1 completes every canonical stage and both artifact checks.

## Canonical base

Built only from FULL Gate415/run34723630274/job103633815666/head1e63f7d1ea334ee7c481e0deffec89e1153ca631. All 36 canonical steps succeeded. Exact-run nonexpired artifacts `KAIROS_CURRENT_CANDIDATE`10307351710 and `KAIROS_GATE_EVIDENCE`10307675596 were downloaded and matched their artifact digests. The nested candidate is `KAIROS_ANALYSIS_LIVE_CANDLE_BROWSER_SUBSCRIPTION_COMPOSITION_CANDIDATE_2026-09-13.zip`; 3,646,839 bytes; SHA-256 `30176109b6552494d61517241af7bc568a1ccfd5f3fa199bb3d7a27c02118ec4`; Git blob `8ad0bfa11d4ff9aff7d842bf4ba3984aed85b47b`; exact `kairos_p76/` root and clean ZIP integrity. Gate414 is the rollback.

## One bounded responsibility

`src/app/binanceAnalysisLiveCandleBrowserRuntimeSources.ts` supplies only production browser mechanics needed by the released Gate415 subscription composition:

- receipt timestamps read the current browser clock only when requested;
- the scheduler delegates exact callbacks, delays, handles and cancellation to browser timeouts;
- reconnect entropy reads one current `Math.random()` sample only when requested;
- an injected host factory keeps all mechanics deterministic and independently testable.

P15 retains reconnect policy, attempt limits, delay planning and jitter validation. P16 retains transport/reconnect execution. Gate415 retains subscription-to-candle-session composition. The Analysis caller still owns selected scope, initial history, backfill execution, route/session replacement, hidden/offline behavior and visible status.

## Preserved boundaries

No reconnect policy values, background timer, subscription, socket, fetch, history request, route mount, UI, persistence, IndexedDB, schema, journal write, financial calculation, execution inference, FX, drawing, marker, Live Bubble or provider expansion is introduced. Importing the module creates no timer or market connection. UI VISIBLE:NO. P21 remains active.

## Verification completed before publication

- Dedicated static ownership verifier passed.
- Gate415 subscription composition, Gate414 coordination, P16.17 reconnect subscription, P15 scheduler and P15 jitter verifiers passed unchanged.
- Focused source/subscription/coordination/reconnect suite: 4 files, 17 tests passed.
- TypeScript and production build passed.
- Full unit regression: 309 files, 1,275 tests passed.

The local runtime was Node24.19.0/npm11.9.0, so no exact-toolchain local claim is made. The canonical gate must use Node22.16.0/npm10.9.2, preserve Lightweight Charts5.2.1, run every current and historical check and upload both exact-run artifacts. Local evidence is not canonical PASS.
