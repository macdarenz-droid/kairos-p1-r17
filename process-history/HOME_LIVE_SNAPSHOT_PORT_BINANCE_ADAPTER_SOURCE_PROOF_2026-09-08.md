# Source Proof — Binance Adapter for Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port

Date: 2026-09-08

## Canonical starting authority

Latest canonical GOLDEN remains the patch-numberless **Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Contract Foundation** via gate #309 / run `34170279174`, job `101889120990`, exact head `17c424c2c8b47b71b8d545d5040eea8f41eb8559`, full SUCCESS.

Primary architecture reconciliation is COMPLETE on engineering main `3038d7037f209d9e2893337853338f94ad6baeb9`. Fresh Actions at source-proof start showed zero queued and zero in-progress runs.

## Exact source evidence

Canonical artifact inspection proves:

1. `src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort.ts` defines a provider-neutral application-facing port outside React. Its `acquire(scope, options?)` accepts only explicit caller-owned `readonly MarketDataInstrument[]` scope plus optional `signal?: AbortSignal` and returns only released `LiveMarketSummaryBaselineStateOrchestrationResult` + `readonly LiveMarketSummaryScopedStateSnapshotEntry[]` truth.
2. The port's own canonical source comment explicitly states: **“A later adapter may bind this port to an already-released provider capability without moving provider choice or live-market semantics into Home presentation.”**
3. Released P21.23 provider capability `acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(...)` already accepts an existing released `LiveMarketSummaryStateSession`, caller-owned `readObservedAt`, explicit caller-owned scope and optional `signal?: AbortSignal`; it performs the released browser acquisition + scoped snapshot composition and returns the same orchestration/snapshot result shape needed by the Home port.
4. Released `LiveMarketSummaryStateSession` already owns provider-neutral in-memory state. Therefore an adapter does not need to create, reset, persist, subscribe to, rank, or otherwise reinterpret state.
5. `HomeRoute.tsx` remains presentation-only and still says no dashboard insights are connected. Therefore Home React wiring is not part of this adapter slice.

## Source-proven smallest next responsibility

**Binance Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Adapter Foundation** — patch number intentionally not inferred.

The smallest dependency-safe responsibility is a provider-owned adapter/factory that binds the already-canonical provider-neutral Home Dashboard acquisition port to the already-released P21.23 Binance browser/session scoped-snapshot acquisition composition.

Proven contract:
- accept an existing released `LiveMarketSummaryStateSession` and caller-owned released Binance `readObservedAt` dependency at adapter construction/binding time;
- return/implement `HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort`;
- for each explicit `acquire(scope, options?)`, delegate exactly once to released `acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(session, readObservedAt, scope, options)`;
- forward the exact caller-owned scope and optional signal unchanged;
- return the released P21.23 result unchanged/structurally identical, adding no semantic translation.

## Explicit non-scope

No new `LiveMarketSummaryStateSession` creation/reset/lifecycle owner; no clock/readObservedAt creation; no Home React wiring/hooks/effects/UI state/loading/error rendering; no default universe/scope; no ranking/filtering/grouping/sorting/top-N/popularity/market-cap; no Bubble sizing/color/geometry/interactions/animation; no Your Trades/journal ownership; no freshness/TTL/stale eviction/polling/reconnect/scheduling/background work; no new transport/endpoint/status/header/error/retry/rate-limit/timeout/credentials policy; no new AbortController/signal combination/concurrency/coalescing/subscription framework; no persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership; no reinterpretation or duplication of released P21.23 semantics.

## Product/data invariants

- Live Crypto Bubble Map remains sourced only from authoritative live/current market/provider truth.
- Your Trades Bubble Map remains sourced only from authoritative journal/trade history plus released calculation truth.
- These owners never merge.
- UI must not read IndexedDB directly.
- Dashboard transitions remain presentation-only.

## Mutation status

No production adapter, helper, candidate, gate retarget, Home wiring, default scope, ranking/freshness/retry/subscription/persistence/Bubble/transition implementation has been started from this proof.

## Next safe action

Re-prove latest canonical GOLDEN, primary architecture map, this source-proof checkpoint, and fresh zero-competing Actions. Under a verified execution lease, create exactly one minimal NON-CANONICAL deterministic reconstruction helper/candidate for this adapter responsibility only. Verify focused delegation/identity tests, typecheck/build/full regression, exact controlled delta and clean package boundary before any canonical gate retarget.