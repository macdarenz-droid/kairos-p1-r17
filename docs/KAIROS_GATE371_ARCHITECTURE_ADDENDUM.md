# Kairos Gate371 Architecture Addendum

Date: 2026-09-11

## Canonical authority

`Kairos Controlled Roadmap Gate` run `34553880572`, job `verify-current-candidate`, completed FULL SUCCESS on head `6036a023ef0300149246beaf45cc5e0dadc9be7c`.

The exact canonical candidate is `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_RADIUS_SCALE_TEXT_EVIDENCE_PRESENTATION_FOUNDATION_CANDIDATE_2026-09-11.zip`, size `1719182`, SHA-256 `100918bf124e4b3a92a2fcae8ad926beb0744823f62f018dce14f515c4e27c5b`, root exactly `kairos_p76/`.

Exact-run canonical artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact id `10182059660`, wrapper digest `sha256:51937ab8b606517d56039c26edfade2acb1b356bbd178221cdc4cb2d9d72b7f3`.
- `KAIROS_GATE_EVIDENCE` artifact id `10182059940`, wrapper digest `sha256:415c969d5e74f5d56aa70b7b61cb29200dc02a65a8e6c63404232472c7b4dc03`.

Independent extraction re-proved the inner candidate filename, exact size/SHA, root, no absolute/traversal paths, and no symlinks.

## Released ownership

Gate371 canonically releases `HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence` as a pure React presentation boundary over the already-released `HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel`.

It owns only presentation of released normalized radius-scale evidence:
- preserves runtime status/error evidence;
- preserves radius-scale projection null/failure/success semantics;
- preserves exact released entry order and instrument association;
- renders exact released `radiusScale` values and preserves `null` as missing.

It does **not** own hooks/state/effects/memo/cache; clocks/timers/cadence; provider/request/acquisition/product policy; radius arithmetic; pixel radius/min/max/breakpoints; viewport/collision/packing/layout/label-fit; palette/CSS/theme/motion; HomeRoute wiring; persistence/IndexedDB/Saved Analysis; Your Trades/journal/chart/Risk-Reward truth.

## Dependency boundary after Gate371

Fresh Gate371 source shows the configured browser radius-scale hook chain is already canonical through `useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(...)`, while the new Gate371 presenter remains uncomposed with that hook and `HomeRoute` still renders the older configured area-weight textual runtime.

Therefore the smallest dependency-safe next responsibility is one thin configured browser radius-scale textual runtime composition boundary only: accept exact caller-owned `HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration`, call released `useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(...)` once, pass the exact returned model once to released `HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence`, and return that presenter unchanged.

Non-scope remains: no product constants, no state/effects/clocks, no provider policy, no radius/pixel arithmetic, no pixel sizing/breakpoints, no viewport/collision/layout/labels, no CSS/theme/motion, no HomeRoute mutation, no persistence, and no Your Trades truth.

Concrete pixel radii/layout policy remains intentionally unresolved because no current user/Kairos authority supplies min/max pixel radius, breakpoints, collision packing, or label-fit values; those must not be guessed.
