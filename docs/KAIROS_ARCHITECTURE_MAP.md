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
| Binance Spot 24h public REST baseline round-trip composition | P21.11 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineRoundTrip.ts`, exported through `src/services/market-data/index.ts` | Explicit caller scope + caller-owned `observedAt` + externally supplied P21.8 connector -> P21.7 request description -> exactly one P21.8 execution -> P21.10 response delivery; connector rejection propagates unchanged. No P21.4/`AbortSignal` ownership, concrete transport/Response/status/header/body acquisition, retry/rate-limit/polling, new request/decode/ticker/completeness algorithm, state/freshness/reconnect, Bubble/Your-Trades/Home/persistence/transitions |
| Binance Spot 24h public REST baseline caller cancellation propagation | P21.12 under P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineRequestExecution.ts`, `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineRoundTrip.ts`, exported through `src/services/market-data/index.ts` | Optional caller-owned execution options carrying `signal?: AbortSignal` are forwarded unchanged through P21.8 and P21.11; no-options callers retain exact one-argument connector invocation and connector result/rejection semantics remain unchanged. No concrete transport/Response/status/body acquisition, AbortController creation/signal combination/timeout/abort interpretation/error translation, concrete P21.4 adapter, retry/rate-limit/polling, new semantic algorithm, state, or UI ownership |
| Binance Spot 24h public REST baseline acquisition adapter | P21.13 under P15/P16 | `src/services/market-data/providers/binance/binanceSpot24hPublicRestBaselineAcquisitionAdapter.ts`, exported through `src/services/market-data/index.ts` | Implements the P21.4 acquisition composition using released P21.11/P21.12 seams: injected transport, one caller-owned observation-time read per acquisition, unchanged caller options propagation, P21.4 success validation, and existing `acquisition-failed` mapping only. No concrete transport/HTTP response acquisition, clock/freshness policy, abort taxonomy, retry/rate-limit/polling, universe/ranking/batching, new provider semantics, state/persistence, Bubble/Home/Your-Trades/Saved-Analysis/transitions |
| Binance Spot 24h browser public REST baseline connector | P21.14 under P16 | `src/services/market-data/providers/binance/binanceSpot24hBrowserPublicRestBaselineConnector.ts`, exported through `src/services/market-data/index.ts` | Concrete P21.8-compatible browser transport only: exactly one `globalThis.fetch(request.url, { method: request.method, signal: options?.signal })`, exact caller signal forwarding, exactly one `Response.text()`, unchanged string return, unchanged native fetch/text rejection. No endpoint/query/symbol policy, HTTP status/header interpretation, retry/rate-limit policy, credentials, timeout/controller policy, provider decode/validation, clock/freshness, universe/ranking/state/persistence, Bubble/Home/Your-Trades/Saved-Analysis/transitions |
| Binance Spot 24h browser public REST baseline acquisition binding | P21.15 under P15/P16 | `src/services/market-data/providers/binance/binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding.ts`, exported through `src/services/market-data/index.ts` | Browser-ready factory only: compose released P21.13 acquisition adapter + released P21.14 browser connector and require caller-owned `readObservedAt`; preserve existing cancellation/result/rejection semantics. No new transport/Response acquisition, endpoint/query/status/header/error/retry/rate-limit/credentials/timeout policy, clock/freshness/polling/reconnect/scheduling, provider semantics, state/persistence, Bubble/Home/Your-Trades/Saved-Analysis/transitions |
| Live market summary delivery state | P21.16 | `src/services/market-data/liveMarketSummaryDeliveryState.ts`, exported through `src/services/market-data/index.ts` | Provider-neutral current-summary state only: key by normalized instrument identity, validate every P21.3 delivery, incremental upsert only delivered facts, `complete-for-scope` replace only its explicit scope while preserving out-of-scope facts, invalid delivery -> `delivery-invalid` with exact prior state unchanged, caller delivery order only. No universe/ranking/filtering/grouping/sorting/Bubble/Home, acquisition/provider/transport, timestamp/freshness/TTL/polling, persistence/journal/Saved-Analysis/chart/transition ownership; Map iteration order is never ranking/presentation truth |
| Live market summary baseline state orchestration | P21.17 | `src/services/market-data/liveMarketSummaryBaselineStateOrchestration.ts`, exported through `src/services/market-data/index.ts` | Compose only existing P21.16 state application + an existing P21.4 baseline acquisition port for one caller-owned scope/options invocation: exactly one acquisition, `acquisition-failed` preserves exact prior state, successful delivery applies only through P21.16, and `delivery-invalid` preserves exact prior state. No state store/lifecycle, universe/ranking/freshness/persistence/UI ownership |

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

