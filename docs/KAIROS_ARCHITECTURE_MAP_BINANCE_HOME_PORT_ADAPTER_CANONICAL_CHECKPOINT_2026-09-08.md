# Kairos Architecture Map — Binance Home Dashboard Acquisition Port Adapter Canonical Checkpoint

Canonical authority: `Kairos Controlled Roadmap Gate` #311 / run `34173799325`, job `101899109660`, exact head `69f39d09b9574ae5d9bf9fd963aff18324ca2844`, full SUCCESS on 2026-09-08.

## Canonical responsibility

**Binance Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Adapter Foundation**. Patch number intentionally not inferred.

Production owner seam: `src/services/market-data/providers/binance/binanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPortAdapter.ts`, exported through `src/services/market-data/index.ts`.

The adapter accepts an existing released `LiveMarketSummaryStateSession` plus caller-owned released Binance `readObservedAt` at binding time and implements the canonical Home Dashboard live-market scoped-snapshot acquisition port. Each `acquire(scope, options?)` delegates exactly once to released P21.23 with the same session, same caller-owned `readObservedAt`, exact caller-owned scope and unchanged options, and returns the released result unchanged.

## Exact canonical evidence

- `KAIROS_CURRENT_CANDIDATE`: artifact id `10036804259`, size `1,261,496`, digest `sha256:304239363cf6f273689c6aa4bb1e4086e63a4e5c9cade57f1ecda578426d8d8c`.
- Downloaded candidate wrapper contains exactly `KAIROS_BINANCE_HOME_DASHBOARD_LIVE_MARKET_SUMMARY_SCOPED_SNAPSHOT_ACQUISITION_PORT_ADAPTER_FOUNDATION_CANDIDATE_2026-09-08.zip`, inner size `1,465,879`, SHA-256 `54a210648d0559fd1638942e4d0e04c920d1cd11dbc6b0f8cdd284cde10284fe`; ZIP integrity PASS.
- `KAIROS_GATE_EVIDENCE`: artifact id `10036804501`, size `1,259`, digest `sha256:0fa3cc46239c942fcaf9a42e1cd85533064dd7572f8cc28334519acb6ada7445`.
- Downloaded gate-evidence wrapper contains exactly `KAIROS_BINANCE_HOME_DASHBOARD_LIVE_MARKET_SUMMARY_SCOPED_SNAPSHOT_ACQUISITION_PORT_ADAPTER_FOUNDATION_REPORT_2026-09-08.md`, inner size `1,871`, SHA-256 `56ec41b90572afcd9ef582d411a22f08300b66e57d317e5036e4d57fd9a98097`; ZIP integrity PASS.

Every required #311 stage passed: authoritative base/candidate extraction, corrected exact six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated Binance Home adapter verifier/runtime, full unit regression, full controlled-roadmap regression through canonical P21.23 plus Home port and Binance adapter, historical closures, and both exact-run artifact uploads.

## Explicit non-scope

No new session creation/reset/lifecycle owner; no clock/readObservedAt construction; no Home React wiring/hooks/effects/UI state; no default universe/scope; no ranking/filtering/grouping/sorting/top-N/popularity/market-cap; no Live Crypto Bubble presentation semantics; no Your Trades/journal ownership; no freshness/TTL/polling/reconnect/scheduling/background work; no new transport/endpoint/status/header/error/retry/rate-limit/timeout/credentials policy; no new AbortController/signal combination/concurrency/coalescing/subscription framework; no persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership; no duplication or reinterpretation of released P21.23 semantics.

Standing invariants remain: Live Crypto Bubble Map uses authoritative live/current market/provider truth only; Your Trades Bubble Map uses authoritative journal/trade history plus released calculation truth only; UI does not read IndexedDB directly; dashboard transitions remain presentation-only.

## Primary-map reconciliation status

This additive checkpoint preserves the newly canonical ownership without altering historical architecture entries. The primary `docs/KAIROS_ARCHITECTURE_MAP.md` still requires an integrity-preserving consolidation of this checkpoint before any later responsibility is source-proven or implemented.
