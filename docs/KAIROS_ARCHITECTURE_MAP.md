# KAIROS ARCHITECTURE MAP (Living Document)

## Purpose

This is not a file tree. GitHub already shows where files sit. This
document answers a different question: **which phase owns which
concept, fact, or boundary, and where does that ownership live in
code.** It exists so that six months from now, or for a new developer,
"where do I look for X" and "am I allowed to touch Y" have a fast,
authoritative answer instead of requiring a re-read of forty phases of
handoffs.

## Maintenance rule (read this before editing)

Update this file **at every phase-closure gate**, not at the end of
the project. Each update must come from the same evidence discipline
as everything else in Kairos:

- Only add a row once a phase has an actual **canonical PASS**.
- Pull the "owner," "file/module," and "boundary" columns from the
  real diff and the phase's own stated non-scope — never from memory
  or assumption.
- If a later phase changes an existing owner (e.g. a boundary gets
  split or a module gets renamed), **edit the existing row** with a
  note like "moved from X in P17.9" rather than leaving two
  conflicting entries.
- This file is descriptive, not authoritative. If it ever disagrees
  with the actual code or a canonical gate, the code/gate wins, and
  this file gets corrected — never the other way around.

Audit exception recorded 2026-09-05: the user explicitly required a pre-closure
P18 ownership verification. The P18 ledger below was therefore rebuilt from the
canonical P18.41 artifact, retained per-patch reports, verifier-enforced changed
source boundaries, and production modules after canonical P18.41 PASS #248.
P18.42 is intentionally not included in this ledger because this audit covers
P18.1-P18.41 only.

---

## Core Truth Ownership

| Concept / Truth | Owner (Phase) | File / Module | Boundary — what it must NOT do |
|---|---|---|---|
| Journal execution truth (entry/exit/qty as user logged) | P9 / P10 | *(fill in exact path)* | Never silently overwritten by market data |
| Derived financial metrics (P&L, R-multiple, fees, risk) | P11 (Calculation Brain) | *(fill in exact path)* | UI is never a second calculation owner |
| Journal history / record listing | P12 | *(fill in exact path)* | — |
| Visual P&L presentation | P13 | *(fill in exact path)* | Must not aggregate incomparable currencies |
| Trade visualizer (plan vs. actual diagram) | P14 | *(fill in exact path)* | Not-to-scale disclosure until real geometry exists |
| Market data acquisition (provider-neutral) | P15 | *(fill in exact path)* | Never overwrites journal execution truth |
| Binance Spot live feed (concrete provider) | P16 | *(fill in exact path)* | Provider mapping is not journal execution truth |
| Chart rendering / presentation | P17 | *(fill in exact path)* | Presentation only — never decides financial truth |
| Drawing tools through selection coordination | P18 (canonical through P18.41) | `src/features/chart/` modules listed below | No persistence/P20 ownership; no Risk/Reward/P19 semantics; no journal/calculation truth |

---

## P18 Drawing Tools Ownership Ledger — canonical through P18.41

Each row records one distinct **patch responsibility**. Some later patches extend
an already-established owner module; those rows are marked as an extension rather
than a second owner.

