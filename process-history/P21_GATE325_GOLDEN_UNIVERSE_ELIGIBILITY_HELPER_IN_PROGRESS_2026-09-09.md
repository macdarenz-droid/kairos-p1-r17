# P21 Gate325 GOLDEN -> Live Market Universe Instrument Eligibility Policy helper in progress

- Invocation token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-ELIGIBILITY-INSPECT`
- Fresh canonical GOLDEN: Gate #325 / run `34289145300`, Binance Spot exchangeInfo Browser Instrument Metadata Acquisition Binding Foundation, full SUCCESS.
- Fresh engineering main before helper: `f1717cf1d8277a46e0e7f0ce4d54a557912b0d8a`.
- Source proof: released `LiveMarketUniverseInstrumentMetadataFact` owns authoritative `instrument`, `baseAsset`, `quoteAsset`, and `tradingEnabled` truth for later universe policy; Gate325/acquisition layers explicitly exclude USDT eligibility and stablecoin exclusion.
- Approved V1 eligibility responsibility: require `tradingEnabled`, require exact `quoteAsset === 'USDT'`, and apply explicit caller-configured stablecoin base-asset exclusion only.
- Explicit non-scope: no 24h quote-volume ranking/sort, no equal-volume symbol tie-break, no Top-N/Top-30, no freshness/cadence/polling/session, no state/persistence, no Live Crypto or Your Trades UI, no provider/transport widening.
- Action: added temporary NON-CANONICAL reconstruction helper `.github/workflows/live-market-universe-instrument-eligibility-policy-reconstruct.yml` at main commit `600848634b258bfdf972791f6c4cdfad89df9a79`.
- Exact helper run: `34292296717`, head `600848634b258bfdf972791f6c4cdfad89df9a79`, currently IN_PROGRESS and sole active engineering chain at checkpoint.
- Intended candidate only on helper full SUCCESS: `KAIROS_LIVE_MARKET_UNIVERSE_INSTRUMENT_ELIGIBILITY_POLICY_FOUNDATION_CANDIDATE_2026-09-09.zip`.
- Helper contract: exact six-file delta; Node 22.16.0; npm 10.9.2; Lightweight Charts 5.2.1; dedicated eligibility verifier; focused eligibility + metadata-fact tests; typecheck; build; full unit; all registered verify regressions; clean package/root/path/symlink integrity; SHA-256; candidate commit; helper self-removal.
- Tests completed at checkpoint: none claimed yet; helper is still running. Gate325 remains canonical GOLDEN.
- Next safe action: re-prove exact helper run `34292296717`. While queued/in-progress, MONITOR ONLY. If SUCCESS verify every helper stage plus exact candidate identity/size/SHA/root/integrity/six-file delta and cleanup before any canonical gate retarget. If FAIL inspect exact failed step/log and repair only from Gate325 + intended eligibility delta.
