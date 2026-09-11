# Percentage sizing and continuous motion amendment

Base: FULL canonical Gate389, run34620839663, head da46920c440a76a20e33b9230b9ba24ac073bdec. All stages and both exact-run artifacts verified.

Explicit user change: hide fresh text, remove pause/resume, hide market details for now, resize bubbles with live percentage changes.

Visual radii now use absolute 24h percentage movement, bounded at 20%, square-root interpolation from 48px to the existing responsive maximum. Positive and negative equal magnitudes have equal size. Missing/nonfinite movement has no invented size. Existing Top30 volume ranking, provider acquisition, freshness ownership and released volume projections remain unchanged. Existing stale/expired warnings, reduced-motion accessibility and hidden-tab suspension remain. No user pause state.

Width/height/position interpolate for 800ms. Instrument identity and hover animation remain stable across fact/ranking refreshes. Market evidence stays mounted but hidden and can be restored later.

Validation: local TypeScript/build passed; full unit suite: 287 files / 1131 tests passed; final focused map rerun: 9 tests passed; presentation verifier passed. Browser executable absent locally and download timed out; canonical browser stage remains mandatory. Canonical pass is pending; this candidate is not GOLDEN.