| Patch | One distinct responsibility | Production file / owner seam | Boundary / ownership note |
|---|---|---|---|
| P18.1 | Provider-neutral committed drawing contract | `chartDrawingContract.ts` | Drawing shape/truth only; no renderer/provider/persistence/interaction |
| P18.2 | Single drawing/anchor truth -> renderer projection | `chartDrawingProjection.ts` | Sole domain drawing -> renderer drawing projection owner |
| P18.3 | Provider-neutral drawing-layer lifecycle port | `chartDrawingLayerPort.ts` | Lifecycle seam only; no Lightweight Charts implementation |
| P18.4 | Provider primitive attach/detach driver | `lightweightChartsV5DrawingLayerDriver.ts` | Owns provider primitive attachment lifecycle only |
| P18.5 | Renderer logical time/price -> provider screen segments | `lightweightChartsV5TrendLineCoordinateProjection.ts` | Forward screen projection only; no Canvas/hit-test |
| P18.6 | Canvas trend-line rendering | `lightweightChartsV5TrendLinePaneRenderer.ts` | Draws already-projected segments; no coordinate ownership |
| P18.7 | Trend-line primitive view/lifecycle composition | `lightweightChartsV5TrendLinePrimitive.ts` | Primitive view/update lifecycle; no attach/detach owner |
| P18.8 | Trend-line primitive factory | `lightweightChartsV5TrendLinePrimitiveFactory.ts` | Factory/stroke snapshot only |
| P18.9 | Neutral series handle -> provider series resolution | `lightweightChartsV5ModuleAdapter.ts` (`resolveSeries`) | Series identity map only; neutral handle stays provider-free |
| P18.10 | Trend-line drawing-layer provider composition/adaptation | `lightweightChartsV5TrendLineDrawingLayerComposition.ts` | Composes P18.4/P18.8/P18.9; no new lifecycle owner |
| P18.11 | Series + drawing presentation resource lifecycle | `chartDrawingPresentationPort.ts` | Sole series/drawing presentation ordering owner |
| P18.12 | Point-to-segment hit-test geometry | `lightweightChartsV5TrendLineHitTest.ts` | Pure geometry/top-most resolution; no subscription |
| P18.13 | Primitive hit-test identity binding | `lightweightChartsV5TrendLinePrimitive.ts` | Binds P18.12 result into provider primitive hit shape; no second geometry owner |
| P18.14 | Provider hover event -> current-snapshot drawing-hover projection | `lightweightChartsV5DrawingHoverProjection.ts` | Evidence projection only; no hover subscription lifecycle |
| P18.15 | Crosshair hover subscription lifecycle | `lightweightChartsV5DrawingHoverSubscription.ts` | Sole `subscribeCrosshairMove`/`unsubscribeCrosshairMove` owner |
| P18.16 | Neutral series handle -> provider chart resolution | `lightweightChartsV5ModuleAdapter.ts` (`resolveChart`) | Chart identity map only; distinct from P18.9 series lookup |
| P18.17 | Provider hover binding composition | `lightweightChartsV5DrawingHoverBindingComposition.ts` | Resolves chart/capabilities then delegates lifecycle to P18.15 |
| P18.18 | Provider-neutral hover lifecycle port | `chartDrawingHoverPort.ts` | Neutral attach/destroy/observation lifecycle; no provider subscription implementation |
| P18.19 | Neutral hover port -> Lightweight Charts binding composition | `lightweightChartsV5DrawingHoverPortComposition.ts` | Adapter composition only; P18.18/P18.17 remain owners |
| P18.20 | Hover attachment ordering inside presentation lifecycle | `chartDrawingPresentationPort.ts` | Extension of P18.11; no second presentation or hover owner |
| P18.21 | Drawing interaction-state shape vocabulary | `chartDrawingInteractionContract.ts` | State shape only; no transition semantics/current-state storage |
| P18.22 | Drawing interaction-event vocabulary | `chartDrawingInteractionEvent.ts` | Intent/evidence vocabulary only; no transition acceptance |
| P18.23 | Drawing interaction transition semantics | `chartDrawingInteractionReducer.ts` | Sole pure reducer/transition owner |
| P18.24 | Active ephemeral interaction session + dispatch | `chartDrawingInteractionPort.ts` | Sole current-state storage/dispatch owner; delegates transitions to P18.23 |
| P18.25 | Provider click coordinates/event -> neutral drawing anchor | `lightweightChartsV5DrawingAnchorProjection.ts` | Reverse provider evidence projection only; domain parser validates decimal truth |
| P18.26 | Provider click subscription lifecycle | `lightweightChartsV5DrawingClickSubscription.ts` | Sole `subscribeClick`/`unsubscribeClick` owner |
| P18.27 | Provider chart/series click binding composition | `lightweightChartsV5DrawingClickBindingComposition.ts` | Resolves capabilities then delegates lifecycle to P18.26 and anchor projection to P18.25 |
| P18.28 | Ephemeral 0/1/2 trend-line draft-anchor collection | `chartTrendLineDraftAnchorCollection.ts` | Draft evidence only; not committed drawing truth |
| P18.29 | Draft anchors <-> interaction-session coordination | `chartTrendLineDraftInteractionCoordination.ts` | Coordinates P18.24/P18.28; stores no second state/anchor collection |
| P18.30 | Provider click -> draft-interaction lifecycle composition | `lightweightChartsV5TrendLineDraftInteractionComposition.ts` | Composes P18.27/P18.29; no direct click subscription owner |
| P18.31 | Complete two-anchor draft -> committed trend-line construction | `chartTrendLineDraftCommitConstruction.ts` | Pure constructor; caller supplies ID; no commit dispatch/collection |
| P18.32 | Preview draft -> committed interaction coordination | `chartTrendLineDraftCommitCoordination.ts` | Coordinates construction + authoritative commit transition; no ID allocation/collection |
| P18.33 | Committed in-memory drawing collection | `chartDrawingCollection.ts` | Sole committed runtime set owner; no persistence/P20 |
| P18.34 | Fresh chart drawing ID allocation | `chartDrawingIdentity.ts` | UUID allocation only; separate from trade-domain identity owner |
| P18.35 | ID + draft commit + collection orchestration | `chartTrendLineCommitCollectionCoordination.ts` | Orchestration only; delegates ID/commit/collection ownership |
| P18.36 | Ordered collection snapshot -> renderer snapshot projection | `chartDrawingProjection.ts` (`projectChartDrawings`) | Extension inside P18.2 projection owner; no second projection truth owner |
| P18.37 | Committed collection -> presentation coordination | `chartDrawingCollectionPresentationCoordination.ts` | Reads P18.33, delegates P18.36 projection and P18.11 presentation |
| P18.38 | Selected-drawing interaction semantic amendment | `chartDrawingInteractionContract.ts`, `chartDrawingInteractionEvent.ts`, `chartDrawingInteractionReducer.ts` | Extends P18.21/P18.22/P18.23 owners; creates no second state/event/reducer owner |
| P18.39 | Provider primitive hit -> current-snapshot drawing-selection evidence | `lightweightChartsV5DrawingSelectionProjection.ts` | Selection evidence projection only; stale/non-drawing evidence fails closed |
| P18.40 | Raw provider click evidence fan-out | `lightweightChartsV5DrawingClickSubscription.ts`, `lightweightChartsV5DrawingClickBindingComposition.ts` | Extension inside P18.26/P18.27 single-click path; no second subscription owner |
| P18.41 | Validated selection evidence -> interaction dispatch coordination | `lightweightChartsV5DrawingSelectionInteractionCoordination.ts` | Delegates P18.39 validation and P18.24 dispatch; no subscription/state/mutation owner |

