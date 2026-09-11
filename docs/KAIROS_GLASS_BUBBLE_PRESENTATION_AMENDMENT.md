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

## Publication checkpoint
Parent main: abbc1014bc18926652a628ddd50efd666357a0a8.
Canonical candidate: KAIROS_HOME_DASHBOARD_APPROVED_GLASS_BUBBLE_PRESENTATION_AMENDMENT_CANDIDATE_2026-09-11.zip
Bytes: 3323981
SHA-256: fbca690742849e378e3517e4da89695179b848fe7569b69bb7e201f316597871
Git blob: 0f964c8be8ef54ba92dd90445e4e1a3a307077de
Exact delta: 14 files, zero removals. Direct Git Data publication, no bridge. Local clean ZIP integrity and fresh extraction verified. Canonical run is pending publication; do not promote from this document. Current manual user approval authorizes this gate; automation enablement is unchanged.
