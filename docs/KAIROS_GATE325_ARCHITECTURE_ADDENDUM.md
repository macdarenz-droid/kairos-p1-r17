# Kairos Gate 325 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #325 / run `34289145300` / job `102271527311` completed full SUCCESS on 2026-09-09 (Australia/Sydney) at exact head `958c98f09daafd99d2004f7ce8a830bfee092331`.

Exact canonical candidate:
`KAIROS_BINANCE_SPOT_EXCHANGE_INFO_BROWSER_INSTRUMENT_METADATA_ACQUISITION_BINDING_FOUNDATION_CANDIDATE_2026-09-09.zip`

Canonical candidate identity: size `1,524,401` bytes; SHA-256 `34af2c884a191a8eb8163f91d4c721563ad5ecb20e64ac437f6b412f43093659`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10081004827`, wrapper size `1,306,702`, digest `sha256:9bbf3b7925bdd9bb8816f3c8c441a6279e18f4cbe242346da68277fd77435180`.
- `KAIROS_GATE_EVIDENCE`: id `10081005378`, wrapper size `1,365`, digest `sha256:17663b910001a1c7f421a328476d387bc75195be17a2204d04f60acaa2222bd3`.

All required canonical stages passed: exact archive identity/integrity, exact controlled six-file scope from Gate 324, deterministic install, Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated browser instrument-metadata acquisition-binding verification/runtime, focused binding regression, full unit regression, full controlled-roadmap regression, historical closures, and both canonical artifact uploads.

## Ownership established by Gate 325

Gate 325 releases the browser composition boundary that joins the already-canonical Binance Spot `exchangeInfo` browser public REST connector with the already-canonical Binance Spot instrument-metadata acquisition adapter. The binding owns only dependency composition. It preserves the released provider-neutral acquisition result and caller-owned cancellation semantics; it does not create new provider, transport, universe, freshness, state, persistence, or UI truth.

The released dependency direction is now:

`browser public REST connector -> exchangeInfo request/round-trip chain -> instrument-metadata acquisition adapter -> provider-neutral instrument-metadata acquisition port`

The binding is the browser-side composition seam for that chain. Existing lower-layer owners remain authoritative for their released responsibilities.

## Explicit non-scope

Gate 325 does not own or change:
- endpoint/path/query semantics beyond released request-descriptor ownership;
- HTTP status/header/error taxonomy;
- credentials, custom headers, cache, redirect, timeout, retry, backoff, rate/request-weight policy;
- JSON decode or provider mapping semantics;
- acquisition cadence, visibility/resume lifecycle, session/state or persistence;
- USDT eligibility;
- stablecoin exclusion;
- 24h quote-volume ranking;
- symbol tie-break;
- Top-N / Top-30 policy;
- freshness thresholds or observedAt policy;
- Live Crypto Bubble Map presentation;
- Your Trades Bubble Map / journal truth;
- chart/navigation/transitions.

## Next dependency-safe responsibility

Fresh source/architecture evidence after Gate 325 shows the provider-neutral `LiveMarketUniverseInstrumentMetadataFact` already carries authoritative instrument identity, `baseAsset`, `quoteAsset`, and `tradingEnabled` truth specifically for later caller-owned universe policy, while all released exchangeInfo acquisition layers intentionally exclude USDT/stablecoin/ranking/Top-N policy. Therefore the next smallest missing product-owner seam is a deterministic **Live Market Universe instrument eligibility policy foundation** only.

That next policy slice should consume authoritative instrument-metadata facts and own only eligibility decisions needed to identify the default Live Crypto universe candidates: actively tradable instruments quoted in USDT plus the explicit configurable stablecoin-exclusion set. Ranking by 24h quote volume, equal-volume symbol tie-break, Top-30 selection, freshness/cadence, state/session behavior, and UI remain later/separate owners unless fresh source dependency evidence proves a smaller prerequisite first.

Patch numbering is intentionally not inferred here. Fresh canonical GitHub/source evidence must still be re-proved before implementation.