# P21 Binance Spot exchangeInfo request execution boundary — helper start checkpoint

Date: 2026-09-08

## Canonical authority

Latest canonical GOLDEN is **Binance Spot Exchange Information Public REST Request Descriptor Foundation** (patch number intentionally not inferred) via `Kairos Controlled Roadmap Gate` #314 / run `34195620691` / job `101962579345`, exact head `a42c2480d7d11b624ec93466e102718ab6d5f01f`, full SUCCESS.

Exact canonical evidence supersedes one stale helper assertion:
- `KAIROS_CURRENT_CANDIDATE` id `10044020112`, wrapper size `1,271,076`, digest `sha256:c2ed121e6bc4dd59a54cd58fa4b8355c982747ff9bd2c8b9ee071e261c62d9af`.
- Inner canonical candidate `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_REQUEST_DESCRIPTOR_FOUNDATION_CANDIDATE_2026-09-08.zip`: size `1,478,000`, SHA-256 `c06073f0a30893df5f58f34069789be82b3afa0f26258330249a78d3bb81556d`, Git blob `d04540980f44101ad88fdd88f5848565ea8e2f51`, integrity PASS.
- `KAIROS_GATE_EVIDENCE` id `10044020584`, wrapper size `1,161`, digest `sha256:53812f771276b1c83021747e3d818ebda53a68549a2890b3d317cc28d35426ab`.
- Inner report size `1,642`, SHA-256 `f33ce544980622142c4e04f18f3cf77407a5179bf0e1e8e5e4e598db67296118`, integrity PASS.

Primary living architecture reconciliation for #314 is COMPLETE: final engineering main before the next helper was `17e98768fc215ceb3029c03ff6a31912f6b45772`; exact gate-head -> final-main compare changes only `docs/KAIROS_ARCHITECTURE_MAP.md`, +15/-0; final primary-map blob `848a3b9b9b2aa9adf0744d781d059291cc095ff3`; temporary docs helper leaves no final-tree residue.

## Source-proven next responsibility

Exactly one next responsibility is authorized: **Binance Spot Exchange Information Public REST Request Execution Boundary Foundation** only.

Source proof is recorded in prior process-history commit `1114e147c2cd9cccee2ff1a86c0e0a15f6781911`.

Responsibility:
- accept one already-described canonical `BinanceSpotExchangeInfoPublicRestRequestDescriptor`;
- accept an injected connector;
- invoke that connector exactly once;
- preserve the connector Promise/result and rejection unchanged;
- forward optional caller-owned `signal?: AbortSignal` execution options unchanged;
- own no concrete transport, response semantics, decode, metadata mapping, product policy or UI.

## Exact non-canonical helper

Engineering-main helper-definition commit: `9976ffc61d9dc3a0c51877347fc67707b32cdbee`.
Workflow: `.github/workflows/binance-spot-exchange-info-public-rest-request-execution-boundary-reconstruct.yml`.
Exact helper run: `34196885609`.
Exact job: `101966489160` (`reconstruct`).
Latest fresh state at checkpoint: IN_PROGRESS and sole active helper chain; setup, checkout, setup-node, npm pin and deterministic exact-slice reconstruction SUCCESS; `Verify reconstructed execution boundary before packaging` IN_PROGRESS; clean package/candidate commit PENDING.

Intended candidate only on full helper SUCCESS:
`KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_REQUEST_EXECUTION_BOUNDARY_FOUNDATION_CANDIDATE_2026-09-08.zip`.

Exact intended candidate delta is six files only:
1. `KAIROS_BINANCE_SPOT_EXCHANGE_INFO_PUBLIC_REST_REQUEST_EXECUTION_BOUNDARY_FOUNDATION_REPORT_2026-09-08.md`
2. `package.json`
3. `scripts/verify-binance-spot-exchange-info-public-rest-request-execution-boundary-foundation.mjs`
4. `src/services/market-data/index.ts`
5. `src/services/market-data/providers/binance/binanceSpotExchangeInfoPublicRestRequestExecution.ts`
6. `tests/binance-spot-exchange-info-public-rest-request-execution.test.ts`

Helper requirements: Node 22.16.0, npm 10.9.2, exact Lightweight Charts 5.2.1, dedicated execution-boundary verifier, canonical #314 descriptor verifier, universe-metadata verifier, freshness verifier, typecheck/build, focused tests, full Vitest/current historical verifier chain, clean `kairos_p76/` package boundary, ZIP integrity and fresh-extract verifier. Helper PASS remains NON-CANONICAL.

## Explicit non-scope

No concrete `fetch`/XHR/WebSocket/browser transport or `Response` acquisition; no HTTP status/header/body interpretation; no JSON decode; no exchangeInfo semantic decode/mapping into `LiveMarketUniverseInstrumentMetadataFact`; no metadata cache/polling/refresh/retry/backoff/request-weight/rate-limit policy; no USDT filtering, stablecoin exclusion, volume ranking, tie-break or Top-N; no freshness changes; no Home/stale/Bubble UI; no Your Trades/journal; no persistence/IndexedDB/Saved Analysis/chart/navigation/transition ownership.

## Next safe action

Re-prove helper run `34196885609` first. While queued/in-progress, MONITOR ONLY and do not mutate engineering main/docs/helper/candidate/gate or start a later responsibility. If helper succeeds, verify every exact stage, exact six-file delta, clean package/candidate filename/blob/size/SHA/integrity, remove temporary helper residue under verified lease only after candidate proof, prove zero competing Actions, then retarget only the exact canonical `Kairos Controlled Roadmap Gate`. If helper fails, inspect exact failed step/log and make only the smallest evidence-backed repair from canonical #314.
