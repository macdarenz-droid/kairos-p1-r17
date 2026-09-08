# P21 Live Market Summary Freshness Classification Policy — Primary Architecture Map Consolidation COMPLETE

Date: 2026-09-08
Worker token: `W16-P21-FRESHNESS-POLICY-PRIMARY-MAP-20260908T1514AEST`

## Canonical authority

Latest canonical GOLDEN remains **Live Market Summary Freshness Classification Policy Foundation** (patch number intentionally not inferred) via exact `Kairos Controlled Roadmap Gate` #312 / run `34188023039`, job `101940182795`, exact head `ef0e9ff05802ee1a4d84b04ab4815ecaf010154c`, full SUCCESS.

Exact canonical artifacts remain:
- `KAIROS_CURRENT_CANDIDATE` id `10041358029`, size `1,264,322`, digest `sha256:0de5538c535efa534c5a5520dd97022c5994cede8e0e4625d6e60c17f53b22e5`.
- `KAIROS_GATE_EVIDENCE` id `10041358329`, size `1,245`, digest `sha256:b7844cae36314ca01d308eca40425b97dc8ec7e3e15cac06e345d077e871131d`.
- Candidate inner ZIP size `1,469,920`, SHA-256 `64435ec7d4af49a27b7c09cb12241a9ec8639d55962a4b71dbb200aa90f5bdca`, integrity PASS.
- Evidence report inner size `1,880`, SHA-256 `7fc7bfd58bb143d52ba65f70d7d37a296534bfc96739bb7e1b4028e21317a58b`, integrity PASS.

## Architecture reconciliation action

Pre-reconciliation engineering main: `5ea5bc402b5a9c1ad20abe18eb95c5727ffd6d22`.

A temporary NON-CANONICAL append-only GitHub Actions helper was introduced at `0d88fb9a4003180909b68ec88c6d1250fe343e0c` solely to avoid full-file reconstruction risk. Exact helper run `34190003932`, job `101945944789`, completed SUCCESS. Its append step mechanically proved that the new architecture-map bytes were a strict suffix of the exact prior file, that the diff touched only `docs/KAIROS_ARCHITECTURE_MAP.md`, and that deletions were zero.

Helper-produced docs commit: `6b89a8b15723427f3ce8c1a40b1617a0c24a9532`.
Temporary helper cleanup commit / final engineering main: `05b5512bb83c70b503230f0b06bf6b5f2b9e2eb6`.
Final primary architecture-map blob: `7454906704626261af12c432021e7be21a3ca9ef`.

Mechanical final compare `5ea5bc402b5a9c1ad20abe18eb95c5727ffd6d22` -> `05b5512bb83c70b503230f0b06bf6b5f2b9e2eb6` changes exactly one file, `docs/KAIROS_ARCHITECTURE_MAP.md`, with **15 additions and 0 deletions**. The temporary helper file nets to no final-tree change. No unrelated historical architecture text, whitespace, ownership statement, or prior checkpoint was removed.

## Canonical ownership now present in primary living map

Production seam: `src/services/market-data/liveMarketSummaryFreshnessClassificationPolicy.ts`, exported through `src/services/market-data/index.ts`.

Responsibility: provider-neutral deterministic classification of an already-computed caller-owned observation age in milliseconds to `fresh | stale | expired`, with V1 policy defaults `freshMaxAgeMs = 15_000` and `staleMaxAgeMs = 60_000`.

Boundary remains classification only. It owns no wall clock, `observedAt` parsing/evaluation-time acquisition, polling/scheduling/visibility/resume, Binance transport, universe/ranking/default scope, Home React, stale/expired rendering, Bubble presentation, Your Trades truth, persistence/IndexedDB/Saved Analysis/chart/navigation/transition semantics.

## Next safe action

Primary living-doc reconciliation is COMPLETE. Do not re-open this reconciliation absent contradictory fresh canonical evidence.

Before implementation of any later P21 responsibility, independently source-prove exactly ONE smallest dependency-safe responsibility using the user-approved Live Crypto Bubble Map V1 contract plus current canonical source ownership/data flow. Universe policy and freshness policy remain separate deterministic owners. No patch number may be inferred by momentum.

The strongest likely next area to inspect is the separate Live Crypto universe policy boundary (eligible active Binance Spot USDT instruments, 24h quote-volume ranking, configurable Top-30 limit and stablecoin exclusion, deterministic symbol tie-break), but implementation is not authorized by this history note alone; exact source/owner compatibility must be re-proved first.
