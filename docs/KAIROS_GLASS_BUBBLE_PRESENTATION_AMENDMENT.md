# Pending instrument identity continuity gate — 11 September 2026

Base Gate386 remains GOLDEN. A behavior regression proved rank-based React keys recreated bubbles and changed hover timing. The key-only repair then failed the real browser Animation-object check because rank moves still moved DOM nodes. Final repair uses instrument tuple keys, stable identity-based DOM order and deterministic instrument hover timing. Layout still consumes the exact upstream ranking and radii; new facts remain immediate. No claim that positions are frozen under ranking or radius changes.

Local validation: initial regression FAIL against Gate386; final 8 focused tests PASS; 1126 tests across286 files PASS; TypeScript/build, existing P2 design system and glass verifier PASS; real Chromium retains identical bubble/canvas/Animation objects across rank changes, and passes existing theme/alpha/pause/reduced-motion/collision checks. No verifier weakened.
Candidate KAIROS_HOME_DASHBOARD_GLASS_BUBBLE_INSTRUMENT_IDENTITY_CONTINUITY_CANDIDATE_2026-09-11.zip; bytes3326507; SHA256739a72f019ac63db229747f563f4969cdf482283b9f7f82fb794f1e064486f57; blob43bece6aaff6416c289055fd088954b5d8f24e49; exact5-file delta, zero removals. Approved image byte-identical. Direct publication only; no bridge. Canonical result remains pending. Prior Gate386 evidence and ownership are retained below.

---
# Gate386 — approved glass bubble UI: GOLDEN
Verified 11 September 2026.

## Canonical result
Kairos Controlled Roadmap Gate #386, run34603897084, job103277560057 (verify-current-candidate), head b1fda78ea33ff4b2762ee80ae178b1ed271c2894 completed FULL SUCCESS. Every required stage succeeded: exact archives/scope, deterministic install, pinned toolchain and Lightweight Charts5.2.1, TypeScript/build, focused and browser checks, full unit, full controlled-roadmap, historical closures, both uploads.
Gate386 supersedes Gate384 as GOLDEN. Gate385 remains failed evidence; its unregistered CSS spacing was repaired without weakening P2 or any other verifier.

## Frozen candidate and artifacts
Candidate: KAIROS_HOME_DASHBOARD_APPROVED_GLASS_BUBBLE_PRESENTATION_AMENDMENT_R1_CANDIDATE_2026-09-11.zip
Bytes:3324380
SHA256:856d6d62929e7bb0f305f4ba0327522470bdc86c85c1a7b5b5fa5ddcfbdcda79
Git blob:c25929733a239e2ed6c5ff80f9218c7cffac28e4
Exact14-file delta from Gate384; no removals.
Exact-run KAIROS_CURRENT_CANDIDATE artifact10266515300, wrapper SHA2561252b2588f084bdb82d6b9eb88421503e18d804ef65b6d6152bcd1c6430d0eae.
Exact-run KAIROS_GATE_EVIDENCE artifact10266910052, wrapper SHA25696d4069dc35720c52d516dc8c280fcf6bda6aea74df1b1cf857d5e1a35511d24.
Both downloaded wrappers passed hash and ZIP CRC checks. Nested candidate byte size/hash and byte-for-byte equality against published local candidate verified. Evidence JSON reports passed:true, corner/centre alpha0, three existing themes plus a light stress fixture,8/30 circles, hover/pause/reducedMotion/noOverlap true, errors[]. Canonical dark screenshot inspected.

## Released presentation ownership
HomeRoute enables the visual option of its existing configured radius-scale runtime. The existing hook runs once; its model feeds the glass renderer and retained textual details. Provider acquisition, ranking, freshness, volume metrics and Decimal facts retain existing owners.
HomeDashboardGlassBubbleMap measures its container and consumes the released pixel-radius projection. homeDashboardGlassLayout validates released bounds and performs deterministic irregular packing without shrinking supplied radii. Hover is presentation only and pauses/reduces independently of authoritative data.
Approved image remains exact black-matted RGB source with removed upper-left white patch. homeDashboardGlassMaterial converts black to alpha at runtime, with feathered/blurred decorative layers behind crisp SVG icons and labels. Theme colors stay semantic; R1 spacing derives from shared tokens.
This is production React integration in the canonical candidate, not a standalone HTML prototype. No hosting/deployment or complete visual acceptance is claimed by this gate.

## Continuation boundary
The approved image-to-gate task is complete. Future changes start from this exact GOLDEN archive. Keep workers in the user's current paused/manual mode unless explicitly resumed; this reconciliation changes no schedules.
Source inspection identifies a concrete follow-up review: renderer keys currently include array index and packing is recomputed from rank-ordered inputs on each model update. Verify identity/position behavior under a 5-second market refresh and rank changes before selecting a narrowly scoped motion-continuity amendment. Static theme/overlap tests do not prove rank-change continuity. Do not change provider/ranking truth to stabilize visuals.
Preserve current GOLDEN, Gate384 rollback and Gate385 failure evidence. No bridge/helper needed for direct publication.

