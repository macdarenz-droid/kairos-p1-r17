# KAIROS Gate 331 Architecture Addendum

Date: 2026-09-09
Phase: P21 Home Dashboard / Bubble Map — ACTIVE
Canonical authority: `Kairos Controlled Roadmap Gate` #331 / run `34349963796`
Canonical head: `1c176616f3147a5d8690c5375635b5248521fffb`
Conclusion: SUCCESS

## Canonical ownership promoted by Gate 331

`src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionLifecycleScheduler.ts` is the provider-neutral Home Dashboard live-market acquisition lifecycle/scheduler orchestration owner.

It owns only orchestration above the released Gate330 cadence policy and the released one-shot Home scoped-snapshot acquisition port:

- visible entry starts acquisition immediately and arms the next visible cadence tick;
- caller-driven visible resume starts acquisition immediately and re-arms cadence;
- periodic visible ticks follow the released 5000 ms cadence decision;
- each new visible tick aborts a still-in-flight prior caller-owned acquisition before starting the next, preventing stale concurrent session transitions from racing while preserving fixed acquisition-start cadence;
- hidden cancels the pending scheduled tick and aborts in-flight lifecycle-owned acquisition;
- close/shutdown is idempotent and releases lifecycle-owned scheduled/in-flight work;
- lifecycle-driven aborted settlement is suppressed while current non-aborted result/error may be surfaced through the caller observer contract.

The owner is provider-neutral and consumes injected scheduling/cancellation plus the released acquisition port. It does **not** own DOM/Page Visibility listeners, concrete timer APIs, Binance/provider selection or transport, session construction, `observedAt`, freshness classification, universe eligibility, stablecoin exclusion, quote-volume ordering, Top-N selection, persistence, Home/React presentation, chart/navigation truth, or transitions.

## Existing adjacent owners preserved

- `src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionCadencePolicy.ts` remains the pure product cadence owner: visible entry/resume/periodic => acquire now + next visible acquisition after exactly 5000 ms; hidden => no acquire/no next schedule.
- `src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort.ts` remains the provider-neutral one-shot acquisition port; caller owns scope/cancellation.
- `src/services/market-data/providers/binance/binanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPortAdapter.ts` remains the Binance provider binding and forwards caller cancellation without owning lifecycle policy.
- live-market session/state and freshness owners remain separate; Gate331 does not duplicate their semantics.

## Canonical verification evidence

Gate 331 completed every canonical stage successfully: archive identity/integrity, exact Gate330-to-lifecycle scope, deterministic install, pinned dependency proof, production TypeScript compilation, production build, dedicated lifecycle verifier/runtime, focused lifecycle regression, full unit regression, full controlled-roadmap regression, historical closures, and both evidence uploads.

Exact-run artifacts:

- `KAIROS_CURRENT_CANDIDATE`: artifact id `10103747526`, digest `sha256:4f389520a235914e52b44f706d535456d7f1b1525c3c5f6149c2dfa42e641373`
- `KAIROS_GATE_EVIDENCE`: artifact id `10103747962`, digest `sha256:1ed1f9b011e8ef32b72137bddfcb74e5b2acbb4421646efce3f5245fce466977`

## Next dependency boundary

Gate331 closes the provider-neutral lifecycle/scheduler orchestration seam but deliberately leaves concrete browser Page Visibility and timer wiring outside application truth. Before any next candidate, fresh source ownership must prove the smallest browser-facing adapter/composition boundary, if one is required by the roadmap, and preserve the separation between lifecycle orchestration and Home/React presentation.
