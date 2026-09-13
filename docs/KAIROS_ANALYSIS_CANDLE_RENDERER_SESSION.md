# Analysis authoritative-history candle renderer session — 13 September 2026

## Scope

This bounded item-4 prerequisite gives the existing Analysis candle canvas one synchronous renderer handoff. `createAnalysisCandleRendererSession` creates the released production Lightweight Charts renderer, applies the selected Kairos chart theme, renders the caller-authoritative market-history snapshot, frames the latest 80 candles and returns that exact renderer instance. The returned object retains the released incremental `updateLatestCandle` method needed by the later live lifecycle mount.

`AnalysisCandleCanvas` now delegates its unchanged initial rendering to this owner and retains its existing React cleanup, theme-update, keyboard and button-control responsibilities. A failed initial render destroys the partially created renderer before the failure returns to the canvas.

## Preserved ownership

- P15/P16 continue to own provider identity, history and live market truth.
- P17 and `lightweightChartsV5ProductionRenderer` continue to own rendering and incremental chart-engine behavior.
- The caller continues to own selection, history limits, reconnect policy, live lifecycle mounting, visible connection state and route copy.
- No stream, request, timer, retry, provider default, persistence, journal calculation, execution, drawing, marker or Live Bubble behavior is introduced.
- The snapshot is rendered only as `market-reference`; `journalExecutions` stays empty.

UI VISIBLE:NO. Existing historical chart presentation and controls remain unchanged. This slice does not start live Analysis or claim provider connectivity.

## Evidence

- `tests/analysis-candle-renderer-session.test.ts` proves exact snapshot projection, theme application, viewport framing, identity-preserving return of the incremental renderer, and failure cleanup.
- `scripts/verify-analysis-candle-renderer-session.mjs` guards the handoff, cleanup and ownership boundaries.
- TypeScript, production build, focused/current/historical/browser regressions and the full canonical gate remain mandatory before promotion.
