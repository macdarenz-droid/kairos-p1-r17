# Kairos Analysis live-candle viewport controls binding

Date: 13 September 2026  
Roadmap owner: item 4 live candle continuity (P17 delegation)  
UI visible: no

## Responsibility

This bounded item-4 amendment extends the released Gate431 React binding with stable `pan`, `zoom`, and `resetView` commands. Each command asks Gate430 for its currently owned renderer at invocation time and delegates the caller's exact value to that renderer. It creates no renderer and retains no second viewport state.

The commands are inert while activation has not produced a renderer and after unmount has cleared the released session. They do not reacquire history, replace a selection, or change theme. Gate430 retains renderer replacement and cleanup; P17 retains viewport behavior and numeric interpretation.

## Exclusions

This slice does not mount the Analysis route or workspace, create a canvas, or render controls/status/copy. It does not choose viewport numeric policy. It starts no history request, stream, timer, or subscription. It adds no provider default/expansion, persistence, IndexedDB access, journal mutation, calculation, execution inference, FX, drawing, marker, or Live Bubble behavior. UI VISIBLE:NO. P21 remains active.

## Evidence

- The dedicated verifier requires delegation only through Gate430's current renderer and rejects renderer construction, route/component, provider, persistence, journal, calculation, and visible-copy ownership.
- Focused tests prove exact pan/zoom/reset delegation, one retained route session, no selection reacquisition, inert pre-render behavior, and inert post-unmount behavior.
- TypeScript, production build, all current/historical/browser regressions, and exact candidate/artifact verification remain mandatory before promotion.
