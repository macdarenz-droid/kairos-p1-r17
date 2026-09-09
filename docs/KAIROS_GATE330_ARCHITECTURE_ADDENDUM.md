# KAIROS Gate 330 Architecture Addendum

Date: 2026-09-09
Phase: P21 Home Dashboard / Bubble Map — ACTIVE
Canonical authority: `Kairos Controlled Roadmap Gate` #330 / run `34343615836`
Canonical head: `33dfcd7d52c6377503acde868fa803121d565895`
Conclusion: SUCCESS

## Canonical ownership promoted by Gate 330

`src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionCadencePolicy.ts` is the provider-neutral Home Dashboard live-market acquisition cadence policy owner.

It owns only the deterministic product cadence decision:

- visible `entry` => acquire now and schedule the next visible acquisition after exactly 5000 ms;
- visible `resume` => acquire now and schedule the next visible acquisition after exactly 5000 ms;
- visible `periodic` => acquire now and schedule the next visible acquisition after exactly 5000 ms;
- `hidden` => do not acquire and do not schedule a next visible acquisition.

The policy is pure. It does **not** own `setInterval`, `setTimeout`, DOM/Page Visibility listeners, browser lifecycle wiring, provider transport, provider selection, session construction, `observedAt`, freshness classification, universe eligibility, stablecoin exclusion, quote-volume ordering, Top-N selection, persistence, Home/React presentation, chart/navigation truth, or transitions.

## Existing adjacent owners preserved

- `src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort.ts` remains the provider-neutral one-shot Home acquisition port. The caller owns scope and cancellation.
- `src/services/market-data/providers/binance/binanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPortAdapter.ts` remains the Binance-owned binding from that application port to the already-released Binance/session acquisition composition. Provider binding does not own cadence or Home presentation.
- Existing live-market freshness classification remains separate from acquisition cadence.

## Canonical verification evidence

Gate 330 completed every canonical stage successfully: archive identity/integrity, exact Gate328-to-cadence scope, deterministic install, pinned dependency proof, production TypeScript compilation, production build, dedicated cadence verifier/runtime, focused cadence regression, full unit regression, full controlled-roadmap regression, historical closures, and both evidence uploads.

Exact-run artifacts:

- `KAIROS_CURRENT_CANDIDATE`: artifact id `10101215486`, digest `sha256:f7fe4d53ceabb409c3c9ccd898877d9d017aeea4026bc398c9328dbb079426ad`
- `KAIROS_GATE_EVIDENCE`: artifact id `10101216194`, digest `sha256:16d4bff35d7b1f09990c1108770ed42981a16afbd8ab6223ce6050ef77e2e0e5`

## Next dependency boundary

Fresh inspection of the Gate330 canonical candidate finds no existing source owner for browser/page visibility events or timer scheduling around this Home live-market acquisition port. Therefore the next dependency to prove is a **separate Home Dashboard acquisition lifecycle/scheduler orchestration boundary** that consumes the Gate330 cadence policy plus the released one-shot acquisition port.

Before implementation, its exact API shape and cancellation/race semantics must be proven from current Kairos application/lifecycle conventions. It must not absorb provider transport, freshness, universe policies, session/state truth, persistence, or presentation ownership.
