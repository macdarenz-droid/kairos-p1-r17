# KAIROS ARCHITECTURE MAP (Living Document)

## Purpose

This is the living ownership map for Kairos. Canonical code/gate truth always overrides this descriptive document.

## Maintenance rule

Update this file after every canonical PASS that establishes, extends, moves, or clarifies a production responsibility/owner/boundary, and at every phase closure. Only canonically proven ownership belongs here. Helper/candidate-only results are not architecture authority.

## Core Truth Ownership

| Concept / Truth | Owner (Phase) | File / Module | Boundary — what it must NOT do |
|---|---|---|---|
| Journal execution truth | P9 / P10 | canonical journal domain/application seams | Never silently overwritten by market data |
| Derived financial metrics | P11 Calculation Brain | canonical P11 calculation seams | UI is never a second calculation owner |
| Journal history / record listing | P12 | canonical P12 seams | No duplicate execution/calculation truth |
| Visual P&L presentation | P13 | canonical P13 seams | Must not aggregate incomparable currencies |
| Trade visualizer | P14 | canonical P14 seams | Visualization does not own journal truth |
| Market data acquisition | P15 | canonical P15 seams | Never overwrites journal execution truth |
| Binance Spot provider | P16 | canonical P16 provider seams | Provider mapping is not journal truth |
| Chart rendering / presentation | P17 | canonical P17 seams | Presentation only; never decides financial truth |
| Drawing tools / generic drawing-edit lifecycle | P18, CLOSED canonically at P18.60 | `src/features/chart/` and canonical P18 application/provider seams | No persistence/P20 ownership; no Risk/Reward/P19 meaning; no journal/calculation truth |
| Risk/Reward semantics + provider-neutral chart composition | P19, CLOSED canonically at P19.7 | `src/application/risk-reward/`, `src/app/riskRewardChartStyleProjection.ts`, `src/app/riskRewardChartPlacementProjection.ts`, `src/app/riskRewardChartObjectProjection.ts` | Owns RR meaning, semantic levels/zones, style-token references, logical placement/object composition only; no P18 provider machinery, P11 calculation truth, P14 journal writes, P20 persistence, DOM/UI, pixel geometry, normalization/order validation, or hard-coded colors |
| Saved Analysis logical persistence contract | P20.1 | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Composes existing P17/P18/P19 logical truth only; no DB/schema/migration/repository/backup implementation, no UI, no provider state, no pixels, no duplicated RR/drawing semantics, no invented timeframe/metadata |
| Saved Analysis persisted storage / backup / restore | P20.2 | `src/data/database/`, `src/data/repositories/SavedAnalysisRepository.ts`, `src/data/backup/` | Persists and restores the P20.1 logical contract only; no UI/provider/pixels, no duplicated P17/P18/P19 semantics, no speculative secondary indexes/query APIs, and no optional metadata invention |
| Saved Analysis application save orchestration | P20.3 | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Allocates a fresh Saved Analysis id and coordinates exactly one atomic persisted write using P20.1 logical truth and P20.2 persistence; no UI/provider/pixels, no second repository/schema owner, no duplicated P17/P18/P19 semantics, and no speculative load/update/delete/list orchestration |
| Saved Analysis application load-one orchestration | P20.4 | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | Reads one persisted Saved Analysis by its stable id through the P20.2 repository boundary; no UI/provider/pixels, no second persistence owner, no list/update/delete orchestration, and no redefinition of P17/P18/P19/P20.1 truth |
| Saved Analysis system | P20, CLOSED canonically at P20.5 | P20.1 logical contract + P20.2 persistence/backup/restore + P20.3 save + P20.4 load-one | Closure adds no new production runtime owner; no speculative list/update/delete lifecycle, UI/provider/pixel ownership, schema/index widening, or invented metadata |
| Home Dashboard route presentation ownership | P21.1 | `src/app/HomeRoute.tsx`, wired by `src/app/routes.tsx` at existing `/` index route | Presentation/semantic dashboard boundary only; does not own navigation truth, provider/live market data, persistence/query/calculation truth, Bubble Map geometry/algorithms, Saved Analysis CRUD, P22 behavior, or P40/global transition motion |
| Live market summary provider-neutral fact contract | P21.2 | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryFactSemantics.ts`, exported through `src/services/market-data/index.ts` | Owns only validated raw per-instrument market-summary fact shape/semantics; no transport/acquisition choice, market-universe selection, accumulation/snapshot/freshness policy, Bubble rendering/metric/color/ranking/grouping/filter/interactions, Home wiring, persistence, journal/calculation truth, Your-Trades semantics, or transition motion |
| Live market summary delivery completeness contract | P21.3 | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryDeliverySemantics.ts`, exported through `src/services/market-data/index.ts` | Owns only provider-neutral delivery completeness semantics over validated P21.2 facts: `incremental` is partial/changed-symbol evidence; `complete-for-scope` is complete only for an explicit caller-declared scope. It does not select the scope/universe and owns no provider transport/acquisition, accumulator/state/freshness/reset/error policy, Bubble visualization semantics, Home wiring, persistence, journal/Your-Trades truth, or transition motion |
| Live market summary baseline acquisition port contract | P21.4 | `src/services/market-data/LiveMarketSummaryBaselineAcquisitionPort.ts`, `src/services/market-data/liveMarketSummaryBaselineAcquisitionSemantics.ts`, exported through `src/services/market-data/index.ts` | Owns only the provider-neutral port/result/validation seam for acquiring a P21.3 `complete-for-scope` baseline for an explicit caller-provided scope. It does not choose/rank the universe, implement Binance/transport/endpoints, alter P15 single-instrument subscription ownership, accumulate market state, define freshness/reset/reconnect policy, render Bubble UI, wire Home, persist data, own journal/Your-Trades truth, or own transitions |
| Binance Spot 24h summary fact provider mapping | P21.5 under the existing P16 Binance Spot provider boundary | `src/services/market-data/providers/binance/binanceSpot24hSummaryFact.ts`, exported through `src/services/market-data/index.ts` | Owns only pure provider-payload mapping/validation from one decoded Binance Spot 24h ticker entry plus caller-owned `observedAt` into one canonical P21.2 `LiveMarketSummaryFact`; no HTTP/fetch, endpoint/query construction, batching/request-weight policy, P21.4 port implementation, universe selection, state/freshness/reset, Bubble UI, Home wiring, persistence, journal/Your-Trades semantics, or transitions |
| Binance Spot 24h baseline delivery provider composition | P21.6 under the existing P16 Binance Spot provider boundary | `src/services/market-data/providers/binance/binanceSpot24hBaselineDelivery.ts`, exported through `src/services/market-data/index.ts` | Owns only pure provider composition from explicit caller scope + decoded one-or-many Binance Spot 24h ticker payload + caller-owned `observedAt` into a validated P21.3 `complete-for-scope` delivery by reusing P21.5 per-entry mapping and P21.3/P21.4 completeness validation. It rejects invalid payload shape, invalid mapped entries, duplicates, out-of-scope facts, or missing requested facts; provider response order is not universe/ranking truth. No HTTP/fetch/browser transport, REST host/path/query policy, `symbol` vs `symbols` choice, batching/request-weight/rate-limit/retry, credentials, concrete P21.4 adapter orchestration, universe/ranking/state/freshness/reset/reconnect, Bubble UI, Home wiring, persistence, journal/Your-Trades semantics, or transitions |

