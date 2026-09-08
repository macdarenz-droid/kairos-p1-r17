# P21 Gate #323 PASS — Binance exchangeInfo metadata acquisition adapter

## Invocation
- Worker token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-G323`
- Date: 2026-09-09 Australia/Sydney

## Before state
- Prior canonical GOLDEN: Gate #322 / run `34264957069`, Live Market Universe Instrument Metadata Acquisition Port Contract Foundation.
- Active canonical chain entering this invocation: Gate #323 / run `34272459493`, head `0c73846a12ccaeaf237a4bd260085f2ea88725e3`, Binance Spot exchangeInfo instrument-metadata acquisition adapter.

## Fresh canonical result
Gate #323 completed full SUCCESS. Exact canonical job `verify-current-candidate` id `102217190352` passed every required stage: setup/checkout, pinned npm verification, exact archive identity/integrity, authoritative Gate322 base and candidate extraction, exact six-file scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation, production build, dedicated adapter verifier/runtime, focused adapter regression, full unit regression, full controlled-roadmap regression, historical closures, candidate upload, and gate-evidence upload.

Exact-run canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` id `10074817236`, wrapper size `1,300,359`, digest `sha256:31f8e38c926875905cd9e8f9f4a1da6c7d2a02f75f14b2f1984794bae0edb38f`.
- `KAIROS_GATE_EVIDENCE` id `10074817973`, wrapper size `932`, digest `sha256:afdac5a8be738c8865244474f3d19bf15d03507a38ae6aed15a6fd96efd0e217`.
- Canonical inner candidate identity remains `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_INSTRUMENT_METADATA_ACQUISITION_ADAPTER_FOUNDATION_CANDIDATE_2026-09-09.zip`, size `1,516,387`, SHA-256 `eee1ca865ca197586fb3abda930be27d90f594dcb15cb17cdfc10ed464647893`, root `kairos_p76/`.

Therefore Gate #323 is the latest FULL canonical PASS and becomes GOLDEN.

## Canonical production ownership established
`src/services/market-data/providers/binance/binanceSpotExchangeInfoInstrumentMetadataAcquisitionAdapter.ts` now canonically owns the Binance provider implementation of the released provider-neutral metadata acquisition port. It delegates to the released exchangeInfo round trip, forwards caller-owned cancellation, returns successful authoritative metadata facts unchanged, and translates released round-trip failure or connector rejection to `acquisition-failed`.

Explicit non-scope remains: concrete browser fetch/XHR/WebSocket/HTTP status/header/body semantics; retry/rate/request-weight policy; cache/polling/visibility/resume/session lifecycle; USDT eligibility/stablecoin exclusion/24h ranking/tie-break/Top-N; freshness/cadence; Home/Bubble UI; Your Trades/journal; persistence/chart/navigation/transitions.

## Hygiene action
Fresh main still contained the completed temporary reconstruction workflow `.github/workflows/binance-spot-exchange-info-instrument-metadata-acquisition-adapter-reconstruct.yml`. Its reconstruction job was complete and Gate #323 had already canonically passed, so it was proven temporary helper residue. It was removed only, producing main commit `09775f4ade4849d1deab3aa75e5a394349963728`. Fresh Actions after cleanup showed zero in-progress workflows.

## Source-proven next dependency-safe responsibility
The released P21.14 24h chain establishes the next transport dependency pattern after a provider acquisition adapter: a narrow concrete browser public-REST connector performs exactly one native `globalThis.fetch` for an already-described request, forwards the exact caller-owned `AbortSignal`, returns `Response.text()` unchanged, and does not inspect HTTP status/headers or invent retry/error/provider semantics. The Gate #323 exchangeInfo adapter still depends on the injected `BinanceSpotExchangeInfoPublicRestRequestConnector<unknown>` and therefore has no concrete browser transport.

The next smallest missing seam is therefore **Binance Spot exchangeInfo browser public REST connector foundation** only. Intended responsibility: implement the released exchangeInfo request-connector type with exactly one native browser fetch of the already-owned request descriptor, forward `options?.signal` unchanged, return response text unchanged for the released decode path, and preserve native fetch/text rejection for the existing adapter failure translation.

Explicit next-slice non-scope: no endpoint/path/query ownership beyond the released descriptor; no HTTP status/header/error taxonomy; no credentials/custom headers/cache/redirect/timeout; no retry/backoff/rate/request-weight policy; no JSON decode/mapping; no acquisition lifecycle/polling/visibility/resume; no universe filtering/ranking/Top-N/stablecoin policy; no freshness/cadence; no UI/Your Trades/persistence/chart/navigation/transitions.

## Architecture reconciliation status
Gate #323 ownership requires a living `docs/KAIROS_ARCHITECTURE_MAP.md` append. This invocation will use one narrow docs-only helper because the connector surface does not provide an atomic append operation for the existing large map. No production runtime change belongs in that reconciliation.

## Next safe action
Create/monitor exactly one narrow Gate323 architecture-reconciliation helper. While it is queued/in-progress, monitor only. After full helper success and self-cleanup, re-prove main/Actions and then implement exactly one Binance exchangeInfo browser public REST connector candidate from Gate #323 GOLDEN. Do not start a browser acquisition binding or universe policy in the same slice.
