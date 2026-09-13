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

Update this file **after every canonical PASS that establishes, extends, moves, or clarifies a production responsibility/owner/boundary**, and at every phase closure. A PASS that changes no architecture still requires an audit, but not a meaningless edit. Each update must come from the same evidence discipline as everything else in Kairos:

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
P18 ownership verification. The P18 ledger below was rebuilt from canonical
artifacts, retained per-patch reports, verifier-enforced changed source
boundaries, and production modules. P18.51R3 was added only after its canonical PASS #262; P18.52/P18.53/P18.54/P18.55/P18.56/P18.57/P18.58 were added only after canonical PASSes #263/#264/#265/#266/#267/#268/#269; failed P18.51 runs #259-#261 remain evidence only.

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
| Drawing tools through complete generic drawing/edit lifecycle system closure | P18 (canonical through P18.60) | `src/features/chart/` modules listed below | No persistence/P20 ownership; no Risk/Reward/P19 semantics; no journal/calculation truth |
| Risk/Reward Tool — semantics + provider-neutral logical chart-object composition | P19 (SYSTEM CLOSED through P19.7) | `src/application/risk-reward/`, `src/app/riskRewardChartStyleProjection.ts`, `src/app/riskRewardChartPlacementProjection.ts`, `src/app/riskRewardChartObjectProjection.ts` | P19 owns RR meaning and provider-neutral logical composition only. Closure adds no runtime owner. P18 retains generic provider/interaction machinery; P11 calculations; P14 journal/execution truth; P20 Saved Analysis persistence; P2/P3 token values; later UI owns DOM/pixel presentation. |

---

## P18 Drawing Tools Ownership Ledger — canonical through P18.60

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
| P18.42 | Selection coordination inside the existing provider click lifecycle | `lightweightChartsV5TrendLineDraftInteractionComposition.ts` | Extension of P18.30; same P18.26 click subscription and same P18.24 state owner |
| P18.43 | Authoritative interaction state + current renderer snapshot -> selection presentation evidence | `chartDrawingSelectionPresentationProjection.ts` | Provider-neutral fail-closed projection only; no second interaction/projection/collection owner |
| P18.44 | Identity-preserving committed drawing replace/remove mutation | `chartDrawingCollection.ts` | Controlled extension of P18.33 sole committed-set owner; no second collection/mutation owner |
| P18.45 | Authoritative deleting-state -> committed removal + interaction reset coordination | `chartDrawingDeletionCoordination.ts` | Orchestration only; delegates transition/current-state to P18.23/P18.24 and removal to P18.33/P18.44 |
| P18.46 | Drawing-only presentation refresh on existing active series | `chartDrawingPresentationPort.ts` | Controlled extension of P18.11/P18.20; reuses active series/drawing layer and renews hover snapshot evidence |
| P18.47 | Committed collection -> drawing-only presentation refresh coordination | `chartDrawingCollectionPresentationCoordination.ts` | Controlled extension of P18.37; delegates P18.36 projection and P18.46 drawing-only refresh without duplicating coordination ownership |
| P18.48 | Identity-preserving provider-neutral trend-line edit construction | `chartTrendLineEditConstruction.ts` | Pure constructor only; explicit start/end endpoint + replacement anchor -> same drawing ID/kind; no collection mutation or interaction dispatch |
| P18.49R1 | Authoritative trend-line edit-endpoint interaction semantics + typecheck fixture repair | `chartDrawingInteractionContract.ts`, `chartDrawingInteractionEvent.ts`, `chartDrawingInteractionReducer.ts` | Controlled extension of P18.21/P18.22/P18.23: accepted editing state stores exact drawing ID + P18.48 endpoint; no edit mutation/provider gesture owner; R1 fixes only invalid test fixtures from failed #256 |
| P18.50 | Authoritative editing-state -> committed identity-preserving trend-line replacement + interaction reset coordination | `chartTrendLineEditCoordination.ts` | Orchestration only; consumes P18.49R1 drawing ID/endpoint authority, delegates construction to P18.48 and replacement to P18.33/P18.44; no provider gesture or presentation owner |
| P18.51R3 | Successful authoritative trend-line edit -> drawing-only presentation refresh composition | `chartTrendLineEditPresentationCoordination.ts` | Composes P18.50 edit execution with P18.47 refresh; presentation failure never rolls back committed edit truth; R1-R3 repaired test/type evidence only |
| P18.52 | Authoritative deletion execution -> drawing-only presentation refresh composition | `chartDrawingDeletionPresentationCoordination.ts` | Composes P18.45 with P18.47 only; no deletion initiation, direct mutation/projection, or rollback of committed truth on presentation failure |
| P18.53 | Authoritative selected drawing -> deletion-intent initiation coordination | `chartDrawingDeletionInitiationCoordination.ts` | Reads exact selected identity from P18.24 state and delegates existing `start-deleting` transition; caller cannot supply drawing ID; no deletion execution/provider/UI owner |
| P18.54 | Authoritative selected drawing + typed endpoint -> edit-intent initiation coordination | `chartTrendLineEditInitiationCoordination.ts` | Reads exact selected identity from P18.24 state, accepts only P18.48 endpoint evidence, and delegates existing `start-editing` transition; caller cannot supply drawing ID; no endpoint hit-test/execution/provider/UI owner |
| P18.55 | Projected trend-line endpoint geometry -> typed edit-endpoint hit evidence | `lightweightChartsV5TrendLineHitTest.ts` | Controlled extension of P18.12 geometry owner; derives exact drawing ID + P18.48 `start`/`end` endpoint from P18.5 projected endpoints; no interaction/provider-subscription/edit-execution owner |
| P18.56 | Typed endpoint-hit drawing identity -> authoritative selected edit-initiation coordination | `chartTrendLineEditEndpointHitCoordination.ts` | Binds P18.55 hit identity to current P18.24 selected identity before delegating only endpoint to P18.54; no direct dispatch/geometry/execution/provider owner |
| P18.57 | Raw provider click point + current projected endpoint segments -> authoritative edit-initiation coordination | `lightweightChartsV5TrendLineEditEndpointClickCoordination.ts` | Composes existing P18.40 click evidence through P18.55/P18.56 only; no provider subscription, projection, direct dispatch, or edit execution owner |
| P18.58 | Existing single click lifecycle -> selected endpoint edit-click composition | `lightweightChartsV5TrendLineDraftInteractionComposition.ts` | Optional lifecycle wiring only; delegates same raw P18.40 click to P18.57 before P18.41 selection so pre-click selected identity remains authoritative; no second subscription or edit execution owner |
| P18.59 | Existing single click lifecycle -> already-authoritative edit execution + drawing-only refresh composition | `lightweightChartsV5TrendLineDraftInteractionComposition.ts` | Optional lifecycle extension only; snapshots pre-click `editing` state so the initiation click cannot self-execute, then delegates a later projected anchor to P18.51R3; P18.26 remains the sole subscription owner and P18.50/P18.51R3 remain mutation/refresh owners |

