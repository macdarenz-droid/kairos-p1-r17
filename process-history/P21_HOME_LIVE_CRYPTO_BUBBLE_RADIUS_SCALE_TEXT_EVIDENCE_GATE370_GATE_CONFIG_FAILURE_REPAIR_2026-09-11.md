# P21 Home Live Crypto Bubble — Gate370 gate-configuration failure and repair

Run token: `W16-SAME-WORKER-10M-20260908-A-AUTO9-GATE370-GATEFIX-0212Z`
Date: 2026-09-11 UTC

## Before state

- Latest FULL canonical PASS/GOLDEN remains Gate369 / `Kairos Controlled Roadmap Gate` run `34550316082`, job `103111655062`, head `7218255caab0724e3bb9abec647005bd04ff8d96`.
- Gate369 GOLDEN candidate remains `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_CONFIGURED_BROWSER_RADIUS_SCALE_HOOK_COMPOSITION_FOUNDATION_CANDIDATE_2026-09-11.zip`, size `1713835`, SHA-256 `a0208dd82c2b5e2e0ca9429bc35353deb561c6997bacfa358efa02df170d0136`.
- The helper-tested radius-scale text-evidence candidate remains `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_RADIUS_SCALE_TEXT_EVIDENCE_PRESENTATION_FOUNDATION_CANDIDATE_2026-09-11.zip`, size `1719182`, SHA-256 `100918bf124e4b3a92a2fcae8ad926beb0744823f62f018dce14f515c4e27c5b`, exact five-file delta from Gate369 and zero removals.

## Gate370 exact failure evidence

Canonical Gate370 / run `34552791717`, job `103118989633`, head `125359820f873edd6e61e2a0986335ce9cd6778e`, completed FAILURE.

Successful stages before the failure:
- setup / checkout / Node / npm pinning;
- exact base and candidate archive identity and ZIP integrity;
- Gate369 base/candidate extraction;
- exact five-file radius-scale text-evidence scope;
- deterministic install;
- exact Lightweight Charts `5.2.1`;
- production TypeScript compilation;
- production build;
- the new radius-scale text-evidence verifier and every lower-owner verifier reached before the failing command.

The exact failing command in the dedicated verifier/runtime step was:

`npm run verify:home-dashboard-live-market-summary-freshness-evaluation-projection-foundation`

npm reported `Missing script`. The same authoritative gate's full controlled-roadmap required-script list already names the released verifier correctly as:

`verify:live-market-summary-freshness-evaluation-projection-foundation`

Focused regression, full unit regression, full controlled-roadmap regression, historical closures, and canonical candidate upload were skipped because the dedicated step failed. Gate evidence still uploaded as artifact `10181423235`, but artifact existence alone is non-promotional evidence and does not make Gate370 or its candidate GOLDEN.

## Classification

This is a **canonical gate-configuration defect only**. The candidate's production source, exact scope, install, dependency pin, TypeScript build, production build, current presenter verifier, and all lower verifiers executed before the stale verifier-name call passed. No candidate source defect is evidenced. Gate369 therefore remains GOLDEN; failed Gate370 is never a base.

## Smallest controlled repair

With the execution lease held and freshly verified, only `.github/workflows/kairos-gate.yml` was changed on engineering `main`. The stale command was replaced with the already-released exact script name:

- from `verify:home-dashboard-live-market-summary-freshness-evaluation-projection-foundation`
- to `verify:live-market-summary-freshness-evaluation-projection-foundation`

No base/candidate identity, exact five-file scope, package bytes, candidate source, product semantics, dependency pins, regression requirements, historical closures, or artifact requirements were changed or weakened.

Engineering-main repair commit: `6036a023ef0300149246beaf45cc5e0dadc9be7c` (`gate: correct radius-scale verifier name`).

## After state

The repair triggered exactly one new canonical chain: `Kairos Controlled Roadmap Gate` #371 / run `34553880572`, job `103122278845`, exact head `6036a023ef0300149246beaf45cc5e0dadc9be7c`.

At the latest checkpoint in this invocation, #371 is IN_PROGRESS. Verified SUCCESS already: setup, checkout, setup-node, npm version, exact archive identity/integrity, Gate369 extraction, exact five-file scope, deterministic install, Lightweight Charts 5.2.1, production TypeScript compilation, production build, dedicated presenter/lower-owner verifier stage, and focused radius-scale text-evidence regression. `Full unit regression` is IN_PROGRESS. Later full controlled-roadmap regression, historical closures and both canonical artifact uploads remain pending/unproven.

## Ownership / architecture

No architecture or ownership boundary changed in this repair. The intended candidate remains presentation-only normalized-radius textual evidence and does not add pixel radii, layout/collision policy, CSS/theme/motion, route mutation, persistence, provider/product semantics, or Your Trades truth. No architecture-map edit is required for this gate-only correction.

## Next safe action

While run `34553880572` is queued/in-progress, monitor only that exact canonical run. Do not start any competing repository/docs/helper/candidate/gate/next-slice work. Gate369 remains GOLDEN unless and until #371 completes FULL canonical SUCCESS and its exact-run `KAIROS_CURRENT_CANDIDATE` and `KAIROS_GATE_EVIDENCE` are verified.
