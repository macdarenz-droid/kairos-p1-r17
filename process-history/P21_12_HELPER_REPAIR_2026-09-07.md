# P21.12 Helper Reconstruction Repair — 2026-09-07

Status: NON-CANONICAL continuity checkpoint only. Controlling handoff/current user rules + fresh canonical GitHub override this file.

Worker token: `W16-P21_12-CANCEL-PROP-HLP-20260907T1859AEST`.

Latest canonical GOLDEN remains **P21.11 Binance Spot 24h Public REST Baseline Round Trip Composition Foundation**, canonical gate #296/run `34100573164`, job `101673831809`, exact head `dc9809c9596c204aa1ef79726d82ee5951a9afd6`, full SUCCESS. Exact P21.11 artifacts and living architecture checkpoint `fcec0f47f25fb1cb697505cb80c46378ff6a26ba` remain authoritative.

P21.12 source-proven responsibility remains caller cancellation propagation only: optional caller-owned execution options carrying `signal?: AbortSignal` flow unchanged through the P21.8 injected execution seam and P21.11 round-trip seam. Existing no-options callers and connector result/rejection semantics remain compatible. No concrete transport, Response/status/body acquisition, AbortController/policy, concrete P21.4 adapter, retry/rate-limit/polling, new market semantics, state, Bubble/Your-Trades/Home/persistence/transitions.

## First helper failure
NON-CANONICAL helper run `34103413419`, job `101682839246`, exact head `c990eb22e05dbc27b3fdc37bde1067b5f6bfc75a`, FAILED in `Reconstruct P21.12 from canonical P21.11` before verification or packaging. Exact log ended `P21.12 round-trip propagation patch failed`. Setup, checkout, Node 22.16.0 and npm 10.9.2 pinning succeeded. No P21.12 candidate was produced.

Root cause was helper-only reconstruction fragility: indentation-sensitive Python `str.replace` patterns did not match the exact canonical P21.11 round-trip source. This did not classify candidate semantics because candidate construction never completed.

## Smallest evidence-backed repair
Engineering main commit `35f457ed09d52c9dfd9264d73a5d7062880b7b76` (`Repair P21.12 deterministic round-trip reconstruction`) changes only the NON-CANONICAL helper definition. The repair materially changes strategy from fragile substring replacement to deterministic full rewrite of the known P21.11 round-trip owner while preserving the same six-file P21.12 candidate scope.

The repair also explicitly preserves exact old no-options connector invocation: P21.8 calls `connect(request)` when no options are supplied, and only calls `connect(request, options)` when caller options exist. This avoids widening the existing P21.8/P21.11 observable call contract while enabling exact signal propagation.

Fresh repaired helper run `34103660468`, job `101683634321`, exact head `35f457ed09d52c9dfd9264d73a5d7062880b7b76`, is **IN_PROGRESS**. At latest observation checkout had passed and setup-node was in progress. This is the sole active chain. Helper result remains NON-CANONICAL and no canonical gate retarget has occurred.

## Next safe action
MONITOR ONLY exact repaired helper run `34103660468` while queued/in-progress. If SUCCESS, verify all stages, exact six-file P21.11→P21.12 delta, clean `kairos_p76/` root, exact candidate filename/blob/size/integrity, fresh no-competing-chain state, and only then retarget the canonical gate exactly once under a verified lease. If FAIL, inspect the exact failed step/log and make only the smallest evidence-backed repair from P21.11 GOLDEN. P21.11 remains canonical GOLDEN until an exact newer controlled gate fully succeeds.