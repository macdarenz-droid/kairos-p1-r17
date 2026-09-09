# KAIROS Gate334 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #334 / run `34377215131`, job `102552927673`, head `b3cd831e27efe6497f4ce29aa9dec592f7cba962` completed FULL SUCCESS on 2026-09-09.

Exact-run canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` id `10114810183`, digest `sha256:6e949dcd508a96efbff67eb73b797f57122200d85ade3f3630a6535345c6765b`.
- `KAIROS_GATE_EVIDENCE` id `10114811112`, digest `sha256:89d5b93276365a2a4541b6a953f5a21edcc8e4a1f92ce4fecaa2cbc1f873a7e8`.

The candidate wrapper contains `KAIROS_LIVE_MARKET_UNIVERSE_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-09.zip`; the canonical inner candidate is 1,553,037 bytes and is the Gate334 GOLDEN baseline for subsequent P21 work.

## Production owner

Canonical owner: `src/services/market-data/liveMarketUniverseComposition.ts`, exported through `src/services/market-data/index.ts`.

`composeLiveMarketUniverse(...)` owns provider-neutral composition of already-authoritative instrument metadata facts and already-available live market summary facts into the selected Live Crypto instrument scope.

It:
- consumes `LiveMarketUniverseInstrumentMetadataFact[]`, `LiveMarketSummaryFact[]`, caller-owned stablecoin exclusion configuration, and optional caller-owned Top-N count;
- delegates active/exact-USDT/stablecoin eligibility to the released eligibility policy;
- associates eligible metadata with summary facts only by the released normalized instrument identity convention of trimmed venue plus trimmed symbol;
- omits metadata entries that have no matching authoritative summary fact and never synthesizes market facts;
- delegates descending Decimal 24h quote-volume ordering and deterministic symbol tie-break to the released ordering policy;
- delegates default/configured Top-N selection to the released Top-N policy;
- returns only the selected `readonly MarketDataInstrument[]` scope.

## Boundary

This owner does **not** own:
- Binance or any other provider choice, request description/execution, concrete browser transport, response decoding, or provider mapping;
- metadata acquisition or 24h-summary acquisition;
- observedAt, fact freshness, session freshness, state-session construction, cadence, visibility, timers, abort/lifecycle, polling, retry, or scheduling;
- persistence or IndexedDB;
- React/Home/Bubble rendering, bubble geometry, size/color presentation, interaction, navigation, chart, or transitions;
- Your Trades, journal, Calculation Brain, Risk/Reward, or Saved Analysis truth;
- primitive eligibility, ranking/tie-break, or Top-N policy logic already owned by their released modules.

## Data-flow position

Gate334 sits above authoritative metadata facts and authoritative 24h summary facts, and below any caller that needs a selected instrument scope. The existing Home live-market lifecycle/browser adapter remains a separate consumer-side owner that accepts an already-selected `readonly MarketDataInstrument[]` scope. Provider acquisition remains behind the released provider-neutral acquisition ports and provider bindings.

This addendum extends the living architecture record without changing earlier P21 owner boundaries. Live Crypto Bubble Map remains market/provider truth only; Your Trades Bubble Map remains journal/trade plus released calculation truth only; transitions remain presentation-only.