# P21 — Post-Gate333 Next Responsibility Proof — 2026-09-09

## Canonical authority
- Latest FULL canonical PASS/GOLDEN: `Kairos Controlled Roadmap Gate` #333, run `34362238656`, head `913f2dc1f6878f6703071105b16034d41586a4fb`.
- Post-PASS browser lifecycle ownership reconciliation on main: `7ddc283e28b4b6ed22ce4f860fa9dd2e72cff6db`.

## Fresh source evidence
Exact Gate333 candidate inspection proves the browser lifecycle edge is complete but not composed into Home: `src/app/homeDashboardLiveMarketSummaryBrowserLifecycleAdapter.ts` accepts an already-created provider-neutral scoped-snapshot acquisition port and an already-selected `readonly MarketDataInstrument[]` scope, then owns only Page Visibility + concrete one-shot timer wiring around the released lifecycle. `src/main.tsx` contains app/bootstrap composition but no live-market composition. `src/app/HomeRoute.tsx` remains a presentation placeholder (`No dashboard insights are connected yet.`).

The released universe responsibilities already exist independently:
- `liveMarketUniverseInstrumentEligibilityPolicy.ts`: active + exact USDT quote + caller-configured stablecoin exclusion only.
- `liveMarketUniverseQuoteVolumeOrderingPolicy.ts`: descending 24h quote volume + symbol tie-break only.
- `liveMarketUniverseTopNSelectionPolicy.ts`: config-owned/default Top 30 prefix selection only.
- Binance exchangeInfo metadata acquisition and Home scoped-snapshot acquisition ports are already released separately.

Repository-wide source search shows these universe policies have no production consumer/composition outside their own definitions/exports. Therefore the remaining gap before Home can receive an authoritative Live Crypto V1 scope is not another primitive policy and not UI rendering; it is a provider-neutral universe composition owner that explicitly joins released metadata eligibility with released live-summary facts, released ordering, and released Top-N selection.

## Smallest dependency-safe next responsibility
Introduce exactly one provider-neutral Live Market Universe composition function/service that accepts:
1. already-acquired authoritative instrument metadata facts,
2. already-available live-market summary facts for those instruments,
3. caller-owned eligibility configuration (stablecoin exclusion), and
4. optional caller-owned Top-N count/config,
then deterministically returns the selected `readonly MarketDataInstrument[]` scope by applying only the released owners in order: metadata eligibility -> matching summary facts -> quote-volume ordering -> Top-N selection.

The join must be exact by released instrument identity, reject/handle duplicate or missing identity according to existing validation conventions rather than invent provider truth, and preserve each primitive owner's authority rather than duplicating its policy.

## Explicit non-scope
- No Binance request execution, exchangeInfo/ticker decode/mapping, transport/provider selection, retry/backoff.
- No 5-second cadence, Page Visibility, timers, lifecycle/concurrency/abort policy.
- No observedAt/freshness thresholds or state-session ownership.
- No persistence.
- No React/Home/Bubble rendering, bubble size/color/geometry, Your Trades/journal, chart, navigation, or transitions.
- No hard-coded stablecoin set beyond caller-owned config and no new Top-30 constant.

## Next execution rule
Before implementation, re-read exact Gate333 GOLDEN source and existing identity/validation conventions, then construct the smallest candidate from Gate333 GOLDEN only. Do not wire Home presentation in the same slice.