# P21 Gate327 Primary Architecture Map Full-Blob Recovery — 2026-09-09

Run token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-MAP-CONSOLIDATE`

## Fresh before-state

- `main`: `ffb581522e9712a566f433c9188e8e3a9f4e5bfc` (`docs: record Gate 327 quote-volume ordering ownership`).
- Latest full canonical PASS/GOLDEN: `Kairos Controlled Roadmap Gate` #327 / run `34324507102` / head `6767dcf29db81022ea3bafedc70934ab7dec0a3c`, completed `success`.
- Gate327 canonical ordering owner: `src/services/market-data/liveMarketUniverseQuoteVolumeOrderingPolicy.ts`; ownership remains quote-volume ordering only, not Top-N.
- Canonical Gate327 addendum already exists on main: `docs/KAIROS_GATE327_ARCHITECTURE_ADDENDUM.md`.
- Primary map file `docs/KAIROS_ARCHITECTURE_MAP.md` remained at blob `2b485560dc7c6b023bf4d43426193811aa5ff31a` and does not yet consolidate Gate327 into its primary ownership map.
- No newer canonical gate was present in the fresh Actions head.

## Action / evidence recovered

The previous blocker was large-file connector truncation while trying to read the primary architecture map safely. This invocation materially changed retrieval strategy and fetched the exact Git blob `2b485560dc7c6b023bf4d43426193811aa5ff31a` directly. That returned the complete map payload and removed uncertainty about the existing file contents.

A normal contents-API `update_file` still requires the entire replacement UTF-8 payload. The available connector does not expose an append/range-patch action for repository files. Because the map is large and an incomplete reconstruction would violate the integrity/no-guess rule, this invocation deliberately did NOT replace the primary map from a truncated response or hand-reconstructed subset.

This is a technical write-path blocker only, not a product/user blocker and not a canonical failure. Gate327 remains GOLDEN.

## Proven next strategy

Do not repeat the old truncated-fetch approach. The next safe method should use one integrity-preserving GitHub-native patch mechanism for this SAME docs-only consolidation, for example a deterministic one-shot helper workflow/script operating on the checked-out exact main blob and asserting:

1. starting architecture-map blob is exactly `2b485560dc7c6b023bf4d43426193811aa5ff31a` (or freshly re-proven successor if main changed),
2. only the intended Gate327 ownership/checkpoint text is inserted,
3. existing map bytes outside the insertion remain unchanged,
4. resulting diff is docs-only and reviewed mechanically before commit,
5. helper residue is removed or kept non-canonical and clearly separated from project authority.

After any docs write, refresh main + Actions before any second repository mutation.

## Top-N status

No Top-N implementation/helper/candidate/gate was started. The previously proven count semantics remain the next engineering contract only after primary-map consolidation:

- default count `30` belongs to product policy/config, never UI;
- explicit count must be a positive integer;
- zero/negative/non-integer/NaN/infinite values fail deterministically rather than clamp/coerce;
- selection consumes already-ordered Gate327 facts and preserves that order without re-ranking;
- count above available facts returns all available facts, never synthetic entries;
- no eligibility/stablecoin/provider/freshness/state/presentation ownership is absorbed.

## After-state

- Canonical GOLDEN unchanged: Gate327.
- Primary map not mutated unsafely.
- Full exact primary-map blob retrieval is now proven, so the former read-truncation blocker is resolved.
- Remaining blocker is only the safe repository write mechanism for the large-file docs consolidation.
- Next controlled chain remains: primary map Gate327 consolidation -> refresh main/Actions -> exactly one smallest provider-neutral Top-N selection/config candidate from Gate327 GOLDEN.