### P18 ownership-overlap audit notes

The following pairs/groups touch the same module or concept and therefore look
potentially overlapping, but current canonical source preserves one owner:

- **P18.2 / P18.36:** same projection module. P18.36 is an ordered collection
  helper that delegates every element to P18.2; P18.2 remains the sole drawing
  truth -> renderer projection owner.
- **P18.9 / P18.16:** same provider binding module, but separate identity maps:
  provider series vs provider chart.
- **P18.11 / P18.20 / P18.46:** same presentation module. P18.20 extends P18.11 resource
  ordering with optional hover attachment; P18.46 extends the same owner with drawing-only
  refresh on the active series and hover-snapshot renewal. Neither creates a second
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
- **P18.26 / P18.27 / P18.30 / P18.40 / P18.41 / P18.42:** one click subscription
  owner (P18.26), one provider binding composition (P18.27), one click-to-draft
  lifecycle composition (P18.30), one raw-event fan-out amendment (P18.40), one
  selection-to-interaction coordinator (P18.41), and one composition amendment
  that wires selection into that same lifecycle (P18.42). Current source contains
  only one actual `subscribeClick`/`unsubscribeClick` implementation.
- **P18.29 / P18.32 / P18.35:** all are coordination seams, but at different
  lifecycle boundaries: draft anchor/state, preview commit, and committed
  collection orchestration.

- **P18.38 / P18.43:** interaction semantics/state remain owned by P18.21-P18.24/P18.38; P18.43 only projects already-authoritative selected/editing/deleting state against the current renderer snapshot for presentation evidence.
- **P18.33 / P18.44 / P18.45:** P18.44 extends the existing P18.33 committed collection owner with strict identity-preserving replace/remove operations; P18.45 only coordinates an already-authoritative deleting state into that owner and does not create a second committed-set or mutation owner.
- **P18.37 / P18.47:** same collection-to-presentation coordination module. P18.47 adds the drawing-only refresh route through P18.46 while P18.37 remains the sole committed collection -> presentation coordination owner.
- **P18.50 / P18.51R3:** P18.50 remains the authoritative edit-execution coordinator; P18.51R3 only composes a successful edit into the existing P18.47 presentation-refresh owner and never becomes a second mutation/projection/presentation owner.
- **P18.45 / P18.52 / P18.53:** P18.45 remains the authoritative deletion-execution coordinator; P18.52 only composes successful deletion into P18.47 drawing-only refresh; P18.53 only initiates the existing deleting transition from authoritative selected identity and never executes deletion or becomes a second mutation/projection/presentation owner.
- **P18.48 / P18.49R1 / P18.50 / P18.51R3 / P18.54:** P18.48 owns endpoint vocabulary/construction; P18.49R1 stores accepted endpoint authority; P18.50 executes; P18.51R3 refreshes presentation; P18.54 only initiates editing from selected identity plus typed endpoint evidence and cannot accept caller-supplied drawing identity.

- **P18.54 / P18.55:** P18.54 initiates editing only from authoritative selected identity plus typed endpoint evidence; P18.55 derives that endpoint evidence from existing projected endpoint geometry without dispatching interaction or executing edits.
- **P18.55 / P18.56:** P18.55 remains endpoint geometry/evidence owner; P18.56 only binds that hit drawing identity to authoritative selected identity before delegating endpoint initiation to P18.54.
- **P18.57 / P18.58 / P18.42:** P18.57 coordinates one already-observed raw click against current projected endpoint segments; P18.58 wires that coordinator into the existing P18.30/P18.42 single click lifecycle and evaluates edit evidence before P18.41 selection evidence; P18.26 remains the sole actual provider click subscription owner.
- **P18.50 / P18.51R3 / P18.58 / P18.59:** P18.50 remains authoritative committed edit execution and P18.51R3 remains edit->drawing-only-refresh composition; P18.58 only initiates edit intent from an endpoint click, while P18.59 extends the same single click lifecycle to route a later projected anchor through P18.51R3 only when `editing` was already authoritative before that click.

No duplicate authoritative owner was found among canonical P18.1-P18.60; P18.60 is the explicit Drawing Tools system closure.

---

## P19 Risk/Reward Ownership Ledger — canonical through P19.6

Each row records one canonically passed P19 responsibility. P19 owns Risk/Reward meaning and provider-neutral logical composition; it deliberately consumes existing domain/chart/design-system types without taking their ownership.