---
## Original implementation and repair record (historical pending statuses superseded above)

# Approved glass bubble presentation amendment — 11 September 2026

## Authority and exact base
User approved the cyan-violet glass design after removal of the circled upper-left opaque white patch, then explicitly requested GitHub gating. No further standalone HTML prototype was requested or produced for this amendment.
Base: Gate384 FULL canonical PASS, run34592984111, candidate SHA-256 017d48b7d69fe984f0700378e4e00deb531213cfac558e926f2a255c562779e4. Gate384 remains GOLDEN until this candidate passes every canonical stage and both artifacts are verified.

## Approved artwork and transparency
`src/assets/kairos-glass-approved.png` is the exact approved black-background preview: 1254x1254 RGB PNG, 1,612,711 bytes, SHA-256 9019b37ecd99c35cecdddc470409689c914e1e787c66631b076c03797f551903. It is black-matted source artwork, NOT an alpha PNG. The removed white patch must not reappear.
The production material loader converts black to alpha once and unpremultiplies the remaining RGB. Black-background compositing reconstructs source colors within rounding error; other backgrounds remain visible instead of showing a black square. The texture's inner edge is feathered with a CSS mask; the soft core is a separate blurred theme surface. Icons, symbols, movement and freshness labels stay on a separate unblurred layer. Source failure keeps market labels and theme surface usable.
The decorative cyan-violet material is the approved art identity. Positive/negative/neutral textual meanings use released semantic theme tokens; hue treatment is decorative only. Existing Kairos themes remain unchanged; a light surface is a browser stress fixture, not a newly released product theme.

## Source-owned useful integration
HomeRoute selects the visual option on its existing configured radius-scale runtime composition. That composition invokes the existing hook exactly once and passes the same model to the new map and existing textual evidence. The evidence remains available under Market data details. No new market acquisition, provider, universe, freshness, persistence, journal, navigation or calculation owner is introduced.
`HomeDashboardGlassBubbleMap` owns measurement and presentation only. It consumes the existing radius-scale model and Gate375 pixel-radius projection; caller visual radii are 48 CSS pixels minimum and a maximum of min(155, measured width * .225), with a 48px lower bound. Containers under140px fall back to textual details. Missing radii remain missing. The pure layout consumes these exact radii, validates Gate384 bounds, uses deterministic irregular placement, reserves24px pair separation for hover, and grows scroll height rather than shrinking facts to fit.
Movement percent strings and semantic states come unchanged from released projections. Stale entries retain values with explicit stale labels and dimmed decoration. Expired/missing values show Unavailable. Acquisition failures retain existing observations with explicit failure state. A failed radius projection does not fabricate geometry. Your Trades remains a separate data domain.
Hover is limited to (-3..3px,-4..2px), has independent phase/duration, pauses via control and while hidden, and is removed for reduced motion. It never gates or delays model updates.

## Verification and limitations
Local TypeScript compilation, production build, 19 focused behavior/composition/lifecycle tests, and all 1,125 tests across 286 files passed. Local runtime was Node24.19.0/npm11.9.0 with unchanged previously installed lockfile dependencies; the canonical gate independently installs under pinned Node22.16.0/npm10.9.2. Dedicated identity/boundary verification is registered in package.json. Canonical gate retains deterministic installation, pinned toolchain and Lightweight Charts5.2.1, production build, full unit regression, all registered controlled-roadmap verifiers and historical closures.
A real Chromium browser stage additionally checks material alpha, visible hover, pause, reduced motion, unchanged coordinates across all3 existing themes plus a light stress surface, 8/30 circle views, collisions, overflow and page errors. Screenshots and JSON results are uploaded with gate evidence. Local Chromium152 completed these browser checks successfully; its mobile dark/light screenshots were visually inspected. A missing Bitcoin font glyph was caught and replaced with a scalable SVG icon, then the browser checks passed again. Canonical browser execution is still pending until its stage completes; local/source checks alone are not canonical PASS.
No old gate, verifier or historical test is weakened. Only after canonical success can this become released ownership. No deployment or full visual-fidelity/performance sign-off is claimed merely from CI.

## R1 — design-system ownership repair
Gate385/run34602026483 failed the unchanged P2.1 design-system verifier on literal spacing in the glass CSS. The canonical production build, glass identity, browser transparency/themes/motion and full unit regression had passed. Historical closures and candidate upload were skipped, so Gate384 remains GOLDEN.
R1 is reconstructed from the exact Gate384 archive plus the intended 14-file glass amendment. The label gap and visually hidden element geometry now derive from the existing shared spacing token, including its negative margin. No verifier exception or suppression is added. Approved artwork, animation, data owners and scope are preserved. The unchanged design-system check passed locally after the repair; real Chromium checks also passed again. Local verify:doctor encountered EAI_AGAIN resolving the npm registry and is recorded as HOLD, not PASS. All canonical verifier and environment requirements remain enabled for the new gate.
