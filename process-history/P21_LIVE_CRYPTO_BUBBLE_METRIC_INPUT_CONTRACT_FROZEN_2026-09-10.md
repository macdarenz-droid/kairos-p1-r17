# P21 Live Crypto Bubble Metric-Input Projection — Contract Frozen

Date: 2026-09-10
Invocation: W16-SAME-WORKER-16M-20260908-A-AUTO11-BUBBLE-METRIC

## Fresh authority
- Latest FULL canonical PASS/GOLDEN: `Kairos Controlled Roadmap Gate` #342 / run `34425285844`, job `102709105806`.
- Exact Gate342 candidate: `KAIROS_LIVE_MARKET_SUMMARY_24H_PERCENTAGE_MOVEMENT_FOUNDATION_CANDIDATE_2026-09-10.zip`, 1,590,138 bytes, SHA-256 `bdc7c8ed86f69c0fa877da04964de242beecabca3430c84aeebd4f0f1be086cf`.
- Fresh main before this history write: `453eccbbdaf9c98239ebde6faaf261f3b8c39681`.
- Gate342 exact-run `KAIROS_CURRENT_CANDIDATE` and `KAIROS_GATE_EVIDENCE` were both freshly verified present; all canonical job stages were successful.

## Source proof
Exact Gate342 candidate source shows:
- Gate338 freshness evaluation already owns `evaluationTimeMs`, scoped entry order, exact instrument/fact association, `ageMs`, and `freshness`, with missing facts represented as `fact:null`, `ageMs:null`, `freshness:null`.
- Gate342 `deriveLiveMarketSummary24hPercentageMovement(...)` already owns provider-neutral signed 24h percentage movement from validated canonical `lastPrice` and `open24h`, using released Decimal calculation owners.
- `LiveMarketSummaryFact.quoteVolume24h` is already canonical size-metric truth.
- No production owner currently composes these released truths into one Live Crypto Bubble metric-input projection.

## Frozen smallest responsibility
Add one provider-neutral projection below presentation that accepts the released `LiveMarketSummaryFreshnessEvaluationProjectionResult` without recomputing freshness.

For upstream freshness failure, fail closed as `freshness-evaluation-invalid` and preserve the exact upstream freshness reason.

For successful freshness evaluation, preserve `evaluationTimeMs`, entry order, exact input instrument/fact association, `ageMs`, and `freshness`. A missing fact remains explicit missing and yields `quoteVolume24h:null` plus `movementPercent24h:null`; missing is never converted to numeric zero.

For a present fact, expose its exact canonical `quoteVolume24h` and delegate 24h movement only to Gate342. If delegated movement derivation fails, fail closed as `movement-derivation-invalid`, preserve the exact `entryIndex`, and preserve the delegated movement reason. Do not add a second fact validator or arithmetic owner.

## Explicit non-scope
No ranking or Top-N; no stablecoin exclusion; no Binance/provider-specific second truth; no palette/color/near-zero threshold; no radius/area scaling, geometry, collision/layout or labels; no stale/expired visibility/dimming treatment; no acquisition/cadence/lifecycle/retry/universe refresh; no session mutation; no React/Home/Bubble rendering; no persistence; no navigation; no Your Trades/journal/chart/Risk-Reward/Saved Analysis/transitions.

## Verification plan
Construct from exact Gate342 GOLDEN only through the already-proven GitHub reconstruction/helper path, because the prior identical local `npm ci` method timed out twice. Intended normalized candidate delta is six files only: foundation report, package verifier registration, dedicated verifier, market-data barrel export, provider-neutral projection source, and focused test. Helper must prove pinned Node 22.16.0/npm 10.9.2/Lightweight Charts 5.2.1, deterministic install, dedicated/lower-owner verification, production TypeScript/build, focused regressions, full unit regression, all registered controlled-roadmap verifiers, clean root `kairos_p76/`, ZIP integrity, artifact identity, and exact root placement. Helper PASS remains non-canonical.

Next action after this checkpoint: refresh main + Actions, then start exactly one non-canonical reconstruction helper for this frozen contract if no competing chain exists.