## P18 closure boundary

P18.1–P18.59 establish the generic drawing, provider, interaction, selection, deletion and trend-line editing lifecycle owners. P18.60 is the canonical P18 system closure. P18 remains the generic chart drawing/provider/interaction owner and explicitly does not absorb Risk/Reward semantics or persistence.

## P19 canonical ownership ledger — CLOSED through P19.7

P19.7 remains the canonical P19 system closure via `Kairos Controlled Roadmap Gate` #280 / run `34021672747`.

## P20 canonical ownership ledger — CLOSED through P20.5

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis contract foundation and dedicated SavedAnalysis identity | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Logical Saved Analysis composition only; no persistence/UI/provider/pixel ownership |
| P20.2 | Saved Analysis persistence foundation | DB V4 `savedAnalyses` store; `src/data/repositories/SavedAnalysisRepository.ts`; backup/restore seams | Persists/restores P20.1 truth atomically; no UI/provider/pixels or speculative query metadata |
| P20.3 | Saved Analysis application-save orchestration | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Fresh-id allocation + one atomic repository write only; no inferred read/update/delete/list ownership |
| P20.4 | Saved Analysis application load-one-by-id orchestration | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | One stable-id repository read only; no UI/provider/pixels, list/update/delete orchestration, schema/backup/index changes, or invented metadata |
| P20.5 | Saved Analysis SYSTEM CLOSURE | Verification/docs/package closure only; no new production runtime seam | Proves P20.1–P20.4 collectively complete the source-proven Saved Analysis responsibility; no speculative CRUD/runtime/UI/provider/schema expansion |

