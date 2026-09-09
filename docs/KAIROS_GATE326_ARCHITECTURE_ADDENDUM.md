# Kairos Gate 326 Architecture Addendum

Canonical authority: `Kairos Controlled Roadmap Gate` #326 / run `34296922584` / head `c8f3a2c538192d3cb85ef66a1a778d5654b922b8` completed full SUCCESS.

## Released ownership

The Live Market Universe instrument eligibility policy is a deterministic product-policy owner above provider/acquisition mapping. It consumes authoritative instrument metadata facts and owns only eligibility decisions:

- require `tradingEnabled`;
- require exact `quoteAsset === 'USDT'`;
- exclude base assets through the caller-owned configurable stablecoin exclusion set.

It does not own provider transport, exchangeInfo decoding/mapping, 24h summary acquisition, quote-volume ranking, equal-volume symbol tie-break, Top-N selection, freshness/cadence, persistence/state, Live Crypto UI, Your Trades truth, chart/navigation, or transitions.

## Dependency boundary

The released metadata fact remains the authority for instrument identity, `baseAsset`, `quoteAsset`, and `tradingEnabled`. The eligibility policy consumes those facts without moving provider semantics into product policy.

The released `LiveMarketSummaryFact` / Binance Spot 24h mapping chain remains the authority for 24h market-summary facts, including quote-volume truth. Gate 326 does not change that chain.

## Next-responsibility constraint

Any later universe ordering/selection slice must be proven from fresh source ownership. Do not silently combine descending 24h quote-volume ranking, equal-volume symbol ordering, and config-owned Top-N unless current architecture proves they belong to one deterministic owner. Fresh source/roadmap evidence is required before implementation.