| Patch | One distinct responsibility | Production file / owner seam | Boundary / ownership note |
|---|---|---|---|
| P19.1 | Provider-neutral Risk/Reward analysis identity, side, and entry/stop/target levels | `src/application/risk-reward/riskRewardAnalysisContract.ts` | Reuses `TradeSide` + `DecimalString`; no ratio/R math, direction/order validation, chart geometry, provider API, UI/editing, persistence, journal writes, or execution-price mutation |
| P19.2 | Semantic risk/reward price-zone projection | `src/application/risk-reward/riskRewardZoneSemantics.ts` | `risk` = entry→stop and `reward` = entry→target; no ratio math, price ordering/normalization, styling, chart geometry/provider API, P18 widening, persistence, or journal mutation |
| P19.3 | Immutable RR-specific chart semantic composition | `src/application/risk-reward/riskRewardChartSemantics.ts` | Composes identity/side, semantic entry/stop/target levels, and P19.2 zones; no timestamp/span/screen geometry, provider/LWC API, P18 `ChartDrawing` widening, UI/editing, persistence, or P11 math |
| P19.4 | Semantic role → existing design-token reference projection at app boundary | `src/app/riskRewardChartStyleProjection.ts` | Maps entry/stop/target/risk/reward to existing P2/P3 semantic token CSS-variable references; does not own token values, business semantics, geometry, provider APIs, CSS/UI, persistence, or calculations |
| P19.5 | Caller-supplied logical horizontal placement projection | `src/app/riskRewardChartPlacementProjection.ts` | Preserves analysis id + generic `ChartTimestamp` start/end only; `ChartTimestamp` remains generic chart-infrastructure ownership; no order/normalization, price/R math, pixels/provider APIs, P18 widening, UI/editing, or P20 persistence |
| P19.6 | Provider-neutral logical RR chart-object geometry composition | `src/app/riskRewardChartObjectProjection.ts` | Entry/stop/target become logical horizontal spans; risk/reward become logical rectangles using P19.3 prices/zones + P19.4 token refs + P19.5 logical extent. No provider/LWC API, numeric renderer conversion, pixels, P18 widening, DOM/UI/editing, P20 persistence, P14 mutation, P11 math, normalization/order validation, or hard-coded colors |

### P19 ownership-overlap audit notes

- **P19.1 / P19.2 / P19.3:** analysis truth, zone semantics, and RR chart semantic composition are distinct. P19.3 composes earlier owners rather than replacing them.
- **P19.3 / P19.4:** semantic roles/prices remain application truth; P19.4 only attaches existing design-token references at the presentation boundary.
- **P19.5 / P18 chart infrastructure:** P19.5 consumes existing generic `ChartTimestamp`; it does not move timestamp ownership into P19 or widen P18.
- **P19.3 / P19.4 / P19.5 / P19.6:** P19.6 is not a redundant combined view model. It owns the newly established provider-neutral logical geometry, while semantic, style-reference, and placement owners remain separate and authoritative.
- **P19 / P11 / P14 / P20:** P11 remains calculation/R-multiple owner, P14 remains journal/execution truth, and P20 remains later Saved Analysis persistence. P19.1-P19.6 do not duplicate those responsibilities.

No duplicate authoritative owner was found among canonical P19.1-P19.6.

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

*Last evidence audit: 2026-09-06 — P18 ownership ledger verified through canonical P18.60 / Kairos Controlled Roadmap Gate #273, and P19 ownership ledger verified through canonical P19.6 / Kairos Controlled Roadmap Gate #279 (`34018858400`). Other older phase rows that still say `(fill in exact path)` remain intentionally unfilled and must be repaired only from their own canonical evidence.*

## P18 Drawing Tools — system closure (P18.60)

Canonical closure intent: P18 owns generic chart drawing and interaction machinery only: drawing lifecycle, projection/rendering, hover/hit testing, click evidence, selection, editing/deletion interaction infrastructure, and provider plumbing. P18 does not own Risk/Reward business truth, journal execution truth, or persistence semantics reserved for later roadmap phases. P19 may consume the generic P18 drawing machinery while owning Risk/Reward meaning and composition. This closure adds no new runtime/business owner; it closes the verified P18 responsibility set after P18.59.


---

## P19 Risk/Reward Tool System Closure — canonical P19.7

P19 closes only the roadmap-owned **Risk/Reward Tool semantic and provider-neutral logical composition boundary**. Canonical P19.1–P19.6 already establish analysis identity/side/prices, risk/reward zones, chart semantics, semantic token-reference projection, logical time placement, and logical chart-object composition. P19.7 adds **no production runtime behavior and no new production owner**.

Closure boundary:

- P19 owns Risk/Reward semantic truth and provider-neutral logical chart-object composition.
- P18 remains the sole generic chart drawing / provider / interaction machinery owner; P19 does not widen P18.
- P11 remains calculation truth; P14 remains journal/execution truth.
- P20 owns later Saved Analysis persistence; P19 closure implements no persistence.
- P2/P3 retain semantic token values; P19 only references established semantic tokens.
- DOM/UI/CSS, renderer-number conversion, Lightweight Charts production calls, and pixel/screen geometry remain outside this closure.

Canonical phase rule: after P19.7 receives a full canonical PASS, P19 is closed. Any later Risk/Reward amendment must be a new controlled amendment from the latest GOLDEN and must preserve these ownership boundaries.


---

## P20 canonical ownership ledger — SYSTEM CLOSED through P20.5

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis logical contract foundation | `src/app/savedAnalysisContract.ts` | Owns Saved Analysis logical shape and stable identity only; no persistence/UI/provider ownership |
| P20.2 | Saved Analysis persistence foundation | `src/data/repositories/SavedAnalysisRepository.ts` plus existing database/backup/restore seams | Owns raw persisted storage and backup/restore of the logical contract; no application orchestration/UI/provider ownership |
| P20.3 | Saved Analysis application-save orchestration | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Fresh-id allocation + one atomic repository write only; no inferred read/update/delete/list ownership |
| P20.4 | Saved Analysis application load-one-by-id orchestration | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | One stable-id repository read only; no UI/provider/pixels, list/update/delete orchestration, schema/backup/index changes, or invented metadata |
| P20.5 | Saved Analysis system closure | verification/docs/package boundary only; no production runtime owner added | Proves P20.1 logical contract + P20.2 persistence/backup/restore + P20.3 save + P20.4 load-one as the complete source-proven P20 boundary; does not invent list/update/delete/UI/provider/pixel ownership |

## P20 Saved Analysis System Closure — P20.5

P20 closes the source-proven Saved Analysis boundary established by P20.1–P20.4. P20.5 adds **no production runtime behavior and no new production owner**.

