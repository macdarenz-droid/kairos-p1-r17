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
| Risk/Reward semantics + provider-neutral chart composition | P19, CLOSED canonically at P19.7 | `src/application/risk-reward/`, `src/app/riskRewardChartStyleProjection.ts`, `src/app/riskRewardChartPlacementProjection.ts`, `src/app/riskRewardChartObjectProjection.ts` | Owns RR meaning and provider-neutral logical composition only; no P18 provider machinery, P11 truth, P20 persistence, UI/pixels, or hard-coded colors |
| Saved Analysis logical persistence contract | P20.1 | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Logical composition only; no DB/schema/repository/backup/UI/provider/pixel ownership |
| Saved Analysis persisted storage / backup / restore | P20.2 | `src/data/database/`, `src/data/repositories/SavedAnalysisRepository.ts`, `src/data/backup/` | Persists/restores P20.1 truth only; no UI/provider/pixel or speculative query ownership |
| Saved Analysis application save orchestration | P20.3 | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Fresh-id allocation + one atomic write only; no read/update/delete/list ownership |
| Saved Analysis application load-one orchestration | P20.4 | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | One stable-id read only; no list/update/delete/schema/UI/provider ownership |
| Saved Analysis system | P20, CLOSED canonically at P20.5 | P20.1 + P20.2 + P20.3 + P20.4 | Closure adds no new runtime owner or speculative CRUD expansion |
| Home Dashboard route presentation ownership | P21.1 | `src/app/HomeRoute.tsx`, wired by `src/app/routes.tsx` | Presentation/semantic dashboard boundary only; no navigation/provider/persistence/calculation/Bubble/Saved-Analysis/P22/P40 truth |
| Live market summary provider-neutral fact contract | P21.2 | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryFactSemantics.ts`, exported through `src/services/market-data/index.ts` | Validated raw per-instrument market-summary facts only; no transport/universe/state/Bubble/Home/persistence/journal/transition ownership |
| Live market summary delivery completeness contract | P21.3 | `src/services/market-data/marketDataTypes.ts`, `src/services/market-data/liveMarketSummaryDeliverySemantics.ts`, exported through `src/services/market-data/index.ts` | `incremental` vs caller-scoped `complete-for-scope` semantics only; no scope selection, transport, state, UI, persistence, journal or transition ownership |
| Live market summary baseline acquisition port contract | P21.4 | `src/services/market-data/LiveMarketSummaryBaselineAcquisitionPort.ts`, `src/services/market-data/liveMarketSummaryBaselineAcquisitionSemantics.ts`, exported through `src/services/market-data/index.ts` | Provider-neutral explicit-scope baseline port/result/validation only; no universe/provider endpoint/state/Bubble/Home/persistence/transition ownership |
| Binance Spot 24h summary fact provider mapping | P21.5 under P16 | `src/services/market-data/providers/binance/binanceSpot24hSummaryFact.ts`, exported through `src/services/market-data/index.ts` | One decoded Binance ticker + caller-owned `observedAt` -> one validated P21.2 fact; no HTTP/request/batching/P21.4/state/UI ownership |
| Binance Spot 24h baseline delivery provider composition | P21.6 under P16 | `src/services/market-data/providers/binance/binanceSpot24hBaselineDelivery.ts`, exported through `src/services/market-data/index.ts` | Explicit scope + decoded one-or-many ticker payload + `observedAt` -> validated P21.3 `complete-for-scope`; response order is not ranking truth; no transport/query/state/UI ownership |
| Binance Spot 24h public REST baseline request descriptor | P21.7 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineRequest.ts`, exported through `src/services/market-data/index.ts` | Pure request description for explicit scope: public GET `https://data-api.binance.vision/api/v3/ticker/24hr`, `symbol` or encoded `symbols`, `type=FULL`; no transport/execution/decode/batching/rate-limit/retry/P21.4/state/UI ownership |
| Binance Spot 24h public REST baseline request execution boundary | P21.8 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineRequestExecution.ts`, exported through `src/services/market-data/index.ts` | Invoke one externally supplied generic connector exactly once for one P21.7 request and return its result unchanged; no concrete transport/response/decode/state/UI ownership |
| Binance Spot 24h public REST baseline response decode | P21.9 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineResponseDecode.ts`, exported through `src/services/market-data/index.ts` | Deterministic JSON-text decode only: string -> `JSON.parse` -> `unknown`; malformed -> `invalid-json`; non-text -> `unsupported-response-data`; no Response/status/body/ticker semantics/P21.6/state/UI ownership |
| Binance Spot 24h public REST baseline response delivery composition | P21.10 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineResponseDelivery.ts`, exported through `src/services/market-data/index.ts` | Explicit caller scope + one already-received response data value + caller-owned `observedAt` -> reuse P21.9 decode -> reuse P21.6 mapping -> existing delivery/failure. No request description/execution, concrete transport/Response/status/header/body acquisition, new ticker validation/completeness algorithm, scope/universe/ranking, batching/rate-limit/retry, concrete P21.4 adapter, state/freshness/reconnect, Bubble/Your-Trades/Home/persistence/transitions |

## P18 closure boundary

P18.1–P18.59 establish the generic drawing/provider/interaction/selection/deletion/trend-line editing lifecycle owners. P18.60 is the canonical P18 system closure. P18 remains generic chart drawing/provider/interaction ownership and does not absorb Risk/Reward semantics or persistence.

## P19 canonical ownership ledger — CLOSED through P19.7

P19.7 remains the canonical P19 system closure via `Kairos Controlled Roadmap Gate` #280 / run `34021672747`.

## P20 canonical ownership ledger — CLOSED through P20.5

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis contract foundation and identity | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Logical Saved Analysis composition only |
| P20.2 | Saved Analysis persistence foundation | DB V4 `savedAnalyses`; `SavedAnalysisRepository`; backup/restore seams | Persist/restore P20.1 truth atomically |
| P20.3 | Saved Analysis save orchestration | `src/application/saved-analysis/saveSavedAnalysis.ts` | Fresh id + one atomic write only |
| P20.4 | Saved Analysis load-one-by-id orchestration | `src/application/saved-analysis/loadSavedAnalysis.ts` | One stable-id read only |
| P20.5 | Saved Analysis SYSTEM CLOSURE | verification/docs/package closure only | No new runtime seam |

## Canonical P20 evidence

P20.1: gate #281 / run `34025578061` SUCCESS.
P20.2: gate #282 / run `34040888312` SUCCESS.
P20.3: gate #283 / run `34045317884` SUCCESS.
P20.4: gate #284 / run `34051280988`, job `101535244582`, head `5fcbafc31c5c91b13e07f1687332d5f2cc29ef61`, SUCCESS.
P20.5: gate #285 / run `34059034331`, job `101556113020`, head `a88b2d480ed0e8ae5cb571ead97a91d36693c4b0`, SUCCESS. Exact artifacts: `KAIROS_CURRENT_CANDIDATE` `9996997282`, 1,167,501 bytes, `sha256:adf73735e84fe2bc79a0651fe14d76f2ee95860c1165f5da67c9337db9bfd6cd`; `KAIROS_GATE_EVIDENCE` `9996997437`, 1,003 bytes, `sha256:869936a9c79813fd93e330c2d94bcb18f2ad5c08671bcf84f32e7939c282d8aa`.

Therefore P20.5 closed P20 canonically.

## P21 canonical ownership ledger — OPEN through P21.10

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P21.1 | Home Dashboard Route Ownership Foundation | `src/app/HomeRoute.tsx`, `src/app/routes.tsx` | Home presentation only |
| P21.2 | Live Market Summary Fact Contract Foundation | `marketDataTypes.ts`, `liveMarketSummaryFactSemantics.ts` | Provider-neutral raw facts only |
| P21.3 | Live Market Summary Delivery Completeness Contract Foundation | `liveMarketSummaryDeliverySemantics.ts` | Explicit completeness semantics only |
| P21.4 | Live Market Summary Baseline Acquisition Port Foundation | `LiveMarketSummaryBaselineAcquisitionPort.ts`, `liveMarketSummaryBaselineAcquisitionSemantics.ts` | Provider-neutral explicit-scope baseline port only |
| P21.5 | Binance Spot 24h Summary Fact Mapping Foundation | `providers/binance/binanceSpot24hSummaryFact.ts` | One decoded ticker -> one P21.2 fact only |
| P21.6 | Binance Spot 24h Baseline Delivery Mapping Foundation | `providers/binance/binanceSpot24hBaselineDelivery.ts` | Decoded one-or-many payload -> validated caller-scope delivery only |
| P21.7 | Binance Spot 24h Public REST Baseline Request Descriptor Foundation | `providers/binance/binanceSpot24hPublicRestBaselineRequest.ts` | Request description only |
| P21.8 | Binance Spot 24h Public REST Baseline Request Execution Boundary Foundation | `providers/binance/binanceSpot24hPublicRestBaselineRequestExecution.ts` | One supplied generic connector call only |
| P21.9 | Binance Spot 24h Public REST Baseline Response Decode Foundation | `providers/binance/binanceSpot24hPublicRestBaselineResponseDecode.ts` | JSON-text decode to `unknown` only |
| P21.10 | Binance Spot 24h Public REST Baseline Response Delivery Composition Foundation | `providers/binance/binanceSpot24hPublicRestBaselineResponseDelivery.ts` | Compose P21.9 decode + P21.6 delivery mapping for one already-received response data value; no transport/status/body/acquisition/state/UI ownership |

## Canonical P21 evidence

P21.1: gate #286 / run `34061840453`, job `101563628073`, head `13d55093a569a156f316ccb848e6bd84e4e437ea`, SUCCESS.
P21.2: gate #287 / run `34066483131`, job `101576023230`, head `13a7ac6de0b3753c39a7da006eef995fec94ce42`, SUCCESS.
P21.3: gate #288 / run `34069156361`, job `101583192503`, head `b8e6742e707d3c8eaf75c1b555e7d382663e579b`, SUCCESS.
P21.4: gate #289 / run `34072260372`, job `101591633032`, head `67440a867790f45326bcc55b631b2367f2f3593f`, SUCCESS.
P21.5: gate #290 / run `34074736949`, job `101598528300`, head `cb34148873183fa058fea6bdf39b51e4ee8bd132`, SUCCESS.
P21.6: gate #291 / run `34078317199`, job `101608666615`, head `f68abdf067e81a63cdb9c5223526449c138b841a`, SUCCESS.
P21.7: gate #292 / run `34083915392`, job `101624231092`, head `fb7ce6e9b74916e58266f4f96f92641ed86175d1`, SUCCESS.
P21.8: gate #293 / run `34087112414`, job `101633147869`, head `a435ba0d0369336dc89389aa7c2ebc7d3d2c95e2`, SUCCESS.
P21.9: gate #294 / run `34090844909`, job `101643824896`, head `bce74c2f64ec9922af34cfdc4baaaf44a4ecdb0d`, SUCCESS. Exact artifacts: `KAIROS_CURRENT_CANDIDATE` `10006980372`, 1,199,745 bytes, `sha256:e5cc179e938db367df6da82447148de1077ab752a52fb2e3366a36de7114c03a`; `KAIROS_GATE_EVIDENCE` `10006980609`, 1,273 bytes, `sha256:1cd631a1f71a191a290e925a90fd266ae2190f787d4d7acff0ef7d6563a498f7`.

P21.10: `Kairos Controlled Roadmap Gate` #295 / run `34095614597`, job `101658498951`, exact head `0ecbc2c92b1f367808971b244df28305de5f969d`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.9 base/candidate extraction, exact controlled P21.9→P21.10 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.10 Binance Spot 24h public REST baseline response-delivery-composition verifier/runtime, full unit regression, full controlled-roadmap regression through P21.10, historical closures, and both exact-run artifact uploads.

Exact P21.10 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10008642188`, 1,203,658 bytes, digest `sha256:f1cde60eb75f1aec12cc194d83f0ae6a2208c6b71d97e50db65eef03466fc6e7`.
- `KAIROS_GATE_EVIDENCE` artifact `10008642596`, 1,405 bytes, digest `sha256:31a60cddc58405cad782a09418dbf092694266a976dce7dc60af5c7b937b35a0`.