## P21 canonical ownership ledger — OPEN through P21.17

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
| P21.11 | Binance Spot 24h Public REST Baseline Round Trip Composition Foundation | `providers/binance/binanceSpot24hPublicRestBaselineRoundTrip.ts` | Compose P21.7 request description + exactly one P21.8 connector execution + P21.10 response delivery; no P21.4 cancellation ownership, concrete transport/status/body, retry/rate-limit/polling, state, or UI ownership |
| P21.12 | Binance Spot 24h Public REST Baseline Caller Cancellation Propagation Foundation | `providers/binance/binanceSpot24hPublicRestBaselineRequestExecution.ts`, `providers/binance/binanceSpot24hPublicRestBaselineRoundTrip.ts` | Forward optional caller-owned `signal?: AbortSignal` unchanged through existing P21.8/P21.11 seams while preserving exact no-options invocation and rejection/result behavior; no concrete transport, cancellation policy, concrete P21.4 adapter, state, or UI ownership |
| P21.13 | Binance Spot 24h Public REST Baseline Acquisition Adapter Foundation | `providers/binance/binanceSpot24hPublicRestBaselineAcquisitionAdapter.ts` | Compose the P21.4 port onto P21.11/P21.12 with injected transport, one observation-time read, unchanged caller options, P21.4 validation, and existing `acquisition-failed`; no concrete transport/HTTP response acquisition, clock/freshness policy, abort taxonomy, retry/rate-limit/polling, universe/ranking/state/UI ownership |
| P21.14 | Binance Spot 24h Browser Public REST Baseline Connector Foundation | `providers/binance/binanceSpot24hBrowserPublicRestBaselineConnector.ts` | Concrete browser connector only: one native fetch + exact signal forwarding + one text read + unchanged string/rejection; no request/provider/status/retry/state/UI semantics |
| P21.15 | Binance Spot 24h Browser Public REST Baseline Acquisition Binding Foundation | `providers/binance/binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding.ts` | Browser-ready composition of released P21.13 + P21.14 only; `readObservedAt` remains mandatory/external; no new clock/lifecycle/transport/provider/state/UI ownership |
| P21.16 | Live Market Summary Delivery State Foundation | `liveMarketSummaryDeliveryState.ts` | Provider-neutral current-summary delivery state only; no universe/ranking/freshness/persistence/UI ownership |
| P21.17 | Live Market Summary Baseline State Orchestration Foundation | `liveMarketSummaryBaselineStateOrchestration.ts` | Compose existing state + baseline acquisition for one explicit caller scope/options execution only; no state store/lifecycle/universe/ranking/freshness/persistence/UI ownership |

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

P21.11: `Kairos Controlled Roadmap Gate` #296 / run `34100573164`, job `101673831809`, exact head `dc9809c9596c204aa1ef79726d82ee5951a9afd6`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.10 base/candidate extraction, exact controlled P21.10→P21.11 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.11 Binance Spot 24h public REST baseline round-trip-composition verifier/runtime, full unit regression, full controlled-roadmap regression through P21.11, historical closures, and both exact-run artifact uploads.

Exact P21.11 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10010555876`, 1,207,322 bytes, digest `sha256:06c89d2d7f9671744aed5af7a3b3600d8d78bcdf2aa72a96ef7c6c9ecb5ada2c`.
- `KAIROS_GATE_EVIDENCE` artifact `10010556483`, 1,138 bytes, digest `sha256:ea67c8609ec24cc060590f9444d565e7650a7bad81cde177283ae1cfb97183d8`.

P21.12: `Kairos Controlled Roadmap Gate` #297 / run `34110678855`, job `101705933902`, exact head `92aa69b8c5c40acc67dcc9a281b2442d772cdd13`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.11 base/candidate extraction, exact controlled P21.11→P21.12 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.12 Binance Spot 24h public REST baseline caller-cancellation-propagation verifier/runtime, full unit regression, full controlled-roadmap regression through P21.12, historical closures, and both exact-run artifact uploads.

Exact P21.12 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10013962614`, 1,210,677 bytes, digest `sha256:47c20bd9b7dddee283c6b7fad8cd9b5069865830736eb5c1f1a91574ee74bc24`.
- `KAIROS_GATE_EVIDENCE` artifact `10013962954`, 1,255 bytes, digest `sha256:b80cfd8c7ab7b1f55b8e784037c17690f38187eb9df34852057231da24360844`.

P21.13: `Kairos Controlled Roadmap Gate` #298 / run `34114301112`, job `101717432752`, exact head `2cd8025bd01ca4ea3b3eeff3e4d4f5ac20b077dd`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.12 base/candidate extraction, exact controlled P21.12→P21.13 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.13 Binance Spot 24h public REST baseline acquisition-adapter verifier/runtime, full unit regression, full controlled-roadmap regression through P21.13, historical closures, and both exact-run artifact uploads.

