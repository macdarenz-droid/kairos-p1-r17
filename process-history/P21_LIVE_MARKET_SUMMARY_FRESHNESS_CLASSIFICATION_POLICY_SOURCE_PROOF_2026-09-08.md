# P21 Live Market Summary Freshness Classification Policy — Source Proof

Date: 2026-09-08
Worker: W16-P21-FRESHNESS-POLICY-20260908T1427AEST

## Re-proved authority
- Latest canonical GOLDEN: **Binance Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Adapter Foundation** via `Kairos Controlled Roadmap Gate` #311 / run `34173799325` / job `101899109660` / exact head `69f39d09b9574ae5d9bf9fd963aff18324ca2844`, full SUCCESS.
- Exact gate #311 artifacts remain `KAIROS_CURRENT_CANDIDATE` id `10036804259` and `KAIROS_GATE_EVIDENCE` id `10036804501` with their previously recorded exact sizes/digests.
- Engineering `main` re-proved at `84e4b8a0b0494ec73e9eac64e5a19ae034254355` and primary architecture reconciliation remains complete.
- Fresh Actions show no newer competing engineering chain.

## Current user product authority
The user-approved P21 Live Crypto Bubble Map V1 contract resolves the prior freshness product-semantic blocker. Freshness is based on canonical caller-owned `observedAt`, with deterministic classes:
- `fresh`: age <= 15,000 ms
- `stale`: age > 15,000 ms and <= 60,000 ms
- `expired`: age > 60,000 ms

The same approved contract keeps freshness policy separate from provider adapters and presentation, preserves last authoritative facts on acquisition failure, and assigns visible-dashboard cadence/presentation behavior to later owners.

## Smallest dependency-safe responsibility
**Live Market Summary Freshness Classification Policy Foundation** only.

Create one provider-neutral deterministic policy owner above released market facts and below presentation that maps an already-computed non-negative observation age in milliseconds to `fresh | stale | expired` using configurable policy thresholds whose V1 defaults are 15s / 60s.

Why this is first:
- It encodes only the newly approved freshness business semantics.
- It does not require Binance/provider changes.
- It does not require choosing or wiring an application clock/evaluation-time owner yet.
- It does not require acquisition cadence, visibility handling, Home React state, or Bubble presentation.
- It is independently testable at exact boundary values and can be consumed later by an observedAt/evaluation-time projection without moving policy into UI/provider code.

## Explicit non-scope
No `Date.now()`/`new Date()`/internal wall clock; no parsing or ownership of evaluation time; no acquisition, polling, scheduling, visibility/resume handling, retries or cancellation; no provider/Binance transport changes; no universe selection/ranking/filtering/top-N/stablecoin policy; no Home React wiring/hooks/UI state; no stale dimming or expired rendering; no Bubble geometry/size/color/interactions; no Your Trades/journal ownership; no persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership.

## Next safe action
Under a verified execution lease, create exactly one NON-CANONICAL deterministic reconstruction helper from the exact canonical #311 candidate. Its candidate delta must be limited to the freshness policy source/export, focused boundary tests, dedicated verifier/report, and package verifier registration. Require pinned toolchain, typecheck/build, focused tests, full regression, clean package boundary and ZIP integrity. Helper PASS remains non-canonical; canonical gate retarget is forbidden until exact candidate identity/integrity is proven.
