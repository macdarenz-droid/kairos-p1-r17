# P21 next-responsibility source proof — 2026-09-08

Canonical authority remains P21.17 Live Market Summary Baseline State Orchestration Foundation via controlled gate #302 / run 34140732046, job 101801891405, head 50a0c1a0fd7424a7b75abf3c251b750e5f0a4a5d, full SUCCESS. Living architecture is current through P21.17 on engineering main 176f6752579540e598bf0c5f9493bb665ebc363b.

Fresh engineering Actions proof before this checkpoint: zero queued and zero in-progress runs.

## Source proof

Canonical P21.15 exposes `createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt)`, a browser-ready P21.4 acquisition-port factory that composes only the released P21.13 adapter and P21.14 browser connector while keeping observation time caller-owned.

Canonical P21.17 exposes `acquireLiveMarketSummaryBaselineIntoState(state, acquisitionPort, scope, options?)`, a provider-neutral one-shot orchestration that accepts an already-created P21.4 acquisition port plus existing P21.16 state and explicit caller-owned scope/options.

Exact default-branch source search for both released entry points found no production owner composing them. P21.17 explicitly forbids direct use of `createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(` inside its provider-neutral module, so P21.17 intentionally leaves the browser/provider binding outside its ownership.

Therefore the smallest dependency-safe next responsibility is a narrow Binance/browser baseline-state binding foundation that composes only the released P21.15 browser acquisition-port factory with the released P21.17 state orchestration seam.

## Proposed contract

A browser-ready function/factory accepts:
- existing `LiveMarketSummaryDeliveryState`;
- caller-owned `BinanceSpot24hPublicRestBaselineObservedAtSource` / `readObservedAt`;
- explicit caller-owned market scope;
- optional caller-owned acquisition options carrying `signal?: AbortSignal`.

It creates the released P21.15 acquisition port exactly once for the invocation/binding, delegates baseline acquisition/state application only through released P21.17, and preserves P21.17 `acquisition-failed` / `delivery-invalid` plus exact-prior-state semantics unchanged.

## Explicit non-scope

No market universe/scope selection; no ranking/filtering/grouping/sorting/Bubble metric/color/geometry/Home wiring; no new fetch/Response/endpoint/query/provider mapping/HTTP status/error/retry/rate-limit/credentials/timeout policy; no Date/clock/observation-time acquisition/timestamp arbitration/freshness TTL/stale eviction/polling/reconnect/scheduling/randomness; no state store/persistence/IndexedDB/journal/Your Trades/Saved Analysis/chart/transitions; no new delivery-validation/completeness semantics.

This checkpoint is source proof only. No P21.18 candidate/helper/gate or production implementation is canonical from this file.