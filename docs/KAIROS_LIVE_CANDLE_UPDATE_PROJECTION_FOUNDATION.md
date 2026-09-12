# Binance Spot live candle update projection foundation — 13 September 2026

## Responsibility

This bounded P16.19 foundation converts one already-validated Binance Spot public trade observation into one truthful update for the latest historical candle selected by the caller.

- A trade inside the latest candle's exact UTC interval updates only high, low and close; the recorded open and interval bounds remain unchanged.
- The first trade in the immediately adjacent interval creates exactly one new OHLC candle from that price.
- An older observation is ignored as stale.
- A later non-adjacent observation fails with `gap-requires-backfill`; it never manufactures missing candles.
- Instrument venue/symbol, supported interval, source timestamp and current candle boundaries must match exactly.
- Monthly boundaries use calendar UTC months and weekly boundaries use Binance Monday UTC weeks.

This owner does not subscribe to a stream, schedule reconnects, acquire history, backfill gaps, mutate the chart, persist data, or read/write journal executions. Those remain P15/P16/P17 and P9–P14 responsibilities. It also does not claim that the Analysis route is live yet.

UI VISIBLE: NO. This is the smallest data-continuity dependency for the later Analysis subscription/session composition.

## Canonical base

Gate411/run `34712539135`, job `103603792084`, head `8ddbe796f437ce3a2b9b0b937963017620783d04` is FULL canonical PASS: all 32 required stages succeeded. Exact-run artifacts `KAIROS_CURRENT_CANDIDATE` (`10303926868`) and `KAIROS_GATE_EVIDENCE` (`10304136422`) are present, nonexpired and bound to that exact head. The nested GOLDEN archive is `KAIROS_JOURNAL_ACTUAL_ENTRY_TRADE_MAP_UI_CANDIDATE_2026-09-13.zip`, 3,546,115 bytes, SHA-256 `1a0c9c33fa731ce7947338a702ce49f5a323dc0d0b1567526e310f7316ac1157`, Git blob `50ee31633a0591715150445bb761a2e7d7e1245a`, with one `kairos_p76/` root and valid ZIP integrity.

## Verification before publication

- Dedicated P16.19 source-owner verifier: PASS.
- Focused runtime tests: 1 file, 6 tests PASS.
- TypeScript compilation: PASS.
- Production build: PASS.
- Full unit regression: 305 files, 1,257 tests PASS.
- No browser test is required because this foundation has no mounted UI. The later Analysis lifecycle composition must provide real-browser snapshot/update/reconnect/cleanup evidence.

Candidate publication and canonical gate are pending. P21 remains active; P22 and broad P40 polish are not started.
