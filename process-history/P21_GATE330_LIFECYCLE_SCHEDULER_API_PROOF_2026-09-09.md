# P21 Gate330 Lifecycle/Scheduler API Proof — 2026-09-09

Invocation token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-LIFECYCLE-SCHEDULER`

## Fresh canonical authority
- Fresh `main`: `c2372fec3cf4561239640414c04bd12a429cdff5` (`docs: record Gate330 cadence ownership`).
- Latest exact canonical authority: `Kairos Controlled Roadmap Gate` #330 / run `34343615836` / head `33dfcd7d52c6377503acde868fa803121d565895` completed `success`.
- Gate330 remains the latest FULL canonical PASS / GOLDEN.
- Exact Gate330 `KAIROS_CURRENT_CANDIDATE` artifact id `10101215486` was downloaded and inspected in this invocation.

## Exact source evidence
The exact canonical Gate330 artifact proves:
- `src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionCadencePolicy.ts` owns only the deterministic product cadence: visible `entry|resume|periodic` => acquire now and next visible acquisition after exactly `5000ms`; hidden => no acquisition/no next schedule.
- `src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort.ts` is the provider-neutral one-shot acquisition port and explicitly states that the caller owns scope and cancellation; `acquire()` accepts an optional caller-owned `AbortSignal`.
- `src/services/market-data/liveMarketSummaryStateSession.ts` does not serialize concurrent transitions: each transition receives the current state at invocation and commits its eventual result. Therefore overlapping acquisitions can race stale state transitions and must not be allowed by the lifecycle owner.
- `src/services/market-data/marketDataReconnectScheduler.ts` establishes Kairos' injected `{schedule,cancel}` timer seam and idempotent cancellation conventions.
- `src/services/market-data/marketDataSubscriptionLifecycle.ts` establishes idempotent lifecycle shutdown and AbortSignal cleanup conventions.
- The Binance Home acquisition-port adapter owns provider binding only and forwards the exact caller-owned AbortSignal; session lifecycle remains caller-owned.
- Fresh source search found no existing Home/live-market timer/Page Visibility lifecycle owner.

## Frozen smallest next responsibility
Create one provider-neutral application-layer owner in `src/application/dashboard` for Home live-market acquisition lifecycle/scheduling, consuming the released Gate330 cadence policy plus released one-shot acquisition port.

Required semantics for this first lifecycle/scheduler slice:
1. `entry` while visible starts acquisition immediately and arms exactly one 5000ms next-visible tick.
2. A periodic visible tick starts the next acquisition at the approved fixed cadence and re-arms exactly one 5000ms tick.
3. Because the released state session does not serialize concurrent transitions, a new visible tick aborts any still-in-flight prior acquisition before starting the new one: latest-tick-wins, preventing stale concurrent transitions while preserving exact 5-second acquisition starts.
4. Transition to hidden cancels any pending tick and aborts any in-flight acquisition; no hidden acquisition is scheduled.
5. Hidden -> visible is `resume`: immediate acquisition plus one 5000ms next-visible tick.
6. Explicit `close()` is idempotent, cancels pending schedule, aborts in-flight acquisition, and prevents later scheduled callbacks from doing work.
7. Expected lifecycle-driven aborts do not surface as acquisition errors/results. Current non-aborted success/error may be forwarded through caller-owned observer callbacks without moving snapshot/UI semantics into this owner.
8. Scheduler is injected through an application-local `schedule(callback, delayMs)` / `cancel(handle)` interface. This candidate must not wire `setInterval`, `setTimeout`, `document.visibilityState`, DOM listeners, React, or provider APIs.

## Non-scope
- no browser/Page Visibility adapter or DOM event listener;
- no provider transport/provider selection;
- no session construction or state semantic rewrite;
- no observedAt/freshness ownership;
- no universe eligibility/stablecoin/order/Top-N ownership;
- no persistence;
- no Home/React/Bubble presentation;
- no chart/navigation/transitions;
- no journal/Your Trades truth.

## Why latest-tick-wins is the dependency-safe race rule
The approved product contract requires starts immediately on entry/resume and every 5 seconds while visible. Scheduling only after a prior request settles would weaken that exact cadence by adding request duration. Allowing overlap would permit non-serialized state transitions to race. Aborting the prior caller-owned request immediately before each fixed tick is therefore the smallest reversible technical coordination that preserves both the approved cadence and one-authoritative-state transition order, using already-released cancellation semantics.

## Next controlled action
From the exact Gate330 root candidate, construct exactly one NON-CANONICAL deterministic lifecycle/scheduler candidate with a focused source/test/verifier/report/package delta; prove exact scope, pinned toolchain, dedicated lifecycle checks, cadence/acquisition-port/state-session dependency regressions, typecheck/build, full unit and registered verifier regression, clean packaging, ZIP integrity, artifact identity, root placement and helper self-clean. Helper success remains non-canonical. Canonical gate retarget is forbidden until exact candidate identity/scope is proven.
