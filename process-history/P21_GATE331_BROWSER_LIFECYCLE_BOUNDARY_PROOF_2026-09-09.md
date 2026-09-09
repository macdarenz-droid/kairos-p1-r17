# P21 Gate331 Browser Lifecycle Boundary Proof — 2026-09-09

Run token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-BROWSER-LIFECYCLE`

## Before state
- Fresh `main`: `8c281d5643b071340744e965c71e6cc7ab858d9e` (`docs: record Gate331 lifecycle scheduler ownership`).
- Latest FULL canonical PASS/GOLDEN: `Kairos Controlled Roadmap Gate` #331 / run `34349963796`, head `1c176616f3147a5d8690c5375635b5248521fffb`, conclusion SUCCESS.
- No newer canonical gate, helper, candidate, or next-slice workflow was active when this proof began.

## Source/ownership evidence
Gate331 canonical architecture assigns `src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionLifecycleScheduler.ts` provider-neutral lifecycle/scheduler orchestration only. It consumes an injected scheduler and the released one-shot Home acquisition port, and explicitly excludes DOM/Page Visibility listeners and concrete timer APIs.

Exact Gate331 reconstruction evidence proves its public lifecycle seam is intentionally browser-agnostic:
- `enter()`
- `setVisibility('visible' | 'hidden')`
- `close()`
- injected `{ schedule(callback, delayMs), cancel(handle) }`

The scheduler verifier explicitly forbids `setTimeout`, `setInterval`, `document`, `visibilitychange`, and browser listener ownership inside Gate331.

Existing P21.23 browser state-session acquisition composition remains a provider/browser transport composition seam only: it performs one released browser acquisition, then one released scoped snapshot read; it owns no cadence, timer, or Page Visibility behavior.

Fresh repository search found no existing production `visibilitychange` / Page Visibility owner for Home live-market acquisition. Existing concrete browser API owners are environment/integration seams (for example `src/pwa/serviceWorkerRegistration.ts` owns `navigator.serviceWorker` wiring), while `src/main.tsx` is the application bootstrap/composition root that invokes browser-facing infrastructure without making those APIs application/domain truth.

## Proven next smallest responsibility
The smallest dependency-safe next P21 responsibility is a **browser environment lifecycle adapter** between the browser and released Gate331 lifecycle API.

Its contract should be restricted to:
- map initial `document.visibilityState` to Gate331 `visible` / `hidden`;
- subscribe to browser `visibilitychange` and forward only visibility changes to `lifecycle.setVisibility(...)`;
- provide concrete one-shot timer scheduling/cancellation to Gate331's injected scheduler using browser timeout APIs;
- call `lifecycle.enter()` exactly once when the adapter starts;
- on adapter close, remove the exact visibility listener and call `lifecycle.close()` exactly once; close remains idempotent.

This adapter must not own:
- the approved 5000ms cadence value (Gate330 remains owner);
- acquisition race/cancellation semantics (Gate331 remains owner);
- provider selection/transport, Binance request semantics, or state-session construction;
- caller-owned `observedAt` or freshness classification;
- universe eligibility/stablecoin exclusion/quote-volume ordering/Top-N;
- persistence;
- React/Home rendering, bubble geometry/color, navigation, or transitions.

## Placement conclusion
Do **not** put browser Page Visibility/timer APIs into the Binance provider adapter or Gate331 application lifecycle owner. Current Kairos structure separates browser infrastructure from application/domain truth, and the app bootstrap is a composition root. A dedicated browser-facing adapter/composition module should therefore remain an environment edge consumed by later bootstrap/Home composition, with React kept presentation-only.

The exact final source path/name for the candidate should be fixed by the reconstruction helper together with focused verifier evidence; no provider or React ownership widening is permitted.

## Tests/evidence actually run in this proof
Read-only/source evidence only in this step:
- fresh main and Actions state;
- Gate331 architecture addendum;
- exact Gate331 reconstruction source/test/verifier;
- current canonical gate scope;
- P21.23 browser acquisition-composition source;
- browser API ownership searches (`visibilitychange`, `document.addEventListener`, `navigator`, timers);
- app bootstrap and PWA service-worker browser-edge source.

No new production candidate tests are claimed yet.

## Next safe action
Construct exactly one NON-CANONICAL deterministic helper from the exact Gate331 GOLDEN candidate for this browser environment adapter, enforcing the smallest controlled delta and focused Gate331/browser-lifecycle regressions. Do not retarget the canonical gate until helper success proves exact candidate bytes, scope, packaging, and regressions.