Therefore P21.10 is the canonical GOLDEN. P21 remains OPEN; later P21 responsibilities must be independently source-proven before implementation.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P12 remains bounded journal-history/listing truth; Home/Bubble UI must not bypass it with direct IndexedDB reads.
- P14 remains journal/trade-visualization truth where assigned.
- P15 remains market acquisition truth and P16 remains Binance Spot provider ownership.
- P21.5 owns provider fact mapping; P21.6 decoded-payload delivery composition; P21.7 request description; P21.8 generic execution boundary; P21.9 deterministic JSON-text response decoding; P21.10 composes P21.9 + P21.6 for one already-received response data value. None of these infer concrete browser transport, HTTP status/header/body acquisition, concrete P21.4 orchestration, universe/ranking, state, or UI behavior.
- P18 remains generic drawing/provider/interaction machinery.
- P19 remains Risk/Reward semantic and provider-neutral logical composition truth.
- P20 remains closed Saved Analysis truth; no generic CRUD expansion is inferred from P21 work.
- P21.1 owns only Home route presentation/composition semantics; P8 navigation remains authoritative.
- P21.2 owns only provider-neutral Live Market Summary raw facts.
- P21.3 owns only delivery completeness semantics.
- P21.4 owns only the provider-neutral baseline acquisition port/result/validation contract; caller supplies scope.
- P21.5 owns only one decoded Binance ticker -> P21.2 mapping with caller-owned `observedAt`.
- P21.6 owns only one-or-many decoded payload -> validated P21.3 `complete-for-scope` delivery.
- P21.7 owns only pure Binance Spot public REST request description.
- P21.8 owns only one injected generic execution call and unchanged connector result.
- P21.9 owns only JSON-text decoding to `unknown`.
- P21.10 owns only response-delivery composition over existing P21.9/P21.6 owners for already-received response data; it does not execute a request or define HTTP response acquisition semantics.
- Live Crypto Bubble Map and Your Trades Bubble Map remain distinct products with distinct authoritative upstream data flows. Shared future bubble-layout code must remain presentation-only.
- Approved dashboard transitions remain presentation-only and may never own or delay route/navigation/data/persistence/calculation/chart/Saved-Analysis/dashboard-selection truth.
- P2/P3 design tokens remain style-value authority.
- UI/presentation amendments must preserve business/data/navigation truth and use controlled amendments from latest GOLDEN.

## Next audit checkpoint

P21 is open through canonical P21.10. Before any later P21 implementation, reread controlling handoff/current user rules, exact P21.10 GOLDEN, continuity/process history, Retry Ledger, current P15/P16/P21 market owners, P12 journal-history seam, Home/dashboard consumers, and current official provider behavior as needed. Prove exactly one smallest dependency-safe next responsibility and explicit non-scope. Do not infer a next patch by numbering. In particular, do not infer concrete fetch/XHR/WebSocket transport, concrete Response/HTTP status/header/body acquisition, request execution orchestration, batching/chunking, request-weight/rate-limit/retry policy, credentials, a concrete P21.4 acquisition-port adapter, market-universe selection/ranking, accumulation/state/order/freshness/reset/reconnect behavior, Bubble size/color/ranking/grouping/filter/interactions, Your-Trades visualization semantics, or transition implementation merely from P21.10's response-delivery composition seam.