Closure boundary:

- P20.1 owns the Saved Analysis logical contract and stable identity.
- P20.2 owns persisted storage plus backup/restore of that logical contract.
- P20.3 owns application save orchestration: fresh id allocation plus exactly one persisted write.
- P20.4 owns application load-one-by-stable-id orchestration: exactly one repository read.
- Raw repository lifecycle primitives such as listAll/delete/replaceAll remain data-layer capabilities unless a later source-proven product requirement assigns application ownership; P20 closure does not invent generic CRUD.
- P17/P18/P19 retain chart/drawing/Risk-Reward logical truth. P20 composes/persists that truth and does not redefine it.
- UI/routes/dashboard/provider rendering/pixels remain outside P20 and belong to later roadmap phases.

Canonical phase rule: P20 is closed only after the authoritative `Kairos Controlled Roadmap Gate` passes this exact closure candidate and publishes both canonical artifacts. P21 may not begin before that PASS.

## Home Your Trades V1 candidate from Gate395

User-approved P21 continuation: HomeRoute selects Live Market or Your Trades and mounts exactly one runtime. New application/dashboard/homeDashboardYourTradesQuery delegates listJournalHistory and its released calculation/outcome projections, projecting individual saved trade identity and available closed/realized results without arithmetic or currency inference. New app/HomeDashboardYourTrades owns read lifecycle, pagination, selection and presentation, reusing exported glass decorations/icons and generic viewport/motion owners. Approved live-market design/provider/policy and P11/P12/P13/P14 truth are preserved. Tests and scope: docs/KAIROS_HOME_YOUR_TRADES_V1.md. Pending canonical promotion; not P21 closure.


## Journal execution-entry integration amendment from Gate396

Gate396 is FULL canonical PASS: run34670701285/job103491385531/headb016648c08f2b45a0acb2793afeec1c71764553e, all required stages and both nonexpired exact-run artifacts verified. Your Trades V1 is released; P21 remains open.

The next user-approved amendment exposes existing P10 save capability through JournalExecutionFields and manualTradeExecutionDraft. New row state is ephemeral and separate from plans; financial strings flow unchanged to existing saveManualTrade validation and atomic persistence. Explicit device-local timestamps normalize to UTC. Existing history/P11/P13/P21 consumers retain calculations, missing-value/currency rules and result meaning. No schema, repository, calculator or provider changes. See KAIROS_JOURNAL_EXECUTION_ENTRY_AMENDMENT.md. This candidate requires its own full canonical PASS; it does not close P21.

Latest user control: resume the same hourly worker after manual publication; require explicit user approval before each subsequent new slice, including its UI. Verification/repairs of the already-approved slice remain autonomous. See KAIROS_CONTINUATION_APPROVAL_CONTROL.md.


## Existing Open manual trade update amendment from Gate397

Gate397 is FULL canonical PASS (run34673378828/job103498808783/head8b712e51cf6f2fd6b7a5d2e32e793d3229801e47), with all stages and both artifacts verified. The user's next explicit continuation authorizes one P10/P12 integration amendment: updateOpenManualTrade reuses the existing prepareManualTrade validation owner and existing atomic repositories to append new executions/fees and manually update Open/Closed status on the same saved manual trade. Snapshot checking prevents stale/duplicate appends; existing identity, plan, entries/exits and linked fees remain intact. JournalOpenTradeUpdate presents the new flow within JournalHistoryList, while JournalRoute owns refresh. P11/P12/P13/P14/P21 result truth and approved Live Bubble UI remain unchanged. No schema, provider or dependency changes. See KAIROS_OPEN_TRADE_UPDATE_AMENDMENT.md and the latest approval control. This amendment needs its own full canonical gate; P21 remains open and a following slice awaits UI review.


## Explicit price/result currency integration from FULL Gate398

User-authorized next slice12September2026. TradeRecord adds an optional non-indexed grossPnlCurrency fact; legacy absence stays unknown. P10 draft/save captures explicit user priceCurrency and normalizes through the existing application owner. Open manual update can add missing currency once under the existing atomic transaction/full-snapshot concurrency guard and preserves recorded currency thereafter. P12 history delegates the saved evidence to the existing P11 calculateTradeMetrics currency parameter. P13/P21 consume resulting amounts/units unchanged. JournalPriceCurrencyField owns presentation only; history formats known units and preserves unavailable states. No index/schema/backup-version/backfill, calculator, provider, Live Bubble, plan/execution or phase-closure changes. Backup domain validation rejects malformed evidence and full record snapshot/restore preserves the optional fact. See KAIROS_JOURNAL_PNL_CURRENCY_AMENDMENT.md for exact tests, research and limits. This candidate awaits its own FULL canonical gate; next slice awaits user review.

## Saved trade review candidate from FULL Gate401

Pre-gate source audit for the user's explicit12September2026 continuation; this section describes the candidate and adds no canonical ledger row or phase closure. Gate401 is the FULL verified base; this candidate requires its own complete canonical PASS.

P12 `src/application/journal/historyQuery.ts` extends its read boundary with `getJournalHistoryEntry`: one primary-key repository lookup and child reads inside a readonly transaction. Bounded recent-history queries retain their indexes/limits; both entry paths delegate one shared hydration owner and existing P11 calculation/P13 result projection. `loadTradeReview.ts` opens the database and chooses exact-ID detail versus bounded recent selection. It never substitutes another trade for a missing ID.

`src/app/AnalysisRoute.tsx` owns URL selection and cancellable read lifecycle, retry/refresh and empty/missing/error presentation. `TradeReviewDetails.tsx` formats saved facts and precomputed result evidence only. `ReviewTradeLink.tsx` owns encoded exact-ID navigation from Journal and Your Trades. UI tokens remain P2/P3-owned. There is no second calculator, financial inference, storage mutation, schema/provider change or chart/risk-reward ownership. P14/P17/P18/P19 chart integration remains a separate user capability gap; P20 Saved Analysis persistence is untouched. See KAIROS_SAVED_TRADE_REVIEW_AMENDMENT.md. P21 remains open; the next slice awaits review and explicit continuation.

