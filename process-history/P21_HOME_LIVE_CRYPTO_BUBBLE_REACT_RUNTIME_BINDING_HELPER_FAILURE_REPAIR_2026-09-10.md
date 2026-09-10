# P21 Home Live Crypto Bubble React Runtime Binding — Helper Failure / Repair

## Authority

Gate350 / run `34454131565` remains the latest FULL canonical PASS/GOLDEN.

Exact Gate350 candidate:
`KAIROS_BINANCE_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_OBSERVED_RUNTIME_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`

- size: `1,623,913` bytes
- SHA-256: `0df691a0f561841b518a74c97850da42e233d7a24e9669cc70dbe282bc2db619`
- root: exactly `kairos_p76/`

## Failed non-canonical helper

Workflow: `Kairos Home Dashboard Live Crypto Bubble React Runtime Binding Reconstruction`

- run: `34456744740`
- job: `102804806879`
- head: `f2b8dbdfaf1be1b136cd19f1f67eda8d9bbdd313`
- conclusion: FAILURE

The helper successfully proved:
- exact Gate350 base archive identity;
- exact controlled patch identity;
- deterministic npm install;
- exact `lightweight-charts@5.2.1`;
- the new dedicated static verifier;
- Gate350/Gate349/Gate346/Gate345/Gate344 lower-owner verifiers;
- P21.1 Home-route ownership verifier;
- production TypeScript compilation; and
- production build.

Focused Vitest executed 27 tests across six files. 26 passed. Exactly one new test failed:
`preserves an unexpected rejected bootstrap as explicit error evidence`.

The other three new React-binding tests passed, including exact Gate350 start/input forwarding plus observation/error retention, acquisition-failure state, and late-resolve-after-unmount exact runtime closure.

The failed test created an already-rejected Promise via `mockRejectedValue(error)` before React's effect had a deterministic opportunity to attach the hook's rejection handler. Vitest surfaced `Error: bootstrap rejected` as an unhandled rejection, pointing to the test's error construction line. The failure happened before full `npm test`, all registered `verify:*` regressions, package residue/scope proof, candidate packaging, artifact upload, or root placement. No candidate ZIP was produced and no candidate was placed at repository root.

## Evidence-backed repair classification

This is a **test-harness timing defect in the current non-canonical candidate construction**, not evidence of a Gate350 defect and not evidence that the hook's production TypeScript/build boundary is invalid.

The production hook already uses a two-argument Promise `.then(success, rejectionHandler)` and passed typecheck/build. The deterministic repair is to change only the rejected-bootstrap test setup so the rejection occurs **after** the effect has attached the handler.

Repair strategy:
- replace immediate `mockRejectedValue(error)` with a deferred Promise;
- capture `rejectRuntime`;
- render the hook first;
- reject inside React Testing Library `act(...)`;
- keep the same assertions that state becomes `bootstrap-error`, `lastError` preserves the exact error object, and `latestObservation` remains null.

No production source behavior changes. The intended candidate scope remains exactly five files.

## Corrected controlled patch

Corrected local patch was regenerated from the exact Gate350 GOLDEN and passed `git diff --check`, a fresh `git apply --check`, and the dedicated static verifier.

- patch SHA-256: `b779a0cbc08a06cb78de6d206bbca01f474b87a844134f52835bf93820c9fe2d`
- Git blob: `90d0f5b104aec03e49e7c66569eb684b9541c201`

The next safe action is to replace the existing helper payload with these corrected bytes, update only the helper workflow's expected patch SHA, then run the same Gate350-based reconstruction/verification chain again. Gate350 remains GOLDEN throughout. Failed helper output is evidence only and is never used as a base.
