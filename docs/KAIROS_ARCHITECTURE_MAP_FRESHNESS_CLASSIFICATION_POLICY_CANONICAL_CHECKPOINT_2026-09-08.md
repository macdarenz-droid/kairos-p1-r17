# KAIROS Architecture Checkpoint — Live Market Summary Freshness Classification Policy Foundation

## Canonical authority
`Kairos Controlled Roadmap Gate` #312 / run `34188023039`, job `101940182795`, exact head `ef0e9ff05802ee1a4d84b04ab4815ecaf010154c`, completed full SUCCESS on 2026-09-08.

Exact canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` id `10041358029`, size `1,264,322`, digest `sha256:0de5538c535efa534c5a5520dd97022c5994cede8e0e4625d6e60c17f53b22e5`.
- Downloaded candidate wrapper contains exactly `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_FOUNDATION_CANDIDATE_2026-09-08.zip`, inner size `1,469,920`, SHA-256 `64435ec7d4af49a27b7c09cb12241a9ec8639d55962a4b71dbb200aa90f5bdca`; outer and inner ZIP integrity PASS.
- `KAIROS_GATE_EVIDENCE` id `10041358329`, size `1,245`, digest `sha256:b7844cae36314ca01d308eca40425b97dc8ec7e3e15cac06e345d077e871131d`.
- Downloaded evidence wrapper contains exactly `KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_FOUNDATION_REPORT_2026-09-08.md`, inner size `1,880`, SHA-256 `7fc7bfd58bb143d52ba65f70d7d37a296534bfc96739bb7e1b4028e21317a58b`; wrapper ZIP integrity PASS.

## Canonical responsibility
Provider-neutral deterministic freshness-classification policy above released market facts and below presentation. The owner maps an already-computed caller-owned observation age in milliseconds to `fresh | stale | expired`.

V1 policy defaults are `freshMaxAgeMs = 15_000` and `staleMaxAgeMs = 60_000`. Classification is `fresh` for age <=15,000ms, `stale` for age >15,000ms and <=60,000ms, and `expired` for age >60,000ms.

Production owner seam: `src/services/market-data/liveMarketSummaryFreshnessClassificationPolicy.ts`, exported through `src/services/market-data/index.ts`.

## Boundary / non-scope
This owner does not own `Date.now()` / `new Date()` / internal wall clocks, `observedAt` parsing, evaluation-time ownership, acquisition, polling, scheduling, visibility/resume behavior, retries, cancellation, Binance/provider transport, universe/default scope/ranking/filter/top-N/stablecoin policy, Home React wiring, stale/expired presentation, Bubble geometry/size/color/interactions, Your Trades/journal truth, persistence/IndexedDB/Saved Analysis/chart/navigation/transition truth.

A later separately controlled owner may compute deterministic observation age from canonical `observedAt` plus caller-owned evaluation time and consume this policy. Universe policy, visible-dashboard cadence, and stale/expired presentation remain separate responsibilities.

## Gate proof
Every canonical stage passed: authoritative extraction, exact six-file scope proof, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated freshness-policy verifier/runtime, full unit regression, full controlled-roadmap regression through canonical P21.23 plus Home port/Binance adapter/freshness policy, historical closures, and both exact-run artifact uploads.

This checkpoint is additive architecture evidence. Primary `docs/KAIROS_ARCHITECTURE_MAP.md` must be consolidated integrity-preservingly before later ownership advances beyond this reconciliation boundary.
