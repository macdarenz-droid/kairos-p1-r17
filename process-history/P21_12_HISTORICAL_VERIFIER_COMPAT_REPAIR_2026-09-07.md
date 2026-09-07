# P21.12 Historical Verifier Compatibility Repair — 2026-09-07

Worker token: `W16-P21_12-HISTORICAL-VERIFIER-COMPAT-20260907T1915AEST`

## Canonical authority
P21.11 remains canonical GOLDEN via `Kairos Controlled Roadmap Gate` #296 / run `34100573164`, job `101673831809`, exact head `dc9809c9596c204aa1ef79726d82ee5951a9afd6`, full SUCCESS. Canonical P21.11 artifacts remain unchanged.

## P21.12 responsibility
Caller cancellation propagation only: optional caller-owned execution options carrying `signal?: AbortSignal` propagate unchanged through the injected P21.8 execution seam and P21.11 round-trip composition. Existing no-options callers retain one-argument connector invocation. No concrete transport, Response/status/body acquisition, AbortController creation/combination/timeout/interpretation, concrete P21.4 adapter, retry/rate-limit/polling, state, or UI ownership.

## Repaired helper run 2 result
NON-CANONICAL helper run `34103660468`, job `101683634321`, exact head `35f457ed09d52c9dfd9264d73a5d7062880b7b76`, completed FAILURE before packaging. Reconstruction and exact six-file P21.11→P21.12 scope assertion passed. Dedicated P21.12 verifier passed. TypeScript typecheck passed. Production build passed. Full unit regression passed: 209 files / 824 tests.

The failure occurred only in the historical/current verifier cascade at P21.11. Exact evidence: `P21.11 round-trip evidence missing: executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect)`. P21.12 had changed the round-trip delegation to always call the P21.8 execution helper with a third `options` argument, even when `options` was `undefined`. Runtime connector behavior remained one-argument because P21.8 branched internally, but the canonical P21.11 source-contract verifier correctly no longer saw its exact two-argument delegation expression.

No candidate was packaged or committed by run `34103660468`.

## Smallest compatibility repair
Fresh main before repair was `35f457ed09d52c9dfd9264d73a5d7062880b7b76`; zero queued and zero in-progress Actions were proved before mutation. With the execution lease held and verified, the P21.12 helper workflow only was updated at engineering main commit `d426279e13168199e922777b87ca72148823769f` (`Repair P21.12 historical round-trip verifier compatibility`).

The generated P21.12 round-trip owner now branches at the P21.11→P21.8 delegation boundary:
- when no options are supplied, it genuinely executes the canonical P21.11 two-argument call `executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect)`;
- when options are supplied, it executes the P21.12 three-argument call with the exact caller-owned options.

This does not weaken or bypass the P21.11 verifier, does not add a seventh candidate file, and strengthens backward compatibility by preserving the old delegation form as actual executable behavior rather than a comment/token shim. The intended candidate delta remains exactly six files.

## Active chain
Push of helper-only repair commit `d426279e13168199e922777b87ca72148823769f` started exact NON-CANONICAL helper run `34105249753`, run number 3, on that exact head. At latest observation it was queued. This is the sole active chain. Helper success remains NON-CANONICAL until canonical gate success.

## Next safe action
Re-prove exact helper run `34105249753`. While queued/in-progress, monitor only. If SUCCESS, verify all stages, exact six-file delta, clean `kairos_p76/` package root, candidate filename/blob/size/integrity, fresh main/Actions and no competing chain; only then acquire/verify lease and retarget the canonical gate exactly once. If FAIL, fetch exact failed step/log and make only the smallest evidence-backed repair from P21.11 GOLDEN. Do not begin P21.13, concrete P21.4 adapter/transport, state, Bubble/Your-Trades/Home/persistence, or transition work while unresolved.
