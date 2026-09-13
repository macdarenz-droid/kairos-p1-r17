# Kairos Analysis live-candle React binding

Date: 13 September 2026  
Roadmap owner: item 4 live candle continuity (P15/P16 + P17)  
UI visible: no

## Responsibility

This bounded item-4 amendment adds one React lifecycle/state binding around the released Gate430 Analysis live-candle route session. It creates one released route session for the mounted hook, replaces the exact caller-selected container/instrument/interval scope through that same session, retains exact raw lifecycle observations for a later presentation owner, applies theme-only changes without reacquiring history, and closes the session once on unmount.

The binding uses a caller revision only as an explicit reacquisition key. Both the released Gate430 generation guard and the binding's current-session ticket suppress callbacks and promise completions from superseded selections. Synchronous construction/activation failures and rejected activation promises are retained as raw errors; no status wording is inferred.

## Exclusions

This slice does not mount the Analysis route, replace the historical workspace, render status/copy, create a canvas or own viewport controls. It starts no request, stream, timer or subscription outside Gate430. It introduces no provider default/expansion, persistence, IndexedDB access, journal mutation, calculation, execution inference, FX, drawing, marker or Live Bubble behavior. P15/P16 retain provider and reconnect truth; P17 retains renderer behavior; Gate430 retains route-session composition. UI VISIBLE:NO. P21 remains active.

## Evidence

- The dedicated verifier requires delegation to Gate430, exact observation forwarding, selection-ticket suppression, theme-only updates and close cleanup, while rejecting route, transport, timer, persistence, journal, calculation, marker and visible-copy ownership.
- Focused React tests prove one session per mount, exact selection forwarding, raw observation retention, authoritative-snapshot success, theme stability, same-session replacement, stale suppression, revision refresh, rejected activation, construction failure and idempotent unmount cleanup.
- TypeScript, production build, all current/historical/browser regressions and exact candidate/artifact verification remain mandatory before promotion.
