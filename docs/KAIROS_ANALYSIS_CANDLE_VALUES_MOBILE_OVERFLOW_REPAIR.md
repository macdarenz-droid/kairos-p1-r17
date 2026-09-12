# Analysis expanded Candle values mobile containment — 13 September 2026

## Authority and base

The latest user authority enables the existing V16 worker to continue one dependency-safe roadmap slice at a time, including visible UI, without routine approval pauses. This bounded repair follows the explicit Gate408 checkpoint investigation: expand the Analysis **Candle values** table on mobile, prove any page overflow, and contain exact values without changing their truth.

Authoritative base is FULL canonical Gate408/run34704149011/job103581033773/head `ce12e31264e3d440f50ae9725a86b4292e640061`. All34 actual stages and exact-run nonexpired artifacts `KAIROS_CURRENT_CANDIDATE`10300618298 and `KAIROS_GATE_EVIDENCE`10300773079 were verified. Base archive `KAIROS_ANALYSIS_HISTORICAL_CANDLES_UI_R1_CANDIDATE_2026-09-12.zip`;3527586bytes;SHA-256 `33b8c48474dbd4d0eabef905900a9f043716c4726bda4b675ccbea7391e67505`;Git blob `223870986b84f2382ee4d290c6ec969e81e6e9d5`. Gate407 remains failed evidence only. Main `86ef57eaf5d25a51619b43a72858d86f9aa7f907` is a documentation-only child whose current approval control is carried into this candidate.

## Confirmed source boundary and intended repair

`AnalysisHistoryWorkspace` renders the exact provider strings in a nowrap table inside `.kairos-analysis-chart__table-scroll`. The Analysis card is a CSS grid. The expanded `<details>` item previously retained its automatic min-content width, allowing long timestamp and tiny-price columns to size the outer grid instead of the existing overflow region.

The repair gives the `<details>` grid item `min-width:0` and explicitly constrains the existing table-scroll region to the available width. The table remains full-width with nowrap exact values, so columns scroll horizontally inside the labelled region rather than wrapping, rounding or widening the page. No new token, colour, spacing, data, calculation or interaction owner is introduced.

The focused browser regression selects `TINYUSDT`, expands **Candle values**, and checks320/390px across kairos-depth, cosmic and ocean. It requires no page overflow, details/region containment, a wider internal scroll area and the exact `0.000000020000` value. A controlled legacy-style override restores the previous automatic min sizing at320px and must reproduce outer-page overflow before the override is removed; this binds the evidence to the actual defect rather than merely checking the repaired state. Existing chart pan, pinch, keyboard, symbol/timeframe, availability and saved-fact assertions remain.

## Scope and preserved truth

Candidate delta from Gate408 is limited to:

- `src/app/analysisHistory.css`
- `scripts/test-analysis-history-browser.mjs`
- `scripts/verify-analysis-history-workspace.mjs`
- `docs/KAIROS_ANALYSIS_CANDLE_VALUES_MOBILE_OVERFLOW_REPAIR.md`
- `docs/KAIROS_CONTINUATION_APPROVAL_CONTROL.md`

No file is removed. Historical candle strings remain exact. No execution is inferred, no saved trade is changed, and no FX/P&L/provider/schema/indexed-storage/Live Bubble behavior changes. P14 execution truth, P18 generic drawing, P19 Risk/Reward, P17 chart rendering and P12 saved-fact hydration retain ownership. P21 remains active.

## Local and canonical validation

The Gate408 archive was independently downloaded and verified before editing: exact size, SHA-256, Git blob, ZIP integrity and `kairos_p76/` root matched. Deterministic install succeeded. The focused static Analysis verifier passed; affected2files/9tests passed; TypeScript and the production build passed; the full303files/1250tests passed. These local commands used the runtime Node24.19.0/npm11.9.0 rather than the frozen Node22.16.0/npm10.9.2 contract, so they are supporting evidence only. The canonical gate retains and enforces the pinned versions.

The runtime has Playwright1.62.1 but no Chromium binary; two official browser installation attempts failed through the runtime network with repeated timeout/truncated-archive/502 responses. Therefore no local rendered result is claimed. The unchanged canonical GitHub browser stage remains mandatory and is the authority for the controlled legacy reproduction, repaired mobile screenshots and exact geometry evidence.

The candidate is not GOLDEN until `.github/workflows/kairos-gate.yml` job `verify-current-candidate` passes every stage and both exact-run nonexpired artifacts are verified. The frozen report remains pre-gate evidence; later root continuity records the canonical result without changing candidate bytes.
