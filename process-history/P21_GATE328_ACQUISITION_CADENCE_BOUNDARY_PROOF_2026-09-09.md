# P21 Gate328 acquisition cadence boundary proof — 2026-09-09

## Run identity
- Worker contract: `KAIROS-FAST-RELAY-V16-2026-09-08-16M`
- Worker token: `W16-SAME-WORKER-16M-20260908-A`
- Invocation lease token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-CADENCE-POLICY`

## Before-state
- Fresh main before project mutation: `1b7d54d496835f484141f3a31160b5caac7f2431` (`docs: record Gate328 Top-N ownership`).
- Latest full canonical PASS/GOLDEN: `Kairos Controlled Roadmap Gate` #328 / run `34335714535` / job `102414496925` / head `c93fa242e2d79684ccddd844718c286dc752cc86`.
- Gate328 exact-run required artifacts were already verified: `KAIROS_CURRENT_CANDIDATE` id `10098089352`, digest `sha256:5ef6f871f05b63ddc20133ec8e278154f446c9eaac82fd519435168429819ef9`; `KAIROS_GATE_EVIDENCE` id `10098089727`, digest `sha256:6d1392e18d54aa97e28e3e46baa05b71bdf0db1eb0439b9ddc927bb635ae80f2`.
- No newer canonical gate was queued or in progress when this boundary proof began.

## Fresh source/ownership evidence
1. Canonical application-facing Home market-data seam already exists at `src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort.ts` (Gate309). It accepts caller-owned scope and optional cancellation, returns released orchestration + scoped snapshot truth, and deliberately owns no provider/session/transport/universe/default scope/clock/ranking/freshness/retry/persistence/subscription/Bubble/UI/transition semantics.
2. Canonical Binance binding already exists at `src/services/market-data/providers/binance/binanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPortAdapter.ts`. It binds caller-owned session + `readObservedAt` and delegates each explicit acquisition to the released provider composition; it deliberately owns no session lifecycle, clock creation, Home React wiring, ranking/Top-N, freshness/TTL/polling/reconnect/scheduling/background work.
3. Canonical freshness classification is already a separate deterministic owner and explicitly excludes acquisition, polling, scheduling, page visibility/resume, retry, cancellation, and background work.
4. Gate328 Top-N ownership explicitly excludes cadence/acquisition and closes eligibility/order/Top-N selection responsibility before cadence.
5. User-approved P21 product contract requires: acquire immediately on entry/resume; acquire every 5 seconds while visible; suspend periodic acquisition while hidden. Those are Kairos product-policy decisions, not Binance/provider rules.

## Proven next responsibility
The smallest dependency-safe next responsibility is a **provider-neutral Home Dashboard live-market acquisition cadence policy** in the application/dashboard layer, above the already-released one-shot Home acquisition port and separate from provider transport, state/session ownership, freshness classification, universe selection, persistence, and React presentation.

The first slice should be deterministic policy only rather than browser/timer orchestration. It should own the product cadence decision boundary needed by a later lifecycle/scheduler adapter:
- visible periodic cadence = exactly `5000` ms;
- entry while visible => immediate acquisition;
- resume/transition hidden->visible => immediate acquisition;
- visible periodic trigger => acquisition according to the 5000 ms cadence;
- hidden state => periodic acquisition suspended;
- policy must not call `setInterval`, `setTimeout`, `document`, visibility APIs, provider fetch, session state, React hooks, or freshness classification itself.

This split keeps the approved 5-second/visibility semantics in one product-policy owner while leaving actual browser visibility observation and timer/cancellation wiring to a later adapter/orchestrator if source ownership subsequently proves it necessary.

## Explicit non-scope
- no Binance/provider endpoint, fetch/transport, decode/mapping, retry/rate-limit/timeout policy;
- no session creation/reset/state mutation or persistence;
- no `observedAt` generation or freshness FRESH/STALE/EXPIRED classification;
- no eligibility, stablecoin exclusion, quote-volume ranking, symbol tie-break, or Top-N selection;
- no React/Home component wiring, Bubble presentation, Your Trades truth, chart/navigation/transitions;
- no background acquisition while hidden;
- no actual timer or DOM visibility listener in this first deterministic policy slice.

## Verification plan for one candidate
Construct exactly one non-canonical candidate from Gate328 GOLDEN with a narrow five-file delta: report; package verifier registration; dedicated verifier; `src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionCadencePolicy.ts`; focused test. Verify exact scope, pinned Node 22.16.0/npm 10.9.2/Lightweight Charts 5.2.1, dedicated cadence verifier, affected tests plus upstream Home-port/freshness boundaries where available, typecheck/build, full unit regression, full registered verifier regression, clean `kairos_p76/` package, ZIP integrity, and artifact/root identity. Helper success remains non-canonical.

## After-state / next safe action
No cadence implementation/candidate/gate existed at the time of this checkpoint. Next safe action: refresh main + Actions; if still idle, create exactly one temporary non-canonical deterministic reconstruction/verification helper for the cadence-policy candidate above. After that write, refresh main + Actions and monitor only the exact helper if queued/in-progress. Gate328 remains GOLDEN until a later full canonical PASS.
