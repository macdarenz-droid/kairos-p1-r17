# P21 Binance Spot exchangeInfo Public REST Response Decode Source Proof — 2026-09-08

Status: NON-CANONICAL continuity evidence only. Fresh controlling handoff + canonical GitHub override this note.

Worker token: `W16-SAME-WORKER-RESTORED-20260908-A-DECODE-2106`.

## Fresh authority re-proved
- Latest canonical GOLDEN is **Binance Spot Exchange Information Public REST Request Execution Boundary Foundation** via exact `Kairos Controlled Roadmap Gate` #315 / run `34206420246` / job `101996850014`, head `c1e44fdaaa028fe4031f4923a802f7e035ef77e7`, full SUCCESS.
- Mandatory primary architecture reconciliation for #315 is COMPLETE on engineering main `68eaf0925304b432d941b5c4fe55aeb8b49557c6`; gate-head→main changes only `docs/KAIROS_ARCHITECTURE_MAP.md`, +11/-0.
- Fresh Actions proof before this source decision: zero queued and zero in-progress workflow runs.

## Exact source/owner proof
Canonical #315 owns only an injected execution boundary around the already-described public Binance Spot `GET /api/v3/exchangeInfo` request. It deliberately does not own response representation, JSON parsing, semantic interpretation, or metadata mapping.

The exact canonical #315 candidate also contains the already-released Binance Spot 24h REST ownership sequence:
`request descriptor -> injected request execution -> JSON-text response decode -> semantic response delivery -> round trip -> acquisition adapter`.

Its response-decode owner `binanceSpot24hPublicRestBaselineResponseDecode.ts` is intentionally pure: it accepts `unknown`, accepts only text, performs `JSON.parse`, returns `payload: unknown` on success, and returns deterministic `unsupported-response-data` / `invalid-json` failures without acquiring a network response or interpreting provider fields.

Provider-neutral exchangeInfo metadata truth already has a separate canonical owner in `liveMarketUniverseInstrumentMetadataFact.ts` (`instrument`, `baseAsset`, `quoteAsset`, `tradingEnabled`). Therefore decoding JSON and interpreting exchangeInfo `symbols[]` metadata must remain separate responsibilities.

## Official-source confirmation
Current official Binance documentation continues to expose exchange-information responses as JSON market-data structures, while Binance terminology distinguishes base asset, quote asset and trading status. This supports keeping transport/JSON decoding mechanically separate from later semantic mapping; no product-policy decision is required here.

## Source-proven next responsibility
**Binance Spot Exchange Information Public REST Response Decode Foundation** only, patch number intentionally not inferred.

Smallest safe responsibility:
- accept already-received response data as `unknown`;
- accept only JSON text under the existing released Binance REST response-representation convention;
- parse exactly once with `JSON.parse`;
- return `{ ok: true, payload: unknown }` on valid JSON;
- return deterministic `unsupported-response-data` for non-text input and `invalid-json` for malformed JSON;
- export through the existing market-data barrel.

## Explicit non-scope
- no fetch/XHR/WebSocket/browser transport or `Response` acquisition;
- no HTTP status/header/body ownership;
- no interpretation of `symbols`, `symbol`, `status`, `baseAsset`, `quoteAsset`, filters, permissions, or trading eligibility;
- no mapping to `LiveMarketUniverseInstrumentMetadataFact` and no `status -> tradingEnabled` decision;
- no request execution/descriptor widening;
- no cache/polling/refresh/retry/backoff/request-weight/rate-limit policy;
- no USDT filtering, stablecoin exclusion, quote-volume ranking, tie-break or Top-N;
- no freshness policy change;
- no Home/Bubble/Your-Trades/persistence/chart/navigation/transition ownership.

## Next safe action
From exact canonical #315 only, build one mechanically constrained NON-CANONICAL deterministic candidate for this response-decode seam, mirroring the released Binance 24h decoder ownership pattern. Require exact six-file scope, dedicated verifier/focused tests, pinned toolchain, typecheck/build/full regression, clean `kairos_p76/` packaging, ZIP integrity and candidate identity before any canonical gate retarget.