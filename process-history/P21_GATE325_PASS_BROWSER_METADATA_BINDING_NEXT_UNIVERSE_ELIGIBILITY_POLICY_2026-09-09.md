# P21 Gate 325 PASS — Browser Metadata Binding -> Next Universe Eligibility Policy

Invocation token: `W16-SAME-WORKER-16M-20260909-0924-G325PASS`
Date: 2026-09-09 Australia/Sydney.

## Before-state

- Latest proven GOLDEN before this run: Gate #324 / run `34279358453`, Binance Spot exchangeInfo Browser Public REST Connector Foundation.
- Exact active canonical chain entering this run: Gate #325 / run `34289145300`, job `102271527311`, head `958c98f09daafd99d2004f7ce8a830bfee092331`, Binance Spot exchangeInfo browser instrument-metadata acquisition binding.
- Candidate: `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_BROWSER_INSTRUMENT_METADATA_ACQUISITION_BINDING_FOUNDATION_CANDIDATE_2026-09-09.zip`, size `1,524,401`, SHA-256 `34af2c884a191a8eb8163f91d4c721563ad5ecb20e64ac437f6b412f43093659`, root `kairos_p76/`.

## Canonical result

Gate #325 completed full SUCCESS.

Verified successful stages:
- checkout/setup and pinned npm;
- exact archive identity/integrity;
- exact Gate324 -> Gate325 controlled six-file scope;
- deterministic install;
- exact Lightweight Charts 5.2.1 dependency;
- production TypeScript compilation;
- production build;
- dedicated browser instrument-metadata acquisition-binding verifier/runtime;
- focused binding regression;
- full unit regression;
- full controlled-roadmap regression;
- historical closures;
- candidate upload;
- gate-evidence upload.

Exact-run canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10081004827`, size `1,306,702`, digest `sha256:9bbf3b7925bdd9bb8816f3c8c441a6279e18f4cbe242346da68277fd77435180`.
- `KAIROS_GATE_EVIDENCE`: id `10081005378`, size `1,365`, digest `sha256:17663b910001a1c7f421a328476d387bc75195be17a2204d04f60acaa2222bd3`.

Therefore Gate #325 is promoted as the latest canonical GOLDEN.

## Architecture reconciliation

Main docs checkpoint created at commit `f1717cf1d8277a46e0e7f0ce4d54a557912b0d8a`:
`docs/KAIROS_GATE325_ARCHITECTURE_ADDENDUM.md`.

Gate325 ownership: browser-side dependency composition only, joining the released exchangeInfo browser connector to the released instrument-metadata acquisition adapter while preserving provider-neutral acquisition result and caller-owned cancellation semantics. No new provider, transport, universe, freshness, state, persistence or UI ownership.

The existing large `docs/KAIROS_ARCHITECTURE_MAP.md` was not rewritten in this invocation because the prior Gate324 reconciliation proved a direct whole-file replacement path could truncate it. The original map remains intact; the Gate325 addendum is the safe living architecture checkpoint for this ownership delta.

## Next responsibility proof

Fresh repository evidence shows `LiveMarketUniverseInstrumentMetadataFact` already carries authoritative instrument identity, `baseAsset`, `quoteAsset`, and current `tradingEnabled` specifically for later caller-owned universe policy. Released exchangeInfo acquisition layers explicitly exclude USDT eligibility, stablecoin exclusion, ranking, tie-break and Top-N.

The next smallest dependency-safe product-owner seam is therefore a deterministic **Live Market Universe instrument eligibility policy foundation** only:
- consume authoritative instrument-metadata facts;
- require actively tradable instruments;
- require `quoteAsset === USDT` under the approved V1 product contract;
- apply an explicit configurable stablecoin-exclusion set.

Explicit non-scope for that next slice:
- no 24h quote-volume ranking;
- no equal-volume symbol tie-break;
- no Top-N/Top-30 selection;
- no freshness/cadence/polling/session lifecycle;
- no state/persistence;
- no Live Crypto or Your Trades UI;
- no chart/navigation/transitions;
- no provider/transport widening.

Patch numbering intentionally not inferred. Fresh source/GOLDEN/main/Actions must be re-proved at the next invocation before implementation.

## After-state / next safe action

- Gate #325 = latest canonical GOLDEN.
- Main architecture checkpoint = `f1717cf1d8277a46e0e7f0ce4d54a557912b0d8a`.
- No competing engineering chain was started in this invocation.
- Next safe action: fresh-check main/Actions/source ownership and, if no competing chain exists, implement exactly one Live Market Universe instrument eligibility policy candidate from Gate325 GOLDEN with dedicated verifier/focused tests and required full regressions.