Exact P21.13 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10015885398`, 1,213,929 bytes, digest `sha256:488840e5cbf0d4d0416fb15f6254e62838ceacb7f5446820b309ba7158a0b0d5`.
- `KAIROS_GATE_EVIDENCE` artifact `10015886009`, 1,379 bytes, digest `sha256:9b08b224c0b3f62c26be1d2f289ad302bedda89723c78225202ed90c65096271`.

P21.14: `Kairos Controlled Roadmap Gate` #299 / run `34118010684`, job `101729246550`, exact head `09c972193f3311491a8d9991063bc2e5010488fb`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.13 base/candidate extraction, exact controlled P21.13→P21.14 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.14 Binance Spot 24h browser public REST baseline connector verifier/runtime, full unit regression, full controlled-roadmap regression through P21.14, historical closures, and both exact-run artifact uploads.

Exact P21.14 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10017326486`, 1,218,116 bytes, digest `sha256:7c5da8726b9bcbdfb739ba8353c7389acab0fa3588fc71f0521a59e0a5ab1060`.
- `KAIROS_GATE_EVIDENCE` artifact `10017326839`, 1,542 bytes, digest `sha256:49e504b9d145bac667ef9db87d9a6054f0aee823261776f08ea596af48417f4e`.

P21.15: `Kairos Controlled Roadmap Gate` #300 / run `34123121667`, job `101745506818`, exact head `a7b1acd295e503990aafcbf2e6aff17716069640`, completed full SUCCESS on 2026-09-07. Every required canonical stage succeeded: authoritative P21.14 base/candidate extraction, exact controlled P21.14→P21.15 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.15 Binance Spot 24h browser public REST baseline acquisition-binding verifier/runtime, full unit regression, full controlled-roadmap regression through P21.15, historical closures, and both exact-run artifact uploads.

Exact P21.15 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10019300279`, 1,222,065 bytes, digest `sha256:00a88bb1e5fe6615b47aa1a9e6ac41fc89eececb4471a6119fe51e7976ea9cc0`.
- `KAIROS_GATE_EVIDENCE` artifact `10019300678`, 1,457 bytes, digest `sha256:ed1086b8ce41cfacf39fd2a1a71995c65536cf9434da8d5605bb7124f82f90bb`.

P21.16: `Kairos Controlled Roadmap Gate` #301 / run `34133279485`, job `101778268241`, exact head `ed1fc72faaa0df1607930dd13ad88ba11b45e88b`, completed full SUCCESS on 2026-09-08. Every required canonical stage succeeded: authoritative P21.15 base/candidate extraction, exact controlled P21.15→P21.16 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.16 Live Market Summary Delivery State verifier/runtime, full unit regression, full controlled-roadmap regression through P21.16, historical closures, and both exact-run artifact uploads.

Exact P21.16 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10023353581`, 1,225,815 bytes, digest `sha256:887a04620cc884f1ad4e11a27fccc38bd2363f238b531564747f1f42168fdf1f`.
- `KAIROS_GATE_EVIDENCE` artifact `10023353839`, 1,668 bytes, digest `sha256:28923daaad1407cc1318627321c33fe2b5e21622aa31717145285e007372fe21`.

P21.17: `Kairos Controlled Roadmap Gate` #302 / run `34140732046`, job `101801891405`, exact head `50a0c1a0fd7424a7b75abf3c251b750e5f0a4a5d`, completed full SUCCESS on 2026-09-08. Every required canonical stage succeeded: authoritative P21.16 base/candidate extraction, exact controlled P21.16→P21.17 six-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.17 Live Market Summary Baseline State Orchestration verifier/runtime, full unit regression, full controlled-roadmap regression through P21.17, historical closures, and both exact-run artifact uploads.

Exact P21.17 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `10025960042`, 1,230,475 bytes, digest `sha256:ebdc2cb0b17f24f04f903855bed18de751a9aced0e82da0c32e6c335e5d72ba2`.
- `KAIROS_GATE_EVIDENCE` artifact `10025960437`, 1,368 bytes, digest `sha256:bc941c776651ff0f14fa470a6f856baaffee2806dfa1ad98f9280c2d1a401fb9`.

