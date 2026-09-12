# Standalone historical Analysis candles — UI integration amendment

## Authorization, base and visible behavior

The user said “Okay continue” after the Gate406 completion and proposed historical Analysis dependency. They separately asked to discuss an amount/leverage/ETH-size button later. This candidate implements only the next bounded historical chart composition. Leverage input, amount semantics, margin/lot conversion and financial calculations are deferred discussion, not part of this release.

Base: FULL Gate406/run34699361404/head02a0efe039cad60119336f590d9f4f039c3e921e, all33actual stages and both exact-run artifacts. Source ZIP KAIROS_BINANCE_SPOT_CANDLE_HISTORY_FOUNDATION_CANDIDATE_2026-09-12.zip,3500259bytes,SHA25625673f82dca0dd8b529f3b2d5330af48c5aa7c3ed6c656f7a8201bef038d9c5d. Current root documentation from completion child d491df6c1d25c70ebb99e0c9fa0a7a241e44482e is carried forward.

UI VISIBLE: YES. Analysis now mounts a market chart above optional saved-trade review. Explicit Binance Spot symbol selection comes from existing exchangeInfo metadata; timeframe selection uses the passed16interval contract. There is no silently selected symbol or timeframe. A single request loads the latest available page of up to500UTC candles, initially showing the most recent80. Fit candles shows the loaded page; touch pan/pinch, crosshair, keyboard arrows/+/-/Home and zoom buttons operate on it. Native vertical touch scrolling stays available. Market quote units and receipt time are shown. Exact supplied OHLC decimals remain available in the accessible candle-values table.

This is a historical snapshot refreshed by the user. It is not a continuously updating live feed, full historical pagination, saved analysis, time-assisted estimated trade, actual execution overlay, drawing or risk/reward tool. No journal price, quantity, currency, P&L, bubble sizing, persisted schema, backup or provider policy changes. Journal and Your Trades exact-ID review links and saved-fact display remain intact; choosing a trade does not guess its exchange or remap its symbol.

## Ownership and implementation

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Chart-first composition | AnalysisRoute.tsx + AnalysisHistoryWorkspace.tsx | Ephemeral explicit selection, metadata eligibility, request cancellation/deadline and stale-result rejection; no saved truth |
| Production provider binding | analysisHistoryPorts.ts | Existing exchangeInfo metadata port, Gate406 candle port/native connector, injected receipt clock |
| Canvas mount/theme/unmount | AnalysisCandleCanvas.tsx | Existing P17 production renderer and P2/P3 chart theme; no financial projection or storage |
| Vendor presentation | lightweightChartsV5ProductionRenderer.ts + existing module adapter | One chart/series lifecycle, theme applyOptions preserves viewport, vendor autoSize, pan/zoom/fit, deterministic English labels and display precision |
| Theme styles | analysisHistory.css | Registered design-system tokens, responsive bounded chart and scrollable exact-value table |

Each request has its own15second deadline and AbortController. Selection change, retry or unmount aborts prior work; late/uncooperative completions cannot replace a newer selection. Returned request scope is checked again before display. Duplicate/foreign/halted metadata identities are not selectable. Empty data, metadata failure, transport failure, rate limit and region/access errors have explicit states. There is no background retry, alternative-provider proxy, synthesized candle or automatic journal mutation.

The chart converts prices only at the existing presentation boundary. Axis display precision derives from supplied decimal places, capped at12; nonzero prices below that display resolution fail explicitly instead of becoming zero. Exact table values stay intact. This is display formatting, not an inferred instrument tick size or financial calculation. Lightweight Charts5.2.1 remains pinned, with visible attribution/logo and its TradingView link. No dependency or lockfile change.

## Validation and publication status