## Canonical P20 evidence

P20.1: `Kairos Controlled Roadmap Gate` #281 / run `34025578061` completed SUCCESS.

P20.2: `Kairos Controlled Roadmap Gate` #282 / run `34040888312` completed SUCCESS.

P20.3: `Kairos Controlled Roadmap Gate` #283 / run `34045317884` completed SUCCESS.

P20.4: `Kairos Controlled Roadmap Gate` #284 / run `34051280988`, job `101535244582`, exact head `5fcbafc31c5c91b13e07f1687332d5f2cc29ef61`, completed SUCCESS on 2026-09-07.

P20.5: `Kairos Controlled Roadmap Gate` #285 / run `34059034331`, job `101556113020`, exact head `a88b2d480ed0e8ae5cb571ead97a91d36693c4b0`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P20.4→P20.5 four-file closure scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation/build, dedicated P20.5 Saved Analysis system-closure verifier/runtime, full unit regression, full controlled-roadmap regression through P20.5, historical closures, and both exact-run artifact uploads.

Exact P20.5 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9996997282`, 1,167,501 bytes, digest `sha256:adf73735e84fe2bc79a0651fe14d76f2ee95860c1165f5da67c9337db9bfd6cd`.
- `KAIROS_GATE_EVIDENCE` artifact `9996997437`, 1,003 bytes, digest `sha256:869936a9c79813fd93e330c2d94bcb18f2ad5c08671bcf84f32e7939c282d8aa`.

Therefore P20.5 closed P20 Saved Analysis canonically.

## P21 canonical ownership ledger — OPEN through P21.6

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P21.1 | Home Dashboard Route Ownership Foundation | `src/app/HomeRoute.tsx`, `src/app/routes.tsx` index wiring | Dedicated Home presentation owner on existing `/`; preserves P8 `AppShell`/navigation/safe-area/theme truth and all existing business/data owners; no Bubble Map metrics/geometry, provider/live-data subscription, new persistence/query/calculation owner, Saved Analysis CRUD, P22 behavior, or full transition implementation |
| P21.2 | Live Market Summary Fact Contract Foundation | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryFactSemantics.ts`, `src/services/market-data/index.ts` | Provider-neutral validated raw facts only: instrument identity, last/current price, rolling-24h open/high/low, rolling-24h base/quote volume, provider/source timestamp and local observed-at timestamp; no transport/acquisition choice, universe, aggregation/snapshot/freshness/error policy, Bubble visualization semantics or geometry, Home wiring, persistence, journal/calculation truth, Your-Trades semantics, or transitions |
| P21.3 | Live Market Summary Delivery Completeness Contract Foundation | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryDeliverySemantics.ts`, `src/services/market-data/index.ts` | Provider-neutral delivery semantics only: `incremental` facts make no completeness claim; `complete-for-scope` requires an explicit non-empty unique scope and exactly one validated P21.2 fact per declared instrument, with no out-of-scope or duplicate fact instruments. No scope/universe selection, transport/acquisition, accumulator/state/freshness/reset/error policy, Bubble UI semantics, Home wiring, persistence, Your-Trades, or transitions |
| P21.4 | Live Market Summary Baseline Acquisition Port Foundation | `src/services/market-data/LiveMarketSummaryBaselineAcquisitionPort.ts`, `src/services/market-data/liveMarketSummaryBaselineAcquisitionSemantics.ts`, exported through `src/services/market-data/index.ts` | Provider-neutral baseline acquisition port contract only: explicit caller-provided scope in; validated P21.3 `complete-for-scope` delivery or explicit `acquisition-failed` result out. Scope membership on success must exactly match the caller request. No universe selection/ranking, Binance/provider endpoint implementation, REST-vs-WebSocket choice, polling/subscription/reconnect, accumulator/state/freshness/reset policy, Bubble UI semantics, Home wiring, persistence, Your-Trades, or transitions |
| P21.5 | Binance Spot 24h Summary Fact Mapping Foundation | `src/services/market-data/providers/binance/binanceSpot24hSummaryFact.ts`, exported through `src/services/market-data/index.ts` | Pure provider mapping only: one decoded Binance Spot 24h ticker entry plus caller-owned `observedAt` → one validated P21.2 `LiveMarketSummaryFact`, using `BINANCE_SPOT_VENUE`; maps `lastPrice`→`lastPrice`, `openPrice`→`open24h`, `highPrice`→`high24h`, `lowPrice`→`low24h`, `volume`→`baseVolume24h`, `quoteVolume`→`quoteVolume24h`, valid `closeTime`→ISO `sourceTimestamp`, then canonical P21.2 fact validation. No HTTP/fetch, REST URL/query construction, batching/request-weight policy, P21.4 adapter, universe selection, accumulator/state/freshness/reset, Bubble semantics, Home wiring, persistence, Your-Trades, or transitions |
| P21.6 | Binance Spot 24h Baseline Delivery Mapping Foundation | `src/services/market-data/providers/binance/binanceSpot24hBaselineDelivery.ts`, exported through `src/services/market-data/index.ts` | Pure provider composition only: explicit caller-provided scope + decoded one-or-many Binance Spot 24h ticker payload + caller-owned `observedAt` → reuse P21.5 per-entry mapper → compose P21.3 `complete-for-scope` delivery → validate exact caller-scope membership through existing P21.3/P21.4 semantics. Reject invalid payload shape, invalid mapped entries, duplicates, out-of-scope facts, or missing requested facts; provider response order is not universe/ranking truth. No HTTP/fetch/browser transport, REST host/path/query policy, `symbol` vs `symbols` choice, batching/request-weight/rate-limit/retry, credentials, concrete P21.4 adapter orchestration, universe/ranking/state/freshness/reset/reconnect, Bubble semantics, Home wiring, persistence, Your-Trades, or transitions |

## Canonical P21 evidence

P21.1: `Kairos Controlled Roadmap Gate` #286 / run `34061840453`, job `101563628073`, exact head `13d55093a569a156f316ccb848e6bd84e4e437ea`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P20.5→P21.1 five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.1 route-ownership verifier/runtime, full unit regression, full controlled-roadmap regression through P21.1, historical closures, and both artifact uploads.

Exact P21.1 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9997837809`, 1,169,775 bytes, digest `sha256:801b75beb1ed2bc16d13e2fa74a6905441652cdbc3ff66154abe6612894fdd17`.
- `KAIROS_GATE_EVIDENCE` artifact `9997837954`, 973 bytes, digest `sha256:829a2cf8118b04c59eb8cd3ca82c713f6acb0ad5f7445d622bd0175347524f9b`.

