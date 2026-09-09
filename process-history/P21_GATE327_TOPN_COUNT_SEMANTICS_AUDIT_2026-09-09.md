# P21 Gate 327 -> Top-N count semantics audit — 2026-09-09

## Before-state
- Latest FULL canonical PASS/GOLDEN freshly re-proven as `Kairos Controlled Roadmap Gate` #327 / run `34324507102` / job `102378550373` / head `6767dcf29db81022ea3bafedc70934ab7dec0a3c`.
- Fresh main before this audit: `ffb581522e9712a566f433c9188e8e3a9f4e5bfc` (`docs: record Gate 327 quote-volume ordering ownership`).
- Gate 327 production owner: `src/services/market-data/liveMarketUniverseQuoteVolumeOrderingPolicy.ts`; ordering only, no Top-N ownership.
- No canonical/helper/candidate Top-N chain existed at audit start.

## Canonical verification re-proof
Fresh job evidence for run `34324507102` confirms every required canonical stage completed SUCCESS: exact uploaded archive identity/integrity, Gate326->ordering exact scope, deterministic install, exact Lightweight Charts dependency, TypeScript compile, production build, dedicated ordering verifier/runtime, focused ordering regression, full unit regression, full controlled-roadmap regression, historical closures, and both required artifact uploads.

## Living architecture-map audit
`docs/KAIROS_ARCHITECTURE_MAP.md` was fetched at blob `2b485560dc7c6b023bf4d43426193811aa5ff31a`. It still records the older P21.23 ledger plus later checkpoint sections and does not yet consolidate Gate327 ordering ownership into the primary ownership table/ledger. The separate canonical addendum `docs/KAIROS_GATE327_ARCHITECTURE_ADDENDUM.md` remains accurate. No partial/truncated replacement of the primary map was attempted.

## Top-N count-semantics evidence
Fresh source-pattern inspection found Kairos already uses strict positive-integer validation rather than coercion for bounded/count-like configuration values. Examples include `DiagnosticsService` capacity (`Number.isInteger(capacity) && capacity >= 1`) and activation timeout resolution, where an owner-local default is selected first and the resolved value is then strictly integer/range validated.

The user-approved P21 product contract independently establishes `Top 30` as the default and requires that count to be config/policy-owned, never hard-coded in presentation. Gate327 explicitly leaves Top-N unowned and preserves ordered facts without selection.

Therefore the evidence-backed semantics for the next smallest Top-N selection/config owner are:
- default count = 30, constructed inside the product-policy/config owner rather than in UI;
- explicit count must be a positive integer;
- zero, negative, non-integer, NaN/infinite values are invalid and must fail deterministically rather than clamp/coerce;
- selection consumes already-ordered facts and preserves their order; it must not re-rank or duplicate eligibility/stablecoin/provider/freshness/state/UI truth;
- count greater than the available ordered facts naturally selects the full available ordered collection (no synthetic entries).

No Top-N production implementation/helper/candidate/gate was started in this audit. This preserves the one-active-chain rule while the primary architecture-map consolidation remains pending.

## After-state / next safe action
- Gate327 remains GOLDEN.
- Primary architecture-map Gate327 consolidation remains the first docs mutation to finish safely from the exact current blob; do not overwrite the large living document from truncated content.
- After that consolidation and a fresh main/Actions recheck, construct exactly one smallest provider-neutral Top-N selection/config candidate from Gate327 GOLDEN using the semantics above, with default 30 policy-owned and no UI hard-code.
- No Top-N helper/gate exists yet; no competing chain was created.