Therefore P21.17 is the canonical GOLDEN. P21 remains OPEN; later P21 responsibilities must be independently source-proven before implementation.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P12 remains bounded journal-history/listing truth; Home/Bubble UI must not bypass it with direct IndexedDB reads.
- P14 remains journal/trade-visualization truth where assigned.
- P15 remains market acquisition truth and P16 remains Binance Spot provider ownership.
- P21.5 owns provider fact mapping; P21.6 decoded-payload delivery composition; P21.7 request description; P21.8 generic execution boundary; P21.9 deterministic JSON-text response decoding; P21.10 response-delivery composition; P21.11 composes P21.7 -> P21.8 -> P21.10 for one explicit-scope round trip with an externally supplied connector; P21.12 adds caller-owned cancellation propagation only across P21.8/P21.11; P21.13 composes the provider-neutral P21.4 acquisition port onto those released Binance seams; P21.14 supplies only the concrete browser connector for P21.8/P21.13; P21.15 supplies only the browser-ready binding that composes P21.13 + P21.14 while leaving observation time external. P21.16 adds only provider-neutral current-summary delivery state over validated P21.3 deliveries. P21.17 composes only an existing baseline acquisition port with existing P21.16 state application for one explicit caller-owned scope/options execution. None of these move endpoint/query/provider semantics, observation-time/freshness policy, retry/rate-limit policy, universe/ranking, persistence, or UI truth out of their existing or future explicit owners.
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
- P21.8 owns only one injected generic execution call and unchanged connector result, with optional caller-owned execution options forwarded unchanged when supplied.
- P21.9 owns only JSON-text decoding to `unknown`.
- P21.10 owns only response-delivery composition over existing P21.9/P21.6 owners for already-received response data; it does not execute a request or define HTTP response acquisition semantics.
- P21.11 owns only the explicit-scope round-trip composition over existing P21.7/P21.8/P21.10 owners.
- P21.12 owns only propagation of optional caller-owned execution options carrying `signal?: AbortSignal` through existing P21.8/P21.11 seams; it creates no controller, combines no signals, and defines no timeout/abort error semantics.
- P21.13 owns only the concrete Binance composition adapter for the existing P21.4 port. It reads the caller-owned observation-time source once, forwards P21.4 caller options unchanged, reuses P21.4 success validation, and maps released composition failure or connector rejection only to existing `acquisition-failed`.
- P21.14 owns only the concrete browser transport connector: exactly one native fetch for the exact P21.7 request description, exact caller `AbortSignal` forwarding, exactly one response-text read, unchanged text return, and unchanged native fetch/text rejection. It does not interpret HTTP status/headers, create retries, create/merge cancellation signals, decode provider payloads, choose symbols/universe, manage state, or wire UI.
- P21.15 owns only the browser-ready acquisition binding: it composes the released P21.13 acquisition adapter with the released P21.14 browser connector, requires the caller-owned `readObservedAt`, and preserves existing cancellation, result, and rejection behavior. It does not acquire time, own lifecycle/freshness, add transport semantics, choose scope/universe, manage state, or wire UI.
- P21.16 owns only provider-neutral current-summary delivery state keyed by normalized instrument identity. It validates each P21.3 delivery; applies incremental upserts only for delivered facts; applies `complete-for-scope` as replacement only inside the explicit delivery scope while preserving out-of-scope facts; rejects invalid deliveries with `delivery-invalid` and exact prior state; and applies deliveries in caller order with no timestamp comparison or freshness inference. Map iteration order is storage detail only and never ranking/presentation truth.
- P21.17 owns only baseline-state orchestration over released P21.4/P21.16 seams: it accepts caller-owned scope/options, invokes acquisition exactly once, preserves `acquisition-failed` with exact prior state, applies successful delivery only through P21.16, and preserves `delivery-invalid` exact-prior-state behavior. It adds no state store, lifecycle policy, universe/ranking policy, freshness arbitration, persistence, or UI truth.
- Live Crypto Bubble Map and Your Trades Bubble Map remain distinct products with distinct authoritative upstream data flows. Shared future bubble-layout code must remain presentation-only.
- Approved dashboard transitions remain presentation-only and may never own or delay route/navigation/data/persistence/calculation/chart/Saved-Analysis/dashboard-selection truth.
- P2/P3 design tokens remain style-value authority.
- UI/presentation amendments must preserve business/data/navigation truth and use controlled amendments from latest GOLDEN.

## Next audit checkpoint

P21 is open through canonical P21.17. Before any later P21 implementation, reread controlling handoff/current user rules, exact P21.17 GOLDEN, continuity/process history, Retry Ledger, current P15/P16/P21 market owners, P12 journal-history seam, Home/dashboard consumers, and current official provider behavior as needed. Prove exactly one smallest dependency-safe next responsibility and explicit non-scope. Do not infer a next patch by numbering. In particular, do not infer HTTP status/header error policy, retry/rate-limit/polling, credentials, timeout/AbortController ownership, market-universe selection/ranking, freshness/TTL/stale-eviction/reset/reconnect behavior, Bubble size/color/ranking/grouping/filter/interactions, Your-Trades visualization semantics, persistence, or transition implementation merely from P21.17's baseline-state orchestration seam.