P21.2: `Kairos Controlled Roadmap Gate` #287 / run `34066483131`, job `101576023230`, exact head `13a7ac6de0b3753c39a7da006eef995fec94ce42`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P21.1→P21.2 seven-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.2 Live Market Summary fact-contract verifier/runtime, full unit regression, full controlled-roadmap regression through P21.2, historical closures, and both exact-run artifact uploads.

Exact P21.2 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9999220162`, 1,173,555 bytes, digest `sha256:6354e9a0b1f93c78d98af17c47119ff8f4c5ab0a2b430466f3b45ffde27366ab`.
- `KAIROS_GATE_EVIDENCE` artifact `9999220414`, 1,235 bytes, digest `sha256:789b08f9ebf86111505585d752ae2bd849b93199795862cf26c98c051bb719b7`.

P21.3: `Kairos Controlled Roadmap Gate` #288 / run `34069156361`, job `101583192503`, exact head `b8e6742e707d3c8eaf75c1b555e7d382663e579b`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P21.2→P21.3 seven-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.3 delivery-completeness verifier/runtime, full unit regression, full controlled-roadmap regression through P21.3, historical closures, and both exact-run artifact uploads.

Exact P21.3 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10000015892`, 1,177,045 bytes, digest `sha256:a2eb23c6c4c6f5c20f1cf17fa4ed7ede7f31fbfbaf19a06a7b82ed065caab243`.
- `KAIROS_GATE_EVIDENCE` artifact `10000016067`, 1,242 bytes, digest `sha256:a8b6d5f814eda67bccbdf00b6ed719408201db34a896d3b656d3f534c518f42b`.