Candidate requires its own full canonical gate and both exact-run artifacts before GOLDEN. Dedicated tests cover selection/no aliases, eligibility, cancellation/stale/out-of-order responses, scope mismatch, timeout, manual refresh, metadata retry, unmount, renderer theme/viewport stability and idempotent cleanup. Browser regression uses explicit fixture payloads through the production native connectors and the installed renderer; it verifies canvas candle pixels, tiny decimal values, touch pan/pinch, keyboard controls,320/390/768/1280widths across all3themes, failure/empty/retry states and unchanged database facts. A separate unmocked native-browser provider request is recorded in evidence. Fixture success is never represented as real provider connectivity.

Preserve the complete previous workflow, all registered and historical verification, existing Journal/bubble browser scripts and both canonical artifact uploads. Add this slice's unit/static/browser evidence and exact archive-delta check. No gate weakening, phase closure, P22 progression or worker restart. After FULL PASS provide the exact Cloudflare build and visible review path, and await fresh continuation for the next slice.

## Next dependency

Preserved trade-review browser regression also passed: real Journal save and Your Trades links, exact IDs/direct URLs/reload, repeated symbols, plan/execution/fee/result boundaries, missing state, unchanged saved facts and320/390px across all3themes. Historical source ZIPs and verification scripts are not weakened.

Local evidence before freeze: pinned Node22.16.0/npm10.9.2 clean-install P1 gate passed typecheck,303testfiles/1250tests and production build. All16P17static verifiers passed after preserving the module adapter's vendor-package import boundary; the new composition verifier passed after renaming the timeframe state setter to avoid confusion with a timer. Final dedicated9tests/typecheck passed. Real Chromium regression passed12viewport/theme combinations, actual canvas colors, touch pan/pinch, keyboard, exact tiny-decimal table values, failure/empty/retry and unchanged saved database facts. The separate unmocked browser request to Binance returned TypeError: Failed to fetch locally; actual provider connectivity is not claimed. Canonical evidence must still pass before release promotion.

Time-assisted readonly trade preview/reference provenance can follow this historical chart, before continuous live updates. Its approximation policy and precise manual markers need their own controlled slice. Durable snapshots need P20/P5/P6 contract and persistence work. Existing live/drawing/RR/save integration remains open. The amount/leverage/base-asset-size button is recorded for later discussion only; its input semantics must be agreed before any implementation.

## Primary API references consulted

- https://tradingview.github.io/lightweight-charts/docs (5.2 renderer and attribution)
- https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ChartOptionsImpl (autoSize, appearance and interactions)
- https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HandleScrollOptions (horizontal versus vertical touch handling)
- Gate406's documented Binance Spot historical endpoint contract is reused unchanged.

## Gate407 repair — design-system geometry ownership

Gate407/run34703312431/job103578774742 failed at the unchanged P2 design-system verifier: analysisHistory.css contained a literal 160px minimum height and 280px maximum height outside the registered owner. Archive identity, exact Gate406 delta, extraction and deterministic install all passed. Gate406 remains the latest FULL canonical GOLDEN;407 is failed evidence only.

R1 was reconstructed from the exact FULL Gate406 archive plus the proven19-file approved Analysis delta. It moves the canvas clamp, empty-state minimum height and table maximum height into src/design-system/tokens.css and the matching geometryTokens.layout entries. CSS now consumes those registered values. All values are identical to the original candidate; calculations, chart behavior and the UI appearance are unchanged. No verifier, dependency or lockfile is modified.

Targeted local repair evidence: all six commands from the previously failed canonical design-system step pass, and verify-analysis-history-workspace passes. Resolving the three new geometry variables reproduces the original Analysis CSS byte for byte. The earlier1250-test/build evidence belongs to the original candidate; full unit/build/browser/historical checks were not rerun locally for R1 and are required by the next canonical gate. The workflow retains every existing stage and both artifact uploads, updates only candidate identity and the exact delta allowlist, and continues to pin FULL Gate406 as base.

User instruction: fix the failed gate, preserving the existing approved chart slice. No next feature, deployment, GOLDEN promotion or automation restart is claimed. Next safe action is to verify the exact R1 canonical run and, only after full success plus both artifacts, provide the build for visible review.
