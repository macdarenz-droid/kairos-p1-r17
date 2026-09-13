# Kairos Analysis live-candle route session

Date: 13 September 2026  
Roadmap owner: item 4 live candle continuity (P15/P16 + P17)  
UI visible: no

## Responsibility

This bounded item-4 amendment composes the released production live-candle lifecycle, route product policy and authoritative-history renderer handoff for one caller-selected Analysis scope. `createAnalysisLiveCandleRouteSession` supplies the exact 500-candle history limit and frozen four-attempt/1-second/8-second reconnect policy, creates the same production renderer used by the authoritative page and incremental updates, and owns renderer replacement and cleanup.

Selection replacement invalidates old callbacks and destroys the previous renderer before a new authoritative snapshot can be presented. Delayed history uses the latest caller-selected theme. Failed initial activation, failed authoritative gap recovery and failed browser resume remove the renderer claim. Close invalidates callbacks, closes the released lifecycle and destroys the renderer idempotently.

The route caller remains authoritative for the exact metadata-backed Binance Spot instrument and interval, DOM container, selected theme, viewport controls and state presentation. Availability, activation, connection, disposition, backfill and error observations are forwarded without changing their meaning.

## Exclusions

No React effect or route is mounted. No visible status or copy changes. No history, stream, socket, timer or retry mechanism is reimplemented. No provider expansion/default, persistence, IndexedDB access, journal mutation, calculation, execution inference, FX, drawing, marker or Live Bubble behavior is introduced. P15/P16 retain provider and reconnect truth; P17 retains renderer behavior; Gate423 retains lifecycle composition. UI VISIBLE:NO. P21 remains active.

## Evidence

- The dedicated verifier requires exact use of the released lifecycle, policy constants and renderer-session owner, and rejects React, transport, timing, persistence, journal and marker ownership.
- Focused tests prove exact policy handoff, identity-preserving renderer return, latest-theme behavior, replacement ordering, stale callback suppression, activation/recovery/resume failure cleanup and idempotent close.
- TypeScript, production build, all current/historical/browser regressions and exact candidate/artifact verification remain mandatory before promotion.
