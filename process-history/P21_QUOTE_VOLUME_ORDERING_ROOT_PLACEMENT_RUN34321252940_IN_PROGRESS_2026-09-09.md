# P21 Quote-Volume Ordering Root Placement — Helper Run 34321252940 IN_PROGRESS

Invocation token: `W16-SAME-WORKER-16M-20260908-A-AUTO11-ORDERING-ROOT`
Date: 2026-09-09 UTC

## Authority before action
- Latest full canonical PASS remains `Kairos Controlled Roadmap Gate` #326 / run `34296922584` (`gate: verify live market universe instrument eligibility policy`). Gate 326 remains GOLDEN.
- Fresh main before the action was `4ace56b32257270a40a02932d842e2b217750252`.
- Exact NON-CANONICAL ordering helper run `34312917781` had previously completed SUCCESS and proved the six-file quote-volume ordering candidate with the required tests/regressions.
- Fresh repository lookup proved `KAIROS_LIVE_MARKET_UNIVERSE_QUOTE_VOLUME_ORDERING_POLICY_FOUNDATION_CANDIDATE_2026-09-09.zip` was not present at repository root, so the canonical gate could not yet consume the ordering candidate.
- Current canonical `.github/workflows/kairos-gate.yml` still targets the Gate326 eligibility candidate; ordering is not canonical.

## Controlled action
Updated only `.github/workflows/live-market-universe-quote-volume-ordering-policy-reconstruct.yml` on main to add one final root-placement step after all existing verification/package/artifact steps. The ordering reconstruction bytes, six-file scope, toolchain, tests, verifiers, and packaging logic were not changed.

Main helper-definition commit: `17d7fb653f636dce7833262a76f83e18595b1d8a` (`helper: place verified quote-volume ordering candidate at root`).

The new final helper step:
- verifies the generated ZIP exists and passes ZIP integrity;
- prints exact byte size and SHA-256;
- fetches origin/main and requires the workflow checkout HEAD to still equal origin/main;
- stages exactly one path, the ordering candidate ZIP;
- commits/pushes only that verified candidate to repository root.

This avoids the prior Actions-token workflow-self-edit permission failure because the Actions token is now asked only to add a binary candidate file, not modify a workflow file.

## Exact active mechanism
- NON-CANONICAL helper: `Kairos Live Market Universe Quote Volume Ordering Reconstruction`
- Exact run: `34321252940`
- Exact job: `102368169007` (`reconstruct-and-verify`)
- Exact head: `17d7fb653f636dce7833262a76f83e18595b1d8a`
- Status at checkpoint: IN_PROGRESS

Stages freshly observed SUCCESS before checkpoint:
1. setup
2. checkout
3. Node 22.16.0 setup
4. npm 10.9.2 pin
5. direct reconstruction from Gate326 GOLDEN with exact six-file scope
6. deterministic `npm ci`
7. Lightweight Charts 5.2.1 proof
8. dedicated quote-volume ordering verifier
9. focused ordering + upstream regressions
10. TypeScript compilation
11. production build
12. full unit regression

Current stage at checkpoint: full registered verifier regression IN_PROGRESS.
Pending behind it: clean packaging, non-canonical artifact upload, verified root placement.

## Classification / non-scope
This is still NON-CANONICAL helper/upload work. No canonical gate has been retargeted, no ordering candidate has been promoted, and Gate326 remains GOLDEN. No Top-N/Top-30 selection, stablecoin exclusion, cadence/freshness, Home/Bubble UI, Your Trades, persistence, chart/navigation, or transitions work was started.

## Next safe action
Monitor only exact helper run `34321252940`. Do not create or mutate competing helper/candidate/gate/docs on main while it is queued/in_progress.

If SUCCESS: verify every helper stage, fetch exact root candidate metadata/blob/size/SHA/integrity and exact six-file Gate326->ordering scope, then inspect current canonical gate and retarget only `.github/workflows/kairos-gate.yml` to Gate326 eligibility GOLDEN as BASE and the exact verified root ordering ZIP as CANDIDATE. Refresh main+Actions immediately and monitor only the exact canonical run.

If FAIL: fetch the exact failed step/log, classify helper mechanism vs candidate evidence, and repair only from Gate326 GOLDEN + intended ordering delta. Do not treat helper failure as canonical candidate FAIL.

No Top-N/Top-30 work until quote-volume ordering receives full canonical PASS.
