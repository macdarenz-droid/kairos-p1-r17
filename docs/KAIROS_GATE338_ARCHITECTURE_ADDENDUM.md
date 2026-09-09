# Kairos Gate 338 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #338 / run `34405539024` / job `102647494693` completed full SUCCESS on 2026-09-09 at exact head `362e7ec7f3e1092fb9b6f79d8e36527753bb8626`.

Exact canonical candidate:
`KAIROS_LIVE_MARKET_SUMMARY_FRESHNESS_EVALUATION_PROJECTION_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,575,134` bytes; SHA-256 `6579e55613bccc80cc2d910c97b676111750f52d9d1115f88141ab854dfb2d1c`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10125537512`, wrapper size `1,348,911` bytes, digest `sha256:5881f76ee60f5eda2508f7fb63b83cb978659abd1a13e5556368563feee3a1ee`.
- `KAIROS_GATE_EVIDENCE`: id `10125537966`, wrapper size `1,531` bytes, digest `sha256:934a4d97e2f796bff57be4a00fb40cec03944bbc4053c16a0b107b1f89547f0f`.

Every required canonical stage passed: setup/checkout, pinned Node/npm verification, exact archive identity and integrity, authoritative Gate337 base plus candidate extraction, exact controlled six-file freshness-evaluation scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated freshness-evaluation verifier/runtime, focused freshness-evaluation regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical artifact uploads.

## Canonically released responsibility

Gate338 releases `src/services/market-data/liveMarketSummaryFreshnessEvaluationProjection.ts` as the provider-neutral deterministic freshness-evaluation/projection owner below presentation.

`evaluateLiveMarketSummaryScopedSnapshotFreshness(...)` owns only this transformation:

1. accept an already-released `readonly LiveMarketSummaryScopedStateSnapshotEntry[]` plus an explicit caller-owned `evaluationTimeMs`;
2. reject a non-finite or negative evaluation time as `evaluation-time-invalid` and never create its own clock;
3. preserve a missing `fact: null` as `fact: null`, `ageMs: null`, `freshness: null`;
4. validate each present fact only through the released `validateLiveMarketSummaryFact(...)` owner, returning `fact-invalid` on failure;
5. parse canonical caller-owned `fact.observedAt`, reject an observation after the evaluation time as `observation-after-evaluation`, and never clamp a negative age into current truth;
6. compute deterministic `ageMs = evaluationTimeMs - observedAtMs` for a present valid fact;
7. delegate `fresh | stale | expired` classification unchanged to the released `classifyLiveMarketSummaryObservationAge(...)` policy; and
8. preserve the exact input instrument/fact association in the projection result.

The default policy remains the released V1 freshness policy, but a caller-supplied released policy is forwarded unchanged. Gate338 therefore does not duplicate or own the 15-second/60-second thresholds.

## Explicit non-scope

Gate338 does **not** own or change:
- provider/Binance transport, request execution, JSON decode or response mapping;
- acquisition, visible/hidden lifecycle, 5-second cadence, retry, cancellation or universe refresh;
- active-USDT eligibility, stablecoin exclusion, quote-volume ranking, symbol tie-break or Top-N policy;
- state-session mutation or acquisition failure semantics;
- persistence, IndexedDB or Saved Analysis;
- React/Home Dashboard/Bubble Map presentation, stale dimming, expired visuals, bubble geometry/size/color/interactions or motion;
- route/navigation, chart, Your Trades Bubble Map, journal/trade truth, Risk/Reward or Calculation Brain truth.

Acquisition/session status and per-fact freshness remain separate truth domains. A resolved lifecycle acquisition result may contain an acquisition failure while its scoped snapshot still retains prior authoritative facts; Gate338 evaluates only the facts it is explicitly given and does not reinterpret acquisition success/failure.

## Next dependency-safe responsibility proof

Fresh Gate338 GOLDEN source now contains all lower owners needed to evaluate fact freshness, but there is still no production consumer that composes that projection with the Home acquisition lifecycle observer seam:

- `HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver` already exposes resolved acquisition results through `onResult(result)` and rejected/throwing acquisition work separately through `onError(error)`.
- each `HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult` preserves both `orchestrationResult` and the exact released `scopedSnapshot`;
- the baseline state orchestration intentionally retains existing authoritative state on `acquisition-failed`, so acquisition/session status must not be collapsed into fact freshness;
- Gate337 `startBinanceHomeDashboardLiveMarketRuntime(...)` already accepts lifecycle observer options and forwards them into the released browser lifecycle adapter;
- Gate338 now evaluates `scopedSnapshot` freshness from an explicit caller-owned evaluation time without owning presentation; and
- `HomeRoute` remains presentation-only/disconnected.

The smallest dependency-safe next responsibility is therefore a **provider-neutral Home live-market lifecycle-result freshness-observation bridge below presentation**. Its intended ownership is only to consume each released lifecycle `onResult`, read one explicit caller-owned evaluation time for that result, delegate the exact `result.scopedSnapshot` unchanged to Gate338, and emit a combined non-presentation observation that preserves the original acquisition result and the Gate338 freshness projection as separate fields. Existing lifecycle `onError` must remain a separate error channel.

Before implementation, freeze the exact factory/result/sink shape and the behavior when the caller-owned evaluation-time source itself throws, using current application-adapter error-boundary conventions. Do not introduce `Date.now()`, duplicate freshness thresholds, reinterpret acquisition failure as stale/expired, mutate the state session, or connect React presentation in the same slice.