## Saved trade review — canonical integration amendment, Gate402

FULL canonical PASS verified 12 September 2026: Gate402/run34684862514/job103529980136/heada78d048d6612867a2b8eb33bf0ddb040962f7416, all29actual stages succeeded. Both exact-run artifacts are present, nonexpired and bound to this head: KAIROS_CURRENT_CANDIDATE10294728829 and KAIROS_GATE_EVIDENCE10294808722. Workflow .github/workflows/kairos-gate.yml/job verify-current-candidate remains sole authority. Archive KAIROS_SAVED_TRADE_REVIEW_UI_CANDIDATE_2026-09-12.zip;3426535bytes;SHA256f0aedc23ef00e025be70d0ac3e16096ce32c3e88684f301768167c72815b1c1d;Git blob7d98466e26b4140c5b75c733da11cc731116c720. Latest GOLDEN is now402; immediate verified rollback401.

| Released responsibility | Production owner | Boundary |
|---|---|---|
| Exact saved trade snapshot and shared history hydration | P12: `src/application/journal/historyQuery.ts`, `getJournalHistoryEntry` and private shared hydrator | Readonly primary-key/child-record transaction; bounded list indexes/limits retained; P11 calculates and P13 projects result semantics |
| Review selection/detail loading | `src/application/journal/loadTradeReview.ts` | Database readiness and exact-ID versus recent-selection orchestration only; missing identity never falls back to another trade |
| Analysis review URL and read lifecycle | `src/app/AnalysisRoute.tsx` | Selection, refresh/retry and stale/unmount guards only; no persisted edits or second financial truth |
| Saved-fact presentation and entry links | `src/app/TradeReviewDetails.tsx`, `src/app/ReviewTradeLink.tsx`; Journal and Your Trades callers | Format saved plan/execution/fee/result evidence and encoded identity navigation; P2/P3 own styles, existing P11/P13 own amount/outcome meaning |

This canonical release supersedes the preceding candidate section's pending status. No new chart/drawing/risk-reward, schema/provider or calculator owner was introduced. P21 remains open; historical candles and rendered risk-box integration remain pending user capabilities. Preserve the explicit review/continuation boundary. This post-PASS root documentation update does not alter the frozen verified candidate ZIP or gate.

## Journal currency-input repair candidate from FULL Gate402

Pre-gate audit for the approved video44182 repair. P10 `priceCurrencyInput.ts` owns new manual-input syntax; existing prepareManualTrade applies it before identity allocation or writes. updateOpenManualTrade sends only newly added currency through that guard and preserves recorded currency through its existing atomic full-snapshot write. Domain/backup interpretation of saved evidence is unchanged. UI JournalPriceCurrencyField owns clear unit-only copy and accessible inline errors; JournalClosedTradeGuidance owns missing entry/exit presence explanation in create/update forms, never amount/result calculation. This requires its own FULL canonical PASS; no phase closure or canonical ledger row is claimed yet.

## Journal currency-input repair — canonical integration amendment, Gate403

FULL canonical PASS verified 12 September 2026: Gate403/run34688331500/job103539144108/head 3f86b952a7bf4cca223326dcafcbf280cae51ebf; all 30 actual stages succeeded. Both exact-run artifacts are present, nonexpired and bound to this head: KAIROS_CURRENT_CANDIDATE 10296801277 and KAIROS_GATE_EVIDENCE 10296776333. Workflow .github/workflows/kairos-gate.yml/job verify-current-candidate remains sole promotion authority. Archive KAIROS_JOURNAL_CURRENCY_GUIDANCE_REPAIR_CANDIDATE_2026-09-12.zip; 3441426 bytes; SHA256 963049022be4e7137dd5d0b33155c766f7ba6692284d24276a00abcc96b97f8f; Git blob 8edaf3afeabb642cb7f23a4494d3a853c493cca5. Latest FULL GOLDEN is now403; immediate verified rollback402. Preserve401 and failed400 evidence. The candidate ZIP and workflow remain frozen; this root documentation update records verified completion without repackaging.

| Released responsibility | Production owner | Boundary |
|---|---|---|
| New manual price-currency syntax | P10: `src/application/trades/priceCurrencyInput.ts`, called by existing `prepareManualTrade` | Validate only newly supplied manual input before identity allocation or persistence; normalization remains P10-owned; no currency registry or inferred amount/unit |
| Existing recorded currency preservation | `src/application/trades/updateOpenManualTrade.ts` | Only a newly added currency enters preparation; existing immutable evidence stays intact through the existing full-snapshot guarded atomic update, including legacy amount-like text |
| Unit input and accessible errors | `src/app/JournalPriceCurrencyField.tsx`, create/update form callers | Presentation and field-addressed errors only; no financial calculations or direct storage |
| Missing execution explanation | `src/app/JournalClosedTradeGuidance.tsx`, create/update form callers | Presence of saved plus new entry/exit row types controls explanatory copy; P11/P13 continue to own calculation and unavailable-result meaning |

This supersedes the preceding candidate section's pending status. Full current and historical verifiers, including the locally DNS-limited doctor, passed in the canonical environment. No dependency, schema, backup, provider, chart, financial-calculation or Live Bubble changes. P21 remains open. The user subsequently paused autonomous work; the latest approval-control document governs manual continuation.

Read-only follow-up inquiry: During Gate403 verification, the user asked whether a dashboard bubble can be held and dragged, pushing/scattering other bubbles and bouncing on release. Read-only source review confirmed homeDashboardGlassMotion.ts already owns shared bounded elastic collision motion and useHomeDashboardGlassMotion.ts is shared by Live Market and Your Trades. Both can share presentation-only gesture/motion machinery while retaining separate market/trade truth. Your Trades tap selection must remain intact; scrolling, bounded collisions and reduced-motion behavior need real-browser/mobile evidence. This is a feasible contained P21 presentation amendment from the next FULL GOLDEN, not automatically P40 or a new data/calculation owner. This message asks feasibility; no drag implementation or scope expansion was performed during the approved currency repair. Await explicit implementation/continuation after the current repair review.

