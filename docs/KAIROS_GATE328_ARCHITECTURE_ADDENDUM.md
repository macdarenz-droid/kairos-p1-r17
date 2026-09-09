# Kairos Gate 328 Architecture Addendum

Canonical authority: `Kairos Controlled Roadmap Gate` #328 / run `34335714535` / job `102414496925` / head `c93fa242e2d79684ccddd844718c286dc752cc86` completed full SUCCESS.

Exact-run required artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact id `10098089352`, digest `sha256:5ef6f871f05b63ddc20133ec8e278154f446c9eaac82fd519435168429819ef9`.
- `KAIROS_GATE_EVIDENCE` artifact id `10098089727`, digest `sha256:6d1392e18d54aa97e28e3e46baa05b71bdf0db1eb0439b9ddc927bb635ae80f2`.

## Released ownership

The Live Market Universe Top-N selection/config policy is now canonical product-policy truth above Gate 327 quote-volume ordering. Its production owner is `src/services/market-data/liveMarketUniverseTopNSelectionPolicy.ts`, exported through `src/services/market-data/index.ts`.

It owns only deterministic prefix selection of already-ordered `LiveMarketSummaryFact` values:

- product-policy default count `30`;
- strict validation that any explicit count is a positive integer;
- deterministic failure for zero, negative, fractional, `NaN`, or infinite counts rather than clamp/coercion;
- preservation of Gate 327 ordering without re-ranking;
- non-mutating prefix selection;
- when requested count exceeds availability, return all available facts without synthetic entries.

It does not own instrument eligibility, stablecoin exclusion, provider transport/mapping, request/response execution, quote-volume ordering/tie-break semantics, freshness/cadence, acquisition scheduling, visibility suspension, state/persistence, Live Crypto Bubble presentation, Your Trades truth, Home wiring, chart/navigation, or transitions.

## Dependency boundary

Gate 327 remains the released quote-volume ordering owner. Gate 328 consumes already-ordered facts and selects only a bounded prefix. It must never reinterpret provider facts, re-rank values, duplicate eligibility/stablecoin policy, or hard-code the default count in presentation.

The user-approved P21 contract separately defines caller-owned `observedAt` freshness, visible acquisition cadence, hidden suspension, and FRESH/STALE/EXPIRED thresholds. Gate 328 deliberately owns none of those responsibilities.

## Next-responsibility constraint

The next dependency-safe P21 responsibility must be re-proven from current source ownership and the user-approved contract. Gate 328 closes the universe ordering + Top-N selection chain. Any next slice must remain separate from eligibility, provider mapping, Top-N selection, journal truth, persistence, and presentation ownership.
