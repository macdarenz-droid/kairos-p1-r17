# P21.15 helper repair — 2026-09-07

Canonical GOLDEN remains P21.14 via gate #299 / run `34118010684`; no P21.15 candidate has been canonically promoted.

First NON-CANONICAL helper run `34121025334`, job `101738821183`, exact head `ed1efe40adc4b04e0575eed97acf6fae64a65182`, FAILED before packaging. Deterministic reconstruction and the exact six-file P21.14→P21.15 scope assertion passed. The dedicated P21.15 verifier passed. Failure occurred at TypeScript compilation only:
`tests/binance-spot-24h-browser-public-rest-baseline-acquisition-binding.test.ts(48,32): error TS2339: Property 'mock' does not exist on type '(input: URL | RequestInfo, init?: RequestInit | undefined) => Promise<Response>'.`

Root cause: the test mock was cast to `typeof fetch` at declaration, erasing Vitest mock metadata before `fetchMock.mock.calls` was inspected. No production P21.15 behavior failed and no candidate was produced.

Smallest evidence-backed repair is helper-only engineering main commit `57de11e56dcb148a19f6cd300661f0fe7ab08397` (`Repair P21.15 helper fetch mock typing`). The mock now retains its Vitest function type and is cast only when assigned to `globalThis.fetch`; production binding source, ownership, non-scope, intended six-file candidate delta and report/verifier contracts are unchanged.

Fresh NON-CANONICAL repaired helper run `34121155160`, job `101739233591`, exact head `57de11e56dcb148a19f6cd300661f0fe7ab08397`, is IN_PROGRESS. Latest exact stage: checkout/setup-node success; npm pinning in progress; reconstruction/verification/packaging pending.

NEXT SAFE ACTION: re-prove exact helper run `34121155160` first. If queued/in-progress, monitor only. If SUCCESS, verify every helper stage, exact six-file delta, clean package root and exact candidate identity/integrity before any canonical gate retarget. If FAIL, inspect exact failed step/log and repair only from evidence. No P21.16 work while unresolved.
