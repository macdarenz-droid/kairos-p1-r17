# Kairos Gate 363 Architecture Addendum

## Canonical authority

`Kairos Controlled Roadmap Gate` #363 / run `34535163809` / job `103064968108` completed full SUCCESS on 2026-09-10 at exact head `225bc1fc856917a12e0b8dd2f2be7ece51bfe1d1`.

Exact canonical candidate:
`KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_HOME_ROUTE_TEXT_RUNTIME_INTEGRATION_FOUNDATION_CANDIDATE_2026-09-11.zip`

Canonical candidate identity: size `1,686,493` bytes; SHA-256 `24718bc32095bd249cf00b01ec8d6e6b0cac13e5ad66f8c17fc95a68ffd55b71`; Git blob `9eee591caf7f07d8d9d7050dfdb916ad91037701`; root exactly `kairos_p76/`.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE`: id `10175459498`, wrapper size `1,439,901` bytes, digest `sha256:7b3169b2368dc38243d3ebef23e55cd38fb7e0457a42b3564ca7688590828a3c`.
- `KAIROS_GATE_EVIDENCE`: id `10175460132`, wrapper size `1,806` bytes, digest `sha256:c4a9236d799e82f71c0fa25f3b9ec7763b11b4a7f0da513d2d5a1e2cdb0a71e6`.

Every required canonical stage passed: exact uploaded archive identity/integrity, authoritative Gate362 base/candidate extraction, exact controlled seven-file HomeRoute textual-runtime integration scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation, production build, dedicated verifier/runtime, focused regression, full unit regression, full controlled-roadmap regression, historical closures, candidate upload and gate-evidence upload.

## Canonically released responsibility

Gate363 releases the Home route as the route-level composition owner for the already-released truthful Live Crypto textual runtime.

`src/app/HomeRoute.tsx` now owns only this delegation:
1. obtain one fresh approved default `HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration` through Gate362 `createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration()` once per `HomeRoute` render;
2. pass that exact configuration reference to Gate361 `HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntime` exactly once; and
3. expose the already-released Live Crypto textual runtime from the existing `/` Home route instead of the obsolete disconnected-dashboard placeholder.

Gate362 remains the default runtime product-policy owner. Gate361 remains the configured browser textual-runtime composition owner. Lower provider, universe/ranking, cadence/lifecycle, freshness, semantic projection, area-weight and textual-presentation owners remain unchanged.

The generic router-shell regression isolates the configured Live Crypto runtime so generic route-heading/navigation tests do not perform live market acquisition.

## Explicit non-scope

Gate363 does **not** own or change:
- provider/request/response/acquisition/retry behavior;
- universe eligibility, ranking, Top-30, stablecoin exclusion, symbol tie-break or neutral-movement policy;
- freshness/cadence/lifecycle/timer/clock semantics;
- quote-volume or movement calculations;
- Bubble square-root radius conversion, pixel radius, minimum/maximum radius, viewport/device geometry, collision/packing/layout, label fit or interaction;
- Bubble palette, theme-token selection, CSS, stale/expired opacity, animation or transition ownership;
- persistence/IndexedDB/Saved Analysis;
- Your Trades Bubble Map, journal/trade truth, chart, Risk/Reward or Calculation Brain.

Live Crypto Bubble and Your Trades Bubble remain separate authoritative truth domains.

## Renderer policy already released by user authority

The separately approved presentation policy remains authoritative for later controlled visual slices:
- 24h quote volume remains the authoritative Bubble-size metric;
- Gate352 `areaWeight` remains normalized visual-area evidence;
- circle area is proportional to `areaWeight`, so normalized radius is proportional to `sqrt(areaWeight)`;
- missing `areaWeight` remains missing rather than becoming zero;
- all-zero present weights remain exact zero at the metric-preparation layer; any minimum visible pixel radius belongs only to the later renderer/pixel policy;
- responsive minimum/maximum pixel radius, collision/layout and label fit belong to the renderer;
- semantic market colours consume Kairos theme/design tokens rather than hard-coded market colours;
- stale retained evidence is visibly stale/dimmed; expired evidence must not masquerade as current.

## Next dependency-safe responsibility proof

Gate363 closes the final route-level textual-runtime wiring gap. Fresh source and the released architecture now provide a truthful Home-route runtime path whose lower view model already contains Gate352 normalized `areaWeight`, but there is still no owner that performs the approved square-root conversion required between visual **area** evidence and normalized circle **radius** evidence.

Moving directly to pixel circles would combine two distinct concerns: the deterministic area-to-radius transform and later responsive pixel/collision/layout decisions. That would unnecessarily widen the first visual slice and risk hiding geometry policy in the route or renderer.

The smallest dependency-safe next responsibility is therefore a **pure Home Live Crypto Bubble normalized radius-scale projection** below DOM/React rendering:
1. accept one exact `HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult` produced by Gate352;
2. preserve upstream failure evidence without converting it to renderable output;
3. preserve each exact area-weight entry reference and existing entry order;
4. map `areaWeight: null` to `radiusScale: null`;
5. map each finite normalized `areaWeight` in `[0,1]` to presentation-only `radiusScale = sqrt(areaWeight)`, giving exact boundary behavior `0 -> 0` and `1 -> 1`;
6. fail closed if an input claimed as successful contains a non-finite or out-of-range area weight rather than fabricating geometry; and
7. choose no pixels, minimum/maximum radius, viewport, collision, layout, labels, palette, CSS, motion, provider, market policy, persistence or Your Trades behavior.

This is a safe reversible presentation-only arithmetic seam. A later controlled renderer/pixel-policy slice can consume the normalized radius scale and select responsive minimum/maximum pixel radii and collision/layout without reinterpreting quote-volume or area truth.