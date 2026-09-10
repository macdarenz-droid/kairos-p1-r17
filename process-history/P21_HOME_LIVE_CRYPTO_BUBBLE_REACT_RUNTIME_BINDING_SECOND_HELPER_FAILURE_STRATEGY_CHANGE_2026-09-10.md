# P21 Home Live Crypto Bubble React Runtime Binding — Second Helper Failure / Strategy Change

## Canonical base remains unchanged

Gate350 / run `34454131565` remains the latest FULL canonical PASS/GOLDEN.

Exact Gate350 candidate:
`KAIROS_BINANCE_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_OBSERVED_RUNTIME_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`

- size: `1,623,913` bytes
- SHA-256: `0df691a0f561841b518a74c97850da42e233d7a24e9669cc70dbe282bc2db619`
- root: exactly `kairos_p76/`

No failed React-binding helper output is a base.

## Second helper failure

Repaired helper run `34457272820`, job `102806488119`, head `7e5f02f11da4e4f7b8d7951800436509766c4b15`, completed FAILURE.

Fresh log evidence again proved:
- exact Gate350 base archive SHA/size: PASS;
- corrected r1 patch SHA: PASS;
- deterministic npm install: PASS;
- exact `lightweight-charts@5.2.1`: PASS;
- new dedicated static verifier: PASS;
- Gate350/Gate349/Gate346/Gate345/Gate344 and P21.1 lower-owner verifiers invoked before focused tests: PASS;
- production TypeScript: PASS;
- production build: PASS.

Focused Vitest again produced exactly one failure out of 27 tests, the bootstrap-rejection test. The three core React-binding lifecycle/state tests remained green. Changing the test from `mockRejectedValue` to a deferred rejection after render did not alter the result: Vitest still surfaced the synthetic rejected Promise as an unhandled `Error: bootstrap rejected`. Full `npm test`, the all-registered-`verify:*` sweep, residue/scope proof, packaging, artifact upload, and root placement were not reached. No candidate ZIP was produced.

## Retry-rule response: materially change strategy

Because the same broad rejected-Promise test method has now failed twice, it will not be repeated.

Fresh source review materially changes the strategy:

1. Gate350 returns the exact Gate341 bootstrap result contract `Promise<BinanceHomeDashboardLiveMarketRuntimeBootstrapResult>`.
2. Gate341's result domain is only `{ ok: true, runtime }` or `{ ok: false, reason: 'acquisition-failed' }`.
3. Binance exchangeInfo instrument-metadata acquisition catches connector/round-trip exceptions and converts them to `acquisition-failed`.
4. Binance 24h baseline acquisition likewise catches connector/round-trip/readObservedAt exceptions and converts them to `acquisition-failed`.
5. Unexpected synchronous composition/programmer exceptions can still defensively escape before a normal bootstrap result, so the React boundary should remain fail-safe without relying on a synthetic rejected-Promise harness that Vitest globally reports as unhandled.

The corrected r2 implementation therefore changes production control flow from a Promise `.then(success, rejectionHandler)` chain to one internal `async function bootstrap()` with an explicit `try/catch` around the Gate350 call and await. This catches both synchronous bootstrap exceptions and rejected promises inside the lifecycle boundary while preserving Gate350's normal typed result unchanged.

The focused regression changes materially too: instead of manufacturing a rejected Promise, it makes the mocked Gate350 start boundary throw synchronously and verifies the internal async `try/catch` preserves that exact exception as `bootstrap-error` state without inventing a semantic Bubble observation.

This is not a verification weakening: the test continues to prove the defensive exceptional path, while the three existing lifecycle/state tests still prove normal success, acquisition-failed, exact observation/error preservation, and late-resolve teardown.

## Corrected r2 controlled patch

The r2 candidate is still constructed only from exact Gate350 GOLDEN and still changes exactly the same five intended candidate paths:
- foundation report;
- `package.json` verifier registration;
- dedicated verifier;
- `src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime.ts`;
- dedicated test.

Local controls passed:
- `git diff --check`;
- fresh `git apply --check` against exact Gate350 GOLDEN;
- dedicated static verifier.

Exact r2 patch identity:
- size: `18,777` bytes
- SHA-256: `7b87c41d490920a17ebb027235a8e00b5d80c5808257f3750a8535c4bcc231c2`
- Git blob: `9d6cfddfbc6c72ed84f8cd1a9725b511f73987c3`

Next safe action: stage these exact r2 bytes, update the existing helper workflow in place to the exact r2 payload identity, then execute only that same Gate350-based React runtime-binding reconstruction chain. Gate350 remains GOLDEN unless and until a future canonical gate fully passes.
