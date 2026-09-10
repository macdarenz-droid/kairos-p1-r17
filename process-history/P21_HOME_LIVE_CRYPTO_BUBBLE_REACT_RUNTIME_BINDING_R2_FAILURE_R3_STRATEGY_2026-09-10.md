# P21 Home Live Crypto Bubble React Runtime Binding — R2 Failure / R3 Strategy

## Canonical authority
Gate350 / run `34454131565`, job `102796440504`, head `19f6660d0daaf0f028a1a665f4fe6274092ed60f`, is the latest FULL canonical PASS/GOLDEN. Exact Gate350 candidate remains `KAIROS_BINANCE_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_OBSERVED_RUNTIME_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-10.zip`, size `1623913`, SHA256 `0df691a0f561841b518a74c97850da42e233d7a24e9669cc70dbe282bc2db619`.

## R2 helper failure evidence
`Kairos Home Dashboard Live Crypto Bubble React Runtime Binding Reconstruction` run `34457730480`, job `102807948519`, head `6bc95f52d2824fcccd031fd470213d633bd82889`, completed FAILURE.

The controlled patch applied successfully. Node `22.16.0` / npm `10.9.2` ran; Gate350 base identity passed; `lightweight-charts` stayed exactly `5.2.1`; the dedicated React runtime-binding static verifier passed; Gate350, Gate349, Gate346, Gate345, Gate344, metric-input and P21.1 lower-owner checks passed; production TypeScript compilation passed; production Vite build passed. The focused Vitest set reached `26/27` passing tests. Candidate packaging/upload/root placement did not run.

The sole failing regression was `preserves an unexpected bootstrap exception as explicit error evidence`. R2 injected the exception directly at the mocked Gate350 starter call boundary with `mocks.startRuntime.mockImplementation(() => { throw error; })`. Vitest surfaced that injected exception as a test failure even though the production hook already owns an internal async `try/catch` around the awaited starter and preserves caught values as `bootstrap-error` state.

This follows two earlier rejected-Promise variants that failed the same synthetic exceptional-path test. Repeating rejection or a mock-call-boundary throw is therefore retired.

## Materially different R3 strategy
Keep production runtime-binding semantics unchanged. Change only the exceptional-path test harness so the mocked Gate350 starter resolves normally with a controlled result object whose `ok` property getter throws. The exception is then raised only when production code evaluates `result.ok` after the successful `await`, inside the hook's own `try/catch` boundary. This directly tests the released bootstrap-error preservation path without injecting an unhandled rejected Promise or throwing from the mock invocation boundary.

Exact controlled support payload update is main commit `b11cca4634f970b2e3212c6d5632e3e250cfa4e6`, path `.github/kairos-helper-payloads/home-bubble-react-runtime-binding-r2.patch`. Updated payload SHA256 is `31bf55121fd2311e96d8310377fd75d0598d173bca99dfe9a28c2cb7ac8f8140`; Git content blob is `ee8b4f29ecddedd0de7cb3a52f36567605285b2c`.

The candidate responsibility and five-file candidate scope remain unchanged: foundation report; package verifier registration; dedicated verifier; `src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime.ts`; dedicated test. No visible Bubble rendering, design tokens/palette, radius/geometry/layout, provider/universe/ranking/freshness-policy ownership, persistence, Your Trades, journal/chart/navigation/transitions are added.

Next controlled action: update only the existing helper workflow's expected patch SHA to the exact R3 payload identity, which will trigger one reconstruction run from the unchanged Gate350 GOLDEN. While that exact helper is queued/in-progress, monitor it only.