### P18 ownership-overlap audit notes

The following pairs/groups touch the same module or concept and therefore look
potentially overlapping, but current canonical source preserves one owner:

- **P18.2 / P18.36:** same projection module. P18.36 is an ordered collection
  helper that delegates every element to P18.2; P18.2 remains the sole drawing
  truth -> renderer projection owner.
- **P18.9 / P18.16:** same provider binding module, but separate identity maps:
  provider series vs provider chart.
- **P18.11 / P18.20:** same presentation module. P18.20 extends P18.11 resource
  ordering with optional hover attachment; it does not create a second
  presentation lifecycle or hover lifecycle.
- **P18.12 / P18.13:** hit-test geometry vs primitive/provider hit-shape binding.
- **P18.14 / P18.18:** provider hover projection vs provider-neutral hover
  lifecycle/observation port.
- **P18.15 / P18.17 / P18.19:** provider hover subscription lifecycle vs provider
  binding composition vs neutral-port/provider composition.
- **P18.21 / P18.22 / P18.23 / P18.24 / P18.38:** state shape, event vocabulary,
  transition semantics, active state/dispatch, and the later selection semantic
  amendment remain separate. P18.38 extends the first three owners rather than
  replacing or duplicating them.
- **P18.25 / P18.5:** reverse provider click-coordinate -> domain anchor projection
  is distinct from forward renderer logical coordinate -> provider screen projection.
- **P18.26 / P18.27 / P18.30 / P18.40 / P18.41:** one click subscription owner
  (P18.26), one provider binding composition (P18.27), one click-to-draft lifecycle
  composition (P18.30), one raw-event fan-out amendment (P18.40), and one
  selection-to-interaction coordinator (P18.41). Current source contains only one
  actual `subscribeClick`/`unsubscribeClick` implementation.
- **P18.29 / P18.32 / P18.35:** all are coordination seams, but at different
  lifecycle boundaries: draft anchor/state, preview commit, and committed
  collection orchestration.

No duplicate authoritative owner was found among P18.1-P18.41 in this audit.

---

## Cross-Cutting Rules (not owned by one phase, apply everywhere)

| Rule | Established In | Notes |
|---|---|---|
| One owner per number/fact | P0 architecture lock | Two legitimately different facts (e.g. execution price vs. market reference price) may coexist — the bug is either masquerading as the other |
| Decimal-safe math, no binary float for money | P0 / P11 | — |
| Offline-first — journal works with no network | P0 / P15 | Market/cloud features are enhancements, never dependencies |
| Local PASS ≠ canonical PASS | Process rule (all phases) | Only GitHub Actions canonical run is authoritative |
| Motion/animation is presentation-only | P14 (established) / P40 (final polish) | Never gates a real data/business state change |

---

## How to use this file

- **"Where do I find X?"** — scan the Concept column, go to the
  File/Module column.
- **"Am I allowed to change Y here?"** — check the Boundary column
  before touching it; if a change would cross that boundary, it
  belongs to a different phase/owner, not this one.
- **"Does a new patch conflict with existing ownership?"** — check
  this table before scoping a new patch. If the new patch would touch
  a row it doesn't own, that's a sign the patch is scoped too broadly.

---

*Last evidence audit: 2026-09-05 — P18 ownership ledger verified through
canonical P18.41 / Kairos Controlled Roadmap Gate #248. Other older phase rows
that still say `(fill in exact path)` remain intentionally unfilled and must be
repaired only from their own canonical evidence.*
