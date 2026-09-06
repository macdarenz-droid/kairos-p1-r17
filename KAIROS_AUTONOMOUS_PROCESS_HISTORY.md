# Kairos Autonomous Process History

Branch: `kairos-autonomous-state`
Status: NON-CANONICAL continuity memory only. Controlling handoff + fresh canonical GitHub always override this file. Detailed earlier process history is preserved in this branch's git history through commit `9f5ec24ea7db6eafb4e2f070e4cbcb1385215254` and its ancestors.

## MUST-READ / WRITE-BACK CONTRACT
Before every Kairos decision: automation liveness rule -> handoff/current rules -> roadmap/GOLDEN -> this history -> Retry Ledger -> living repo docs -> fresh main/Actions -> exact canonical artifact/source/log/owner/data-flow evidence -> current official research when needed. After every meaningful autonomous process, conflict-safely write back before report/lease release.

# CURRENT ACTIVE STATE
Repository `macdarenz-droid/kairos-p1-r17`; engineering `main`; continuity `kairos-autonomous-state`.

AFK/autonomous mode is owned by enabled recurring `Kairos Relay Supervisor [ACTIVE]` under V16. Scheduled runtime cannot create child automations, so active `Kairos Fast Continuation` is kept enabled/future-dated about 10 minutes forward; hourly supervisor is dead-man recovery. Execution lease protects repository/docs mutation.

## Roadmap / GOLDEN
P18 CLOSED; P19 CLOSED; P20 CLOSED. P21 OPEN through P21.1.

Latest canonical GOLDEN is **P21.1 — Home Dashboard Route Ownership Foundation** via `Kairos Controlled Roadmap Gate` #286 / run `34061840453`, job `101563628073`, exact head `13d55093a569a156f316ccb848e6bd84e4e437ea`, completed full SUCCESS on 2026-09-07.

