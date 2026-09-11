# Kairos Gate374 Architecture Addendum — Live Crypto Bubble Pixel-Radius Policy Contract

Canonical authority: `Kairos Controlled Roadmap Gate` #374 / run `34561833145`, job `verify-current-candidate` / `103145990143`, exact head `6d695fce212e6edde5f038dc596a23b920db6672`, FULL SUCCESS.

Exact promoted candidate: `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PIXEL_RADIUS_POLICY_CONTRACT_FOUNDATION_CANDIDATE_2026-09-11.zip`, size `1,732,158` bytes, SHA-256 `a95edc13e580b44c51f59b77cb2754c71d64442e3517e1a6365b222b0b107a6f`, Git blob `dfd11e339d47dfbedfae5b729b1a5b14c30d416a`, root exactly `kairos_p76/`.

Exact-run canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10184842841`, wrapper size `1,477,338` bytes, digest `sha256:a5f47a712a4f24ae699f18a3e09bf960b99737950312de9d822df969c62cc4c3`.
- `KAIROS_GATE_EVIDENCE` artifact `10184843256`, wrapper size `1,786` bytes, digest `sha256:7c01dde16a84ae6b1cde08df2ababbc95b823067f369ce5d1370d5f0bcc26fc9`.

Independent exact-run candidate extraction re-proved the sole nested candidate filename, exact size, SHA-256, Git blob, `kairos_p76/` root, and absence of absolute, traversal, or symlink ZIP entries.

## Canonically released responsibility

Gate374 releases `src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy.ts` as the caller-owned Live Crypto Bubble pixel-radius bounds contract and validator.

The released policy contains exactly:
- `minimumRadiusCssPixels`;
- `maximumRadiusCssPixels`.

The validator owns only these deterministic validity rules:
- each bound must be a finite number;
- each bound must be non-negative;
- equal bounds are allowed;
- `maximumRadiusCssPixels` must be greater than or equal to `minimumRadiusCssPixels`;
- success preserves the caller-supplied policy reference unchanged.

This makes pixel-radius bounds an explicit input boundary without inventing Kairos product/design values.

## Ownership retained below and above Gate374

- Gate373 remains the HomeRoute normalized-radius textual-runtime integration owner.
- Gate372 remains the configured-browser normalized-radius textual runtime owner.
- Gate371 remains the normalized-radius textual evidence presenter owner.
- Gate369 remains the configured-browser radius-scale hook owner.
- Gate364 and lower released owners retain normalized radius/area/market-truth projection and arithmetic.
- Live Crypto Bubble Map and Your Trades Bubble Map remain separate authoritative truth domains.

Gate374 does not move market truth, runtime acquisition, freshness, route, persistence, or rendering authority into the policy validator.

## Explicit non-scope retained

Gate374 does **not** own or choose:
- concrete default minimum or maximum Bubble radii;
- any `radiusScale` to CSS-pixel interpolation;
- responsive breakpoints or browser viewport measurement;
- collision detection, packing, layout, or label-fit policy;
- hit targets or interaction geometry;
- SVG/canvas/DOM renderer choice;
- Bubble palette, CSS, theme, dimming strength, or motion;
- HomeRoute mutation or a second Live Crypto runtime consumer;
- Binance/provider transport, acquisition, retries, cadence, freshness, universe, ranking, Top-N, stablecoin exclusion, movement, or market-truth semantics;
- persistence, Saved Analysis, Your Trades, journal, chart, Risk/Reward, or Calculation Brain truth.

No concrete visual sizing value is established by this canonical PASS. Those values remain caller/product/design-owned and must not be guessed.

## Next dependency boundary

Fresh Gate374 source now establishes both sides needed for one smaller deterministic presentation seam without choosing any product/design defaults:
1. released normalized `radiusScale` evidence in `[0,1]` from the Gate364+ chain; and
2. a caller-supplied, Gate374-validated minimum/maximum CSS-pixel policy.

The next smallest dependency-safe technical responsibility may therefore be a **pure provider-neutral pixel-radius projection** that accepts the exact released radius-scale projection plus an exact caller-supplied pixel-radius policy, validates the policy through Gate374, preserves upstream failure/null/order/reference semantics, and maps a present normalized radius deterministically inside the caller's supplied bounds.

That future projection must still own no default bound values, breakpoints/viewport policy, collision/packing/layout/labels, renderer/React/HomeRoute integration, styling/motion, market/provider truth, persistence, or Your Trades truth. A visible Bubble renderer remains a later controlled boundary after the required product/design inputs are authoritative.