P21.4: `Kairos Controlled Roadmap Gate` #289 / run `34072260372`, job `101591633032`, exact head `67440a867790f45326bcc55b631b2367f2f3593f`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P21.3→P21.4 seven-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.4 Live Market Summary baseline-acquisition-port verifier/runtime, full unit regression, full controlled-roadmap regression through P21.4, historical closures, and both exact-run artifact uploads.

Exact P21.4 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10000988354`, 1,181,925 bytes, digest `sha256:d3816b8fb632631604c7cce8a0cf9bff9383ee72773c59d9efee56fde9cd5387`.
- `KAIROS_GATE_EVIDENCE` artifact `10000988591`, 1,260 bytes, digest `sha256:3f98c38fc4bc1ca79dc89733375a8827879ba2ebaa345b9af6b0951ded51bd80`.

P21.5: `Kairos Controlled Roadmap Gate` #290 / run `34074736949`, job `101598528300`, exact head `cb34148873183fa058fea6bdf39b51e4ee8bd132`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P21.4→P21.5 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.5 Binance Spot 24h summary fact mapping verifier/runtime, full unit regression, full controlled-roadmap regression through P21.5, historical closures, and both exact-run artifact uploads.

Exact P21.5 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10001755514`, 1,185,815 bytes, digest `sha256:ffc9fb98e79ceb7a683b5769f58348d635f4a76cb4cf2cf01b9371b646fd102b`.
- `KAIROS_GATE_EVIDENCE` artifact `10001755878`, 1,067 bytes, digest `sha256:fda1dcb0366cf9b62152a3997cf5ced766d7f5268662276aefdb4e4caf8d7055`.

P21.6: `Kairos Controlled Roadmap Gate` #291 / run `34078317199`, job `101608666615`, exact head `f68abdf067e81a63cdb9c5223526449c138b841a`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P21.5→P21.6 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.6 Binance Spot 24h baseline delivery mapping verifier/runtime, full unit regression, full controlled-roadmap regression through P21.6, historical closures, and both exact-run artifact uploads.

