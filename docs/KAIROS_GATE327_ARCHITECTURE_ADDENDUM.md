# Kairos Gate 327 Architecture Addendum

Canonical authority: `Kairos Controlled Roadmap Gate` #327 / run `34324507102` / head `6767dcf29db81022ea3bafedc70934ab7dec0a3c` completed full SUCCESS.

Exact-run required artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact id `10093564641`, digest `sha256:4f716a9d218f0a9cdfa084b843bf0b0e174e88d8507cf21263beea9009536a0b`.
- `KAIROS_GATE_EVIDENCE` artifact id `10093565170`, digest `sha256:14639e25dd1a9b8105fa7da0a8ab125fec056d8a7c90487f11c9372617a3b9a9`.

## Released ownership

The Live Market Universe quote-volume ordering policy is now canonical product-policy truth above released eligibility/provider mapping. Its production owner is `src/services/market-data/liveMarketUniverseQuoteVolumeOrderingPolicy.ts`, exported through `src/services/market-data/index.ts`.

It owns only deterministic ordering of already-eligible `LiveMarketSummaryFact` values:

- descending exact `quoteVolume24h` ordering through the released Decimal calculation kernel;
- equal-volume deterministic symbol ordering;
- return of a sorted copy without mutating caller order.

It does not own instrument eligibility, stablecoin exclusion, provider transport/mapping, request/response execution, Top-N/Top-30 selection, freshness/cadence, state/persistence, Live Crypto Bubble presentation, Your Trades truth, Home wiring, chart/navigation, or transitions.

## Dependency boundary

Gate 326 remains the released instrument-eligibility owner. Gate 327 consumes already-eligible summary facts and establishes ordering only. The existing Binance Spot 24h mapping chain remains the authority for `quoteVolume24h`; Gate 327 does not reinterpret provider facts.

The user-approved P21 contract requires default Top 30 while keeping that count config/policy-owned and out of UI. Gate 327 deliberately contains no `slice(0, ...)` or Top-30 selection. Therefore selection remains a separate unowned responsibility above canonical ordering.

## Next-responsibility constraint

The next dependency-safe universe responsibility must be proven as a separate deterministic Top-N selection/config policy consuming already-ordered facts. It must not re-rank, re-implement eligibility, hard-code `30` in UI, or absorb provider/freshness/state/presentation ownership. Exact count validation semantics must be proven from current source/architecture before implementation; do not guess them.
