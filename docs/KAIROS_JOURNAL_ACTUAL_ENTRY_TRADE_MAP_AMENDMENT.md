# Journal actual-entry Trade Map amendment — 13 September 2026

## User capability

Journal Trade Map now presents every saved actual entry fill alongside its existing planned levels and actual exits. Each actual entry keeps its exact recorded price, quantity and ISO execution time. Multiple entry fills are labelled in their saved order. A distinct cross marker separates actual entries from the planned-entry circle and actual-exit diamond without relying on colour.

UI path: **Journal → Trade history → expand a saved trade → Trade map**.

## Source proof and ownership

Gate410 is the verified base and latest FULL canonical GOLDEN: run `34710348520`, job `103597867967`, head `20bd695aad7fdd80f2c44e0df490773e97d29492`. All canonical stages succeeded. Exact-run nonexpired artifacts `KAIROS_CURRENT_CANDIDATE` (`10303447413`) and `KAIROS_GATE_EVIDENCE` (`10302464895`) were independently inspected. The nested archive is `KAIROS_ANALYSIS_CANDLE_VALUES_MOBILE_CONTAINMENT_REPAIR_CANDIDATE_2026-09-13-R1.zip`, 3,614,526 bytes, SHA-256 `441020dd226ecdbc22b18ae9e7a2ea20acf2b669f57b16b17a1de869760a244e`, Git blob `20416a91f2fff9401705a29fc4af7913eb6eb4bb`, with exact `kairos_p76/` root and passing ZIP integrity.

The source audit found a bounded P14 gap: `tradeVisualizerFacts.ts` projected planned levels and saved actual exits but intentionally omitted saved actual entries. The candidate extends that same P14 owner; it does not create a second journal, chart, calculation or storage owner.

- `tradeVisualizerFacts.ts` filters authoritative `TradeExecutionRecord` entry rows and preserves each record's id, price, quantity and execution time. It performs no arithmetic or market lookup.
- `tradeVisualizerDisplayModel.ts` assigns explicit `executed-entry` semantics and never relabels a planned price as actual.
- `JournalTradeMap.tsx` and `JournalTradeMapGraphic.tsx` present the exact projected facts. `journalRoute.css` reuses existing registered semantic and motion tokens.
- Existing P11/P12/P13 result truth, P17 candles, P18 drawings, P19 planned Risk/Reward, P20 persistence, Live Bubble presentation and provider boundaries are unchanged.

This Journal presentation amendment is groundwork for later exact candle overlays. It does not claim the Journal map is price-scaled, match a saved trade to a venue, or render executions on the Analysis candle chart. No execution, price, FX, P&L or venue is inferred.

## Verification

- P14.1–P14.9 historical ownership/closure verifiers: pass.
- New P14.10 source contract: pass; rejects calculation, storage and provider ownership.
- Focused projection/display/Journal Trade Map tests: 8 files, 13 tests pass.
- Full unit regression: 304 files, 1,251 tests pass.
- Production TypeScript compilation and build: pass with Node 22-compatible pinned project dependencies.
- Real browser script was extended to create the trade only through the released Journal save UI, reload it, and require the actual-entry cross plus exact price/quantity/time before navigating to Your Trades. Local Chromium download was unavailable because the Playwright CDN timed out; no local browser PASS is claimed. The canonical gate must install Chromium and pass this unchanged evidence step before promotion.

## Candidate status

Candidate publication and its full canonical gate remain pending. P21 remains active. A canonical PASS will require every current and historical verifier, the extended actual-browser flow, both exact-run artifacts and independent archive identity verification.

