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