## Dashboard hold, drag and bounce — candidate from FULL Gate403

User-approved P21 presentation amendment after the explicit “Continue then” response to the hold/drag/flick/settle proposal. Existing homeDashboardGlassMotion.ts remains the sole bounded collision/velocity owner; useHomeDashboardGlassMotion.ts owns one retained identity-keyed frame lifecycle shared by Live Market and Your Trades. New homeDashboardGlassDrag.ts binds ephemeral pointer/touch input to that owner. No market, trade, storage, sizing, colour, selection or financial-calculation responsibility moves into motion. A grabbed body has zero inverse mass for collision displacement, bounded sweep positions and capped input velocity; excess collision/release energy decays to normal drift. Reduced motion permits direct controlled movement with no autonomous release inertia. This section describes a candidate only; P21 remains open until separately approved closure, and this amendment needs its own FULL canonical PASS.


## User-reviewed Gate404 and current profit-size candidate

Gate404 is FULL canonical PASS (run34692607390/head d0343cffd708afbaf6d3a0dc8ae92828e639d128, all31stages and both exact-run artifacts). The user confirmed deployed hold/drag works and approved prior gates. The preceding candidate-only drag status is superseded by that evidence; shared motion/input ownership is unchanged.

The current P21 candidate adds src/app/homeDashboardYourTradesSizing.ts as a pure saved-result-to-presentation-weight projection consumed by HomeDashboardYourTrades.tsx. P11 decimalKernel owns decimal comparison/division; P11/P13 and the existing dashboard query own result/currency/outcome. The existing viewport packer owns pixels/bounds, shared motion owns collisions/drag, and Live Market sizing is unchanged. This candidate needs its own canonical PASS; P21 remains open. See KAIROS_YOUR_TRADES_PROFIT_SIZE_AMENDMENT.md.

KAIROS_CHART_WORKSPACE_INTEGRATION_PLAN.md records the user's newly observed Journal/Analysis gaps against actual source. P17–P20 component closures do not establish a deployed candle workspace. Next integration responsibility after reviewed sizing is exact candle source/identity/history in existing P15/P16, followed by standalone P17 Analysis, live continuity, then P14/P19 trade overlays and P18/P20 tools/save UI. This is a dependency/status ledger, not new production ownership or premature P22 advancement.

## Profit sizing — FULL canonical Gate405

The preceding profit-size candidate is now FULL GOLDEN: canonical run34696306217/job103560275701/head acef469e115c61412407bf0f840d5c15504feadd, all32actual stages succeeded and both exact-run nonexpired artifacts verified (candidate10299400624, evidence10299370734). Exact ZIP SHA2564a0f1871c67defb68cd2968bf9655927f0db76b23f1e33c67605e5a82df7d205;Git blob5e1ca533a29661f5b3bb267eaa66bc59a5dc95a7. This supersedes the pending candidate status above.

Confirmed production owner: src/app/homeDashboardYourTradesSizing.ts projects saved outcomes to currency-scoped relative presentation weights; existing P11 decimalKernel owns decimal operations, P11/P13/query own financial facts, existing packer owns geometry and existing motion/input owners retain drag. No other production ownership changed. The chart-gap ledger remains unfinished integration; P21 is active and P22 has not begun. New sizing UI is ready for deployment/user review, not yet claimed reviewed.


## Historical candle acquisition — candidate after FULL Gate405

Following the user's fresh “Continue” after the405build command, one existing P15/P16 integration gap is addressed: a bounded historical OHLC acquisition port. New MarketCandleHistoryPort.ts owns the neutral request/page/result contract. The Binance candle-history request, response, acquisition and browser-connector modules own exact request scope, decimal/time validation, one-request composition and native public fetch respectively. Existing marketDataObservationSemantics.ts exposes its unchanged receipt timestamp parser for reuse; P11 remains the decimal-operation owner. No chart/UI, selected-market, retry, live stream, cache/storage or journal responsibility moves into this port.

See KAIROS_BINANCE_SPOT_CANDLE_HISTORY_FOUNDATION.md for exact source paths, tests and boundaries. Actual provider connectivity is locally DNS-blocked and not claimed. This is a candidate pending its own full canonical gate and artifacts; UI VISIBLE:NO. After PASS, next responsibility is standalone historical-candle Analysis composition using existing P17 and explicit source/instrument/timeframe selection, with real browser evidence and honest provider availability. Live continuity and trade/tool/save overlays follow. P21 remains active.

## Historical candle acquisition — FULL canonical Gate406

The preceding foundation candidate is now GOLDEN: run34699361404/job103568267556/head 02a0efe039cad60119336f590d9f4f039c3e921e, all33actual stages successful; exact-run candidate10300111753 and evidence10299962095 nonexpired and verified. ZIP SHA25625673f82dca0dd8b529f3b2d5330af48c5aa7c3ed6c656f7a8201bef038d9c5d;Git blob4d0cd0a5e659a6f3e8af1250f39d8d0cc4272c78. The neutral history contract and Binance request/response/acquisition/native connector responsibilities above are confirmed. Existing P15 receipt parsing and P11 decimal-operation ownership remain unchanged. No UI or live-stream lifecycle is added.

The user's time-only trade snapshot inquiry was researched against verified Gate405 ownership during the406run. KAIROS_TIME_BASED_TRADE_SNAPSHOT_FEASIBILITY.md records the proposal and missing boundaries: estimated references must never become actual executions/P&L; P14 needs truthful actual-entry projection and P20 needs explicit snapshot/provenance contracts for durable replay. This is feasibility only and creates no production owner. Historical Analysis UI remains next; time-assisted preview can follow without depending on continuous live streaming.
## Historical Analysis workspace — candidate from FULL Gate406