Exact canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` id `9997837809`, size 1,169,775 bytes, digest `sha256:801b75beb1ed2bc16d13e2fa74a6905441652cdbc3ff66154abe6612894fdd17`.
- `KAIROS_GATE_EVIDENCE` id `9997837954`, size 973 bytes, digest `sha256:829a2cf8118b04c59eb8cd3ca82c713f6acb0ad5f7445d622bd0175347524f9b`.

Engineering `main` is the post-PASS living-architecture checkpoint `479759603f72b2aa4e0230e65be287b3635f82cd` (`Record canonical P21.1 Home dashboard route ownership`). No newer canonical gate exists at this checkpoint.

## Durable lineage summary
- P20.5 canonically closed Saved Analysis; no speculative CRUD/runtime/UI/provider/schema expansion was introduced.
- P21.1 was source-proven as the smallest Home route ownership foundation because the existing `/` index was only a placeholder while P8 already owned shell/navigation truth.
- P21.1 helper run `34060999304` succeeded non-canonically and produced the exact five-file candidate; canonical gate #286 then fully passed and promoted it.
- P21.1 owns only semantic Home/dashboard presentation on existing `/`; P8 `AppShell`/navigation, P11 calculations, P12 journal history, P14 trade visualization, P15/P16 market data/provider truth, P20 Saved Analysis, and P40 motion remain separate owners.
- Prior P21.2 authority searches correctly held implementation because `Bubble Map` semantics were under-specified. M•ARC bubble-map semantics are a different project and are never Kairos authority. `KAIROS_FUTURE_FEATURE_PROPOSALS` remains IDEA/NOT SCOPED/NOT SCHEDULED where applicable.

## Standing user product authority — P21 Bubble Maps
`Bubble Map` is TWO separate products and must never collapse into one ambiguous truth model:

A) **LIVE CRYPTO BUBBLE MAP** — live/current crypto market visualization sourced only from authoritative market-data/provider boundaries (P15/P16 and later relevant market integrations), never from journal trades.

B) **YOUR TRADES BUBBLE MAP** — visualization sourced only from the user's authoritative journal/trade history plus released calculation truth, never presented as a live market feed.

Presentation-only bubble layout machinery may eventually be shared, but business/data ownership must remain separate. No direct IndexedDB from UI and no duplication of P11/P12/P14/P16 truth. Exact bubble-size metric, color semantics, grouping/filtering, universe/time-window, interaction behavior and provider/query contract require independent source proof before implementation.

## Standing presentation authority — premium transitions
The `KairosTransitions_Premium.jsx` concept is an approved future presentation direction. Preserve a clean transition/motion seam around P21 dashboard routes/shells/swipe/navigation. Motion may later use fragment/fold/fall/reassembly, mixed large/small pieces, slower timing, depth/perspective, directionality, swipe feel, particles/easing and reduced-motion refinement. Animation is presentation only and must never own, delay, mask, duplicate or roll back navigation, route truth, provider data, persistence, calculations, chart truth, Saved Analysis truth or dashboard-selection truth.

## Exact current P21 source/data-flow proof
The canonical P21.1 artifact was downloaded and inspected directly.

Existing P15/P16 live market boundary is single-instrument:
- `MarketDataAdapter.subscribe(instrument, handlers)` subscribes one `MarketDataInstrument`.
- `MarketPriceObservation` carries instrument, price, observedAt and sourceTimestamp.
- P16 Binance Spot implementation owns public trade-stream endpoint/subscription/reconnect and raw-trade -> provider-neutral price-observation mapping.
- This existing boundary does **not** expose a market-universe or multi-instrument market-summary contract.

Existing Your-Trades read path is already bounded and authoritative:
- P12 `listJournalHistory(db, options)` uses indexed recent repository queries rather than load-all/filter in React.
- It returns journal facts together with released P11 calculation metrics and P13 visual-PnL projection.
- P21 must consume this application seam; Home/Bubble UI must not query IndexedDB directly or recalculate trade truth.

## Process log — 2026-09-06T22:50Z — token W16-RECOVERY-20260907T0556-AEST-H9Q4
RULE 0 was satisfied before project work by keeping the same V16 `Kairos Fast Continuation` enabled and future-dated; permanent hourly `Kairos Relay Supervisor [ACTIVE]` remains enabled. Fresh GitHub proves engineering main is still `479759603f72b2aa4e0230e65be287b3635f82cd`; latest canonical authority remains P21.1 via gate #286/run `34061840453` full SUCCESS, with exact artifacts/digests unchanged. No competing active canonical run was found.

Fresh current official Binance Spot API/stream research materially narrows the Live Crypto dependency:
- Binance's official Spot API documentation repository is the supported authority for current endpoints/streams.
- `!ticker@arr` (All Market Tickers) was deprecated on 2025-11-14; official guidance is to use `<symbol>@ticker` or `!miniTicker@arr` instead.
- Current `!miniTicker@arr` is an all-market mini-ticker stream with 1000 ms updates, but each event contains only symbols whose mini-ticker changed. Therefore a single event is **incremental changed-symbol evidence**, not a complete market snapshot/universe.
- Mini-ticker facts include event timestamp, symbol, current/close price, open, high, low, base volume and quote volume for the rolling 24-hour window.
- REST `/api/v3/ticker/24hr` remains a market-data summary route and batch/all-symbol access carries request-weight implications; acquisition/universe policy therefore must be explicit rather than guessed in UI.

**Source-proven next controlled responsibility: P21.2 — Live Market Summary Fact Contract Foundation.**

This responsibility is deliberately only a provider-neutral raw FACT CONTRACT at the market-data boundary. The smallest defensible per-symbol facts, because they map directly to currently supported Binance mini-ticker semantics without choosing a Bubble visualization metric, are:
- instrument identity;
- current/last price;
- rolling-24h open price;
- rolling-24h high price;
- rolling-24h low price;
- rolling-24h base volume;
- rolling-24h quote volume;
- provider source/event timestamp;
- local observed-at timestamp.

P21.2 explicit non-scope is strict:
- no Bubble size metric or ranking;
- no color semantics;
- no grouping/filtering;
- no market-universe selection;
- no UI geometry/layout/interactions;
- no Home route wiring;
- no REST polling policy;
- no WebSocket subscription choice;
- no multi-symbol state accumulator yet;
- no complete-snapshot claim from one `!miniTicker@arr` message;
- no persistence/schema/index changes;
- no journal reads or Your-Trades semantics;
- no P11/P12/P14/P16 duplication;
- no dashboard transition implementation.

A later, separately source-proven slice must define acquisition/universe/freshness/error semantics. Because `!miniTicker@arr` is incremental changed-symbol data, any complete live market view will require an explicit provider/service accumulation or initial-snapshot rule; UI inference is forbidden.

No P21.2 candidate, helper, gate retarget, provider call, Home wiring or engineering-main mutation was created in this discovery run. Retry Ledger was updated to record this exact source proof.

## Next safe action
Re-prove P21.1 GOLDEN, exact canonical source and current official provider semantics. Then, if all validation/type ownership details remain consistent, construct exactly one controlled **P21.2 Live Market Summary Fact Contract Foundation** candidate from canonical P21.1 with the strict non-scope above. Do not implement acquisition/universe policy or either Bubble Map renderer in the same slice. Run focused contract tests/verifier plus full required regression/canonical-gate process before promotion.