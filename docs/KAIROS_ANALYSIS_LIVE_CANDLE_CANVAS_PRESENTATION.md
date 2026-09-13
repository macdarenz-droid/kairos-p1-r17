# Kairos Analysis live-candle canvas presentation

Date: 13 September 2026  
Roadmap owner: item 4 live candle continuity presentation  
UI visible: no

## Responsibility

This bounded item-4 amendment adds the selected-scope React presentation component that will later replace the historical-only canvas. It owns one real chart container, mounts the released Gate432 lifecycle binding against the exact caller-supplied Binance Spot instrument, interval and refresh revision, and renders Gate433's provider-safe status facts. It delegates pan, zoom and fit controls to Gate432 without creating a renderer or second viewport state.

The component labels the exact selected symbol and interval, provides a keyboard-accessible chart group, exposes routine state through a polite status region and elevates only unavailable/error presentations to an alert. Raw provider or transport errors are never rendered.

## Exclusions

This slice does not import or mount the component in `AnalysisHistoryWorkspace` or `AnalysisRoute`, so the product UI is unchanged. The existing historical workspace remains the sole visible chart path until a later canonical route-integration slice. It makes no metadata choice, history request, provider call, stream, timer or policy decision and adds no persistence, IndexedDB access, journal mutation, calculation, execution inference, FX, drawing, marker or Live Bubble behavior. UI visible: no. P21 remains active.

## Evidence

- The dedicated verifier requires the released lifecycle hook, status projection, exact-scope label, accessible status and viewport delegation while rejecting route/history/provider/storage/calculation ownership.
- Focused component tests prove the exact DOM container and selected scope reach the binding, live/error copy stays truthful and safe, all existing buttons/keyboard commands delegate exact values, unsupported keys remain inert and unmount removes presentation.
- TypeScript, production build, all current/historical/browser regressions and exact candidate/artifact verification remain mandatory before promotion.