Current P17 integration candidate: AnalysisHistoryWorkspace.tsx owns ephemeral explicit metadata-backed selection and one-request cancellation/deadline/stale-scope lifecycle. analysisHistoryPorts.ts composes existing P15/P16 exchangeInfo and historical candle ports. AnalysisCandleCanvas.tsx mounts the existing production renderer and P2/P3 chart theme. lightweightChartsV5ProductionRenderer.ts retains one vendor chart/series lifecycle, extended with theme/viewport presentation controls through the existing module adapter. analysisHistory.css consumes registered tokens. No second market-data/calculation/storage/drawing owner, saved truth changes or phase closure. See KAIROS_ANALYSIS_HISTORICAL_CANDLES_UI_AMENDMENT.md; candidate pending its own full gate and artifacts.

## Analysis Candle values mobile containment — FULL canonical Gate410

Gate410/run34710348520/job103597867967/head20bd695aad7fdd80f2c44e0df490773e97d29492 is FULL canonical PASS. All required stages and exact-run nonexpired candidate/evidence artifacts passed. `analysisHistory.css` retains page/grid min-content containment while the table remains an internally scrollable exact-value region. `test-analysis-history-browser.mjs` proves the controlled legacy 662px expansion against `visualViewport.width`, then proves 320/390px containment in all three themes without changing chart interactions or saved facts. Gate409 is failed regression-contract evidence only. P17/P15/P16 ownership is unchanged; P21 remains active.

## Journal actual-entry Trade Map candidate from FULL Gate410

P14 `tradeVisualizerFacts.ts` remains the sole projection owner and now exposes saved entry executions separately from planned levels and saved exits, preserving exact execution id, price, quantity and time with no arithmetic or inference. `tradeVisualizerDisplayModel.ts` adds explicit `executed-entry` semantics. `JournalTradeMap.tsx`, `JournalTradeMapGraphic.tsx` and `journalRoute.css` own only accessible presentation using existing theme/motion tokens and a distinct non-colour cross marker. P11/P12/P13 financial truth, P17 candle rendering, P18/P19/P20 systems, storage/schema/provider and Live Bubble ownership are unchanged. See `KAIROS_JOURNAL_ACTUAL_ENTRY_TRADE_MAP_AMENDMENT.md`. Candidate pending its own canonical gate; it does not claim candle overlays or P21 closure.

## Gate411 release and P16.19 live candle update projection candidate

Gate411/run34712539135/job103603792084/head8ddbe796f437ce3a2b9b0b937963017620783d04 is FULL canonical PASS with all32 stages, both exact-run artifacts and nested candidate identity verified. P14 actual-entry Trade Map ownership is now released; Gate410 is the immediate rollback.

The next candidate adds only `src/services/market-data/providers/binance/binanceSpotTradeCandleUpdateProjection.ts` under existing P16 provider ownership. It projects one validated exact-instrument trade observation against the latest caller-selected historical candle. Same-bucket updates and a single adjacent append preserve DecimalString facts; stale events are ignored and gaps require authoritative backfill. P15 subscription/reconnect, P17 presentation, P9–P14 journal/storage/calculation, Analysis route lifecycle and Live Bubble ownership are unchanged. See `KAIROS_LIVE_CANDLE_UPDATE_PROJECTION_FOUNDATION.md`. UI VISIBLE:NO; live Analysis is not yet claimed.

## Gate412 release and production incremental-candle renderer candidate

Gate412/run34715445353/job103611731702/head984a92642ec12a8b89e44a222e86ddffede76b56 is FULL canonical PASS with all33 stages, both exact-run artifacts and nested candidate identity verified. P16.19 same-bucket/adjacent-candle projection is released; Gate411 is the immediate rollback.

The next bounded item-4 amendment composes the already-released P17 incremental engine into `lightweightChartsV5ProductionRenderer.ts`. `projectedChartRenderer.ts` projects one caller-authoritative candle and refuses updates without an active candle series or after destroy. P15/P16 still own subscription, instrument/timeframe identity, update/backfill decisions and reconnect; the Analysis route still owns lifecycle. No UI, provider transport, persistence, journal, calculation, drawing or marker ownership changes. See `KAIROS_LIVE_CANDLE_PRODUCTION_RENDERER_BINDING.md`. UI VISIBLE:NO; live Analysis is not yet claimed.

## Gate413 release and Analysis live-candle coordination candidate

Gate413/run34718213202/job103619135962/headbc1473833d436e90fa9a4c6bd30a25dd76a82dce is FULL canonical PASS with all34 stages, both exact-run nonexpired artifacts and nested candidate identity independently verified. The production P17 incremental-candle renderer binding is released; Gate412 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleProjectionRendererCoordination.ts`. It is the application composition owner between the exact caller-selected Binance Spot instrument/timeframe, released P16.19 projection and released P17 incremental renderer. It retains only the latest projected candle, advances it only after the renderer accepts the update, ignores stale observations, rejects identity/source failures and emits a scoped backfill request for gaps without inventing bars. It does not subscribe, reconnect, fetch history, own route lifecycle, persist facts or change P14/P18/P19, journal, calculations or Live Bubble behavior. See `KAIROS_ANALYSIS_LIVE_CANDLE_PROJECTION_RENDERER_COORDINATION.md`. UI VISIBLE:NO; provider-connected live Analysis is not yet claimed.

## Gate414 release and Analysis browser subscription composition candidate

Gate414/run34721256424/job103627429881/head37546d6fae3e21313320617672f73775679c137a is FULL canonical PASS with every stage, both exact-run nonexpired artifacts and nested candidate identity independently verified. The Analysis projection/renderer coordination owner is released; Gate413 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleBrowserSubscriptionComposition.ts`. It composes released P16.17 reconnecting browser trade subscription with the Gate414 session for one caller-authoritative instrument/interval and initial candle. Exact receipt clock, scheduler, reconnect policy/sample, connection states, transport errors, session dispositions, gap backfill request and close lifecycle are forwarded without replacement or inference. Initial history, backfill execution, session replacement, route/hidden/offline lifecycle and visible status remain later owners. No persistence, journal/calculation, drawing/marker or Live Bubble behavior changes. See `KAIROS_ANALYSIS_LIVE_CANDLE_BROWSER_SUBSCRIPTION_COMPOSITION.md`. UI VISIBLE:NO; provider-connected route lifecycle is not yet claimed.

