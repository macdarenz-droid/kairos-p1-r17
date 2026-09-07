# P21.17 Helper Repair Checkpoint — 2026-09-08

Worker token: `W16-P21_17-BASELINE-STATE-ORCHESTRATION-20260908T0103AEST`

## Canonical authority
Latest canonical GOLDEN remains **P21.16 Live Market Summary Delivery State Foundation** via exact `Kairos Controlled Roadmap Gate` #301 / run `34133279485`, job `101778268241`, exact head `ed1fc72faaa0df1607930dd13ad88ba11b45e88b`, full SUCCESS. P21.17 helper evidence is NON-CANONICAL.

## Source-proven next responsibility
Exact P21.15/P21.16 source ownership proves a narrow gap: P21.15 exposes the released P21.4 baseline acquisition port but owns no current-summary state; P21.16 owns provider-neutral delivery state/application but owns no acquisition. No production owner composes these released seams. Therefore the single next responsibility is **P21.17 Live Market Summary Baseline State Orchestration Foundation**: accept existing state + existing baseline acquisition port + caller-owned explicit scope/options, acquire exactly once, preserve `acquisition-failed`, apply successful delivery only through released P21.16 state semantics, and preserve `delivery-invalid`/exact-prior-state behavior.

Explicit non-scope remains: no market universe/scope selection; ranking/filtering/grouping/sorting/Bubble metrics/colors/geometry/Home wiring; no provider/transport/endpoint/HTTP/retry/rate-limit/credentials/timeout; no clock/Date/timestamp/freshness/polling/reconnect/scheduling; no persistence/IndexedDB/journal/Your Trades/Saved Analysis/chart/transitions.

## Helper attempt 1
Engineering main helper-definition commit: `44079711aae62ff817849fae319d3b7215430c42`.
Workflow: `Kairos P21.17 Live Market Summary Baseline State Orchestration Reconstruction Bridge`.
Run `34136646465`, job `101789083557`, exact head `44079711aae62ff817849fae319d3b7215430c42`, completed FAILURE before packaging.

Evidence before failure:
- checkout/setup-node/npm pin: SUCCESS;
- deterministic reconstruction from canonical P21.16: SUCCESS;
- exact intended six-file P21.16→P21.17 scope assertion: SUCCESS;
- dedicated P21.17 verifier: SUCCESS;
- failure occurred at TypeScript compilation in the focused test only.

Exact TypeScript failure:
- `tests/live-market-summary-baseline-state-orchestration-foundation.test.ts(89,44): TS2493 Tuple type '[]' of length '0' has no element at index '0'`;
- same at index `1` on line 90.

Root cause: the Vitest `acquireBaseline` mock used a zero-argument callback, so TypeScript correctly inferred `.mock.calls` as zero-length tuples even though the production port accepts scope/options. This is helper/test typing only; the dedicated production-scope verifier passed. No candidate was produced.

## Smallest repair
Engineering main commit `380a5cb251b76c6ec6a3bc599655698b27ff2383` (`Repair P21.17 helper acquisition mock typing`) changes only the helper reconstruction text for that focused test: the affected Vitest callback now explicitly accepts `readonly MarketDataInstrument[]` and optional `{ signal?: AbortSignal }`. Production P21.17 source, contract, non-scope, report, verifier, and intended six-file candidate delta are unchanged.

Fresh repaired NON-CANONICAL helper run `34136847425`, job `101789718000`, exact head `380a5cb251b76c6ec6a3bc599655698b27ff2383`, is IN_PROGRESS at this checkpoint. Setup/checkout passed; setup-node was in progress at latest proof. No candidate exists yet.

## Next safe action
Re-prove exact repaired helper run `34136847425` first. If queued/in-progress, MONITOR ONLY and create no duplicate helper/candidate/gate or P21.18. If SUCCESS, verify every helper stage, exact six-file delta, clean `kairos_p76/` package root, exact candidate filename/blob/size/integrity and zero competing Actions before any canonical gate retarget. If FAIL, fetch the exact failed step/log and make only the smallest evidence-backed repair from canonical P21.16.