Exact P21.6 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10002995827`, 1,189,478 bytes, digest `sha256:4e6c2f7f440baef6620ef3900cd494b62fccb3eb7ec361d8e440374964947edc`.
- `KAIROS_GATE_EVIDENCE` artifact `10002996198`, 1,099 bytes, digest `sha256:f5d4c5d2bdefde0875327a11430c10e837458f3be2fab86a4a1e819cbcfabcb5`.

Therefore P21.6 is the canonical GOLDEN. P21 remains OPEN; later P21 responsibilities must be independently source-proven before implementation.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P12 remains bounded journal-history/listing truth; Home/Bubble UI must not bypass it with direct IndexedDB reads.
- P14 remains journal/trade-visualization truth where assigned.
- P15 remains market acquisition truth and P16 remains Binance Spot provider ownership; P21.5 adds only the canonical 24h ticker payload-to-P21.2-fact mapping seam and P21.6 adds only the pure one-or-many baseline-delivery composition seam under that provider boundary. P21.2/P21.3/P21.4 remain provider-neutral; neither P21.5 nor P21.6 owns browser networking/HTTP/query/batching/state/UI behavior.
- P18 remains generic drawing/provider/interaction machinery.
- P19 remains Risk/Reward semantic and provider-neutral logical composition truth.
- P20 remains the closed Saved Analysis system; no generic CRUD expansion is inferred from P21 work.
- P21.1 owns only Home route presentation/composition semantics on the existing `/` route; P8 `AppShell`/navigation remains authoritative.
- P21.2 owns only the provider-neutral Live Market Summary raw-fact contract/validation seam; it does not establish a complete market-universe view, acquisition method, accumulator, freshness policy, Bubble metric, or UI ownership.
- P21.3 owns only explicit delivery-completeness semantics over P21.2 facts. `incremental` must never be treated as a complete market view; `complete-for-scope` is complete only for its declared scope, and P21.3 does not choose that scope.
- P21.4 owns only the provider-neutral baseline acquisition port/result/validation contract. The caller provides the scope; P21.4 neither selects the universe nor implements Binance/transport/state/UI behavior, and P15's existing single-instrument subscription seam remains unchanged.
- P21.5 owns only pure Binance Spot 24h ticker payload → P21.2 fact mapping/validation with caller-owned `observedAt`; transport, endpoint/query construction, batching/request-weight policy, concrete P21.4 adapter orchestration, market universe, state/freshness/reset, Bubble/Home/Your-Trades/persistence/transitions remain separate.
- P21.6 owns only pure Binance Spot one-or-many 24h ticker payload composition into a validated P21.3 `complete-for-scope` delivery for an explicit caller scope by reusing P21.5 and P21.3/P21.4 validation; provider response order is not ranking/universe truth, and transport/query/batching/concrete adapter/state/UI ownership remains separate.
- The Live Crypto Bubble Map and Your Trades Bubble Map remain distinct products with distinct authoritative upstream data flows. Shared future bubble-layout code, if introduced, must remain presentation-only.
- The approved premium dashboard-transition direction remains presentation-only and must be layered through a clean motion seam later; animation must never own or delay route/navigation/data/persistence/calculation/chart/Saved Analysis/dashboard-selection truth.
- P2/P3 design tokens remain style-value authority; P19.4 references tokens rather than hard-coding colors.
- UI/presentation amendments must preserve business/data/navigation truth and use new controlled amendments from latest GOLDEN.

## Next audit checkpoint

P21 is open through canonical P21.6. Before any later P21 implementation, reread the controlling handoff/current user rules, exact P21.6 GOLDEN, process history, Retry Ledger, current P15/P16/P21 market owners, P12 journal-history seam, Home/dashboard consumers and current official provider behavior. Prove exactly one smallest dependency-safe next responsibility and explicit non-scope. Do not infer P21.7 by patch-number momentum. In particular, do not infer HTTP/fetch/browser transport, REST host/path/query construction, `symbol` vs `symbols` policy, symbol batching/request-weight/rate-limit/retry behavior, credentials, a concrete P21.4 acquisition-port adapter, market-universe selection/ranking, accumulation/state/order/freshness/reset/reconnect behavior, Bubble size/color/ranking/grouping/filter/interactions, Your-Trades visualization semantics, or transition implementation merely from P21.6's pure baseline-delivery composition seam.