## Gate415 release and Analysis browser runtime-sources candidate

Gate415/run34723630274/job103633815666/head1e63f7d1ea334ee7c481e0deffec89e1153ca631 is FULL canonical PASS with all36 steps, both exact-run nonexpired artifacts and nested candidate identity independently verified. The browser subscription-to-session composition is released; Gate414 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleBrowserRuntimeSources.ts`. It adapts browser clock, timeout scheduling/cancellation and entropy reads to the existing receipt-time, P15 scheduler and reconnect-sample ports. No default reconnect policy, subscription, socket or route lifecycle is created; values are read only on demand. Gate415 retains composition, P15 retains policy/jitter and the Analysis caller retains history/backfill/selection/hidden/offline/status ownership. See `KAIROS_ANALYSIS_LIVE_CANDLE_BROWSER_RUNTIME_SOURCES.md`. UI VISIBLE:NO.

Gate417 is FULL canonical release. The next item-4 boundary is `src/app/binanceAnalysisLiveCandleProductionBrowserSession.ts`. It binds the released Gate417 runtime-source object to the released Gate415 subscription composition, while forwarding the caller's exact instrument, interval, initial candle, renderer, reconnect policy, callbacks and deterministic subscription seam. It introduces no policy defaults or route/history/backfill/visibility/status owner. See `KAIROS_ANALYSIS_LIVE_CANDLE_PRODUCTION_BROWSER_SESSION.md`. UI VISIBLE:NO; P21 remains active.

Gate418 is FULL canonical release. The next item-4 boundary is `src/app/binanceAnalysisSelectedLiveCandleSessionController.ts`. It is the sole selected-session replacement owner: a generation is invalidated before old subscription close, replacement starts through Gate418, and late connection/error/disposition/backfill callbacks are ignored. It does not own initial history, backfill execution, route/visibility/offline lifecycle or visible status. See `KAIROS_ANALYSIS_SELECTED_LIVE_CANDLE_SESSION_CONTROLLER.md`. UI VISIBLE:NO; P21 remains active.

## Gate419 release and Analysis history-to-live bootstrap candidate

Gate419/run34733823775/job103661486863/headf76056ff7edb0724e680f8f491f708606f581df9 is FULL canonical PASS with every stage, both exact-run nonexpired artifacts and nested candidate identity independently verified. The selected live-candle session replacement controller is released; Gate418 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisHistoryLiveCandleBootstrapCoordination.ts`. It owns only ordering between one caller-scoped P16 recent-history acquisition and Gate419: stop old live ownership, abort and suppress stale acquisition, validate the exact returned venue/symbol/interval/limit, refuse empty history, delegate authoritative snapshot rendering to the caller, and seed the replacement live session from the returned final candle. It does not own selection, limits, reconnect policy, renderer creation, visible state, gap-backfill execution, route/visibility/offline lifecycle, persistence, journal/calculation, drawing/marker or Live Bubble behavior. See `KAIROS_ANALYSIS_HISTORY_LIVE_CANDLE_BOOTSTRAP_COORDINATION.md`. UI VISIBLE:NO; P21 remains active.

## Gate420 release and Analysis gap-backfill recovery candidate

Gate420/run34739148740/job103675742542/heade8802c7153256a5457fde018992b77a71350fa76 is FULL canonical PASS with all40 functional/upload stages, both exact-run nonexpired artifacts and nested candidate identity independently verified. The history-to-selected-live bootstrap coordinator is released; Gate419 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleGapBackfillRecoveryCoordination.ts`. It composes the released gap request with Gate420's authoritative page replacement, coalesces duplicate demand while recovery is pending, rejects wrong venue/symbol/interval scope, suppresses old selection completion and removes the live claim after failed recovery. It introduces no provider request, retry policy, route/visibility/offline lifecycle, visible status, persistence, journal/calculation, drawing/marker or Live Bubble owner. See `KAIROS_ANALYSIS_LIVE_CANDLE_GAP_BACKFILL_RECOVERY_COORDINATION.md`. UI VISIBLE:NO; P21 remains active.

## Gate421 release and Analysis browser availability lifecycle candidate

Gate421/run34741551602/job103681990530/head23304be7de82c61091ee66a4b9342d8771face5b is FULL canonical PASS with every stage, both exact-run nonexpired artifacts and nested candidate identity independently verified. The gap-backfill recovery coordinator is released; Gate420 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle.ts`. It observes only browser visibility and online state around Gate421: unavailable state stops the released coordinator, visible-and-online resume reacquires authoritative history, stale activation is suppressed and close removes its listeners. It does not own provider transport, reconnect policy, route mounting, visible status, chart rendering, persistence, journal/calculation, drawing/marker or Live Bubble behavior. See `KAIROS_ANALYSIS_LIVE_CANDLE_BROWSER_AVAILABILITY_LIFECYCLE.md`. UI VISIBLE:NO; P21 remains active.

## Gate422 release and Analysis live-candle production lifecycle candidate

Gate422/run34744061435/job103688568620/head467d11d76c1f2c774c810176959f50a4d72fbffb is FULL canonical PASS with every stage, both exact-run nonexpired artifacts and nested candidate identity independently verified. The browser availability lifecycle is released; Gate421 is the immediate rollback.

The next item-4 boundary is `src/app/binanceAnalysisLiveCandleProductionLifecycle.ts`. It is the production composition root for the existing Analysis history port and released selected-session, bootstrap, gap-recovery and browser-availability owners. The route caller still supplies exact selection, history limit, reconnect policy, renderer, callbacks and visible copy and must close the returned lifecycle. It introduces no provider implementation/default, route mount, visible status, persistence, journal/calculation, drawing/marker or Live Bubble owner. See `KAIROS_ANALYSIS_LIVE_CANDLE_PRODUCTION_LIFECYCLE.md`. UI VISIBLE:NO; P21 remains active.
