import {
  checkUserRiskBoxStop,
  constructUserRiskBox,
  moveUserRiskBoxHandle,
  projectPlannedRewardToRisk,
  type UserRiskBoxPoint,
} from '../../application/risk-reward';
import type { SavedRiskRewardAnalysis } from '../../domain/saved-records/savedAnalysisContract';
import {
  commitChartTrendLineDraftToCollection,
  createChartDrawingCollectionPort,
  createChartDrawingId,
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  createLightweightChartsV5TrendLineDrawingLayerPort,
  executeChartDrawingDeletionAndRefreshPresentation,
  initiateChartDrawingDeletionFromSelection,
  projectChartDrawings,
  projectChartRiskBoxDrawing,
  projectLightweightChartsV5TrendLineSegments,
  refreshChartDrawingPresentationFromCollection,
  type ChartDrawing,
  type ChartDrawingCollectionSession,
  type ChartDrawingInteractionState,
  type ChartDrawingInteractionStatus,
  type ChartDrawingInteractionStateListener,
  type ChartDrawingLayerSession,
  type ChartTrendLineDraftInteractionSession,
  type LightweightChartsV5PriceCoordinateApi,
  type LightweightChartsV5TimeCoordinateApi,
  type LightweightChartsV5TrendLineStrokeStyle,
  type RendererChartDrawing,
  type RendererRiskBoxDrawing,
} from '../chart';
import type { ChartEngineSeriesHandle } from '../chart/chartEngineDriver';
import type { ChartDrawingPresentationDrawingRefreshSession } from '../chart/chartDrawingPresentationPort';
import type { LightweightChartsV5DriverBinding } from '../chart/lightweightChartsV5ModuleAdapter';
import type { LightweightChartsV5ProductionDrawingBindingLifecycle } from '../chart/lightweightChartsV5ProductionRenderer';

export interface AnalysisDrawingToolsRendererSessionOptions {
  /** Caller-resolved stroke style from the active chart theme; this session owns no theme lookup. */
  readonly style: LightweightChartsV5TrendLineStrokeStyle;
  readonly onStateChange?: ChartDrawingInteractionStateListener;
  readonly onDrawingsChange?: (drawings: readonly ChartDrawing[]) => void;
  readonly onRiskBoxesChange?: (boxes: readonly SavedRiskRewardAnalysis[]) => void;
  /** When set, a click within this many CSS pixels of a selected line's endpoint enters the released P18.58 edit and the next chart click moves that endpoint through P18.59. */
  readonly endpointEditTolerancePx?: number;
}

export type AnalysisDrawingToolsPresentation =
  | { readonly kind: 'pending-series' }
  | { readonly kind: 'bound'; readonly drawingCount: number };

export interface AnalysisDrawingToolsRendererSession {
  /** Hand this to `createLightweightChartsV5ProductionRendererFactory(seriesLifecycle, lifecycle)`. */
  readonly lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle;
  presentation(): AnalysisDrawingToolsPresentation;
  getState(): ChartDrawingInteractionState | null;
  getDrawings(): readonly ChartDrawing[];
  /** Enters trend-line drawing from idle (resetting a finished interaction first); false while no series is bound. */
  selectTrendLineTool(): boolean;
  selectZoneTool(): boolean;
  /** Enters the three-tap risk box tool: entry, stop, then target. */
  selectRiskBoxTool(): boolean;
  cancel(): boolean;
  /** Deletes the currently selected drawing or risk box. Returns the deleted drawing; null when nothing is selected or the deleted item was a risk box (reported through `onRiskBoxesChange`). */
  deleteSelected(): ChartDrawing | null;
  /** The user's risk boxes, in the order they were placed. */
  getRiskBoxes(): readonly SavedRiskRewardAnalysis[];
  /** Replaces every risk box, resets any interaction and re-presents. */
  loadRiskBoxes(boxes: readonly SavedRiskRewardAnalysis[]): readonly SavedRiskRewardAnalysis[];
  /** Replaces every committed drawing with the given ones (stable ids kept) through the released P18.33 collection, resets any interaction and re-presents; the caller owns where the drawings came from. */
  loadDrawings(drawings: readonly ChartDrawing[]): readonly ChartDrawing[];
  destroy(): void;
}

interface ActiveBinding {
  readonly handle: ChartEngineSeriesHandle;
  readonly layer: ChartDrawingLayerSession;
  readonly refresh: ChartDrawingPresentationDrawingRefreshSession;
  interaction: ChartTrendLineDraftInteractionSession | null;
}

/**
 * Unmounted Analysis drawing-tools composition around the released P18 owners
 * and the Gate474 production drawing-binding seam. The committed drawing
 * collection lives for the whole session, so a rebuilt chart (theme change,
 * refresh, selection replacement of the vendor series) re-presents the same
 * committed drawings on the new series. Every transition, commit, projection,
 * primitive and deletion is the released P18 owner's; the second trend-line
 * anchor commits through P18.35 and refreshes through P18.46/P18.47 inside the
 * same released click lifecycle. User risk boxes are kept beside the collection
 * and built only through the P19 user risk box owner. No persistence, journal or market owner.
 */
const ratioFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * "Long" or "Short", then " · Reward is {ratio}× the risk" when the planned
 * reward-to-risk owner can read the levels. The ratio is rounded for display
 * only; it is not money.
 */
export function riskBoxLabel(box: SavedRiskRewardAnalysis): string {
  const { side, levels } = box.analysis;
  // The ratio is a display-only unitless number here, never money, so it may leave the decimal kernel for Intl.
  const sideWord = side === 'long' ? 'Long' : 'Short';
  const ratio = projectPlannedRewardToRisk(side, levels.entry, levels.stop, levels.target);
  return ratio.ok ? `${sideWord} · Reward is ${ratioFormat.format(Number(ratio.value.ratio))}× the risk` : sideWord;
}

const projectRiskBox = (box: SavedRiskRewardAnalysis): RendererRiskBoxDrawing | null => projectChartRiskBoxDrawing({
  id: box.analysis.id,
  entry: box.analysis.levels.entry,
  stop: box.analysis.levels.stop,
  target: box.analysis.levels.target,
  start: box.extent.start,
  end: box.extent.end,
  label: riskBoxLabel(box),
});

const isRiskBoxDraftState = (state: ChartDrawingInteractionState): boolean =>
  (state.status === 'tool-selected' || state.status === 'drawing' || state.status === 'preview') && state.tool === 'risk-box';

const hasTimeToCoordinate = (timeScale: unknown): timeScale is LightweightChartsV5TimeCoordinateApi =>
  typeof timeScale === 'object' && timeScale !== null && typeof (timeScale as { timeToCoordinate?: unknown }).timeToCoordinate === 'function';
const hasPriceToCoordinate = (series: unknown): series is LightweightChartsV5PriceCoordinateApi =>
  typeof series === 'object' && series !== null && typeof (series as { priceToCoordinate?: unknown }).priceToCoordinate === 'function';

export function createAnalysisDrawingToolsRendererSession(
  options: AnalysisDrawingToolsRendererSessionOptions,
): AnalysisDrawingToolsRendererSession {
  const collection: ChartDrawingCollectionSession = createChartDrawingCollectionPort().create();
  // User risk boxes live beside the P18 collection: they are P19 truth, never saved ChartDrawings.
  const boxes = new Map<string, SavedRiskRewardAnalysis>();
  let boxDraft: { entry?: UserRiskBoxPoint; stop?: UserRiskBoxPoint } = {};
  let active: ActiveBinding | null = null;
  let destroyed = false;

  const notifyDrawings = (): void => { options.onDrawingsChange?.(collection.getDrawings()); };
  const getRiskBoxes = (): readonly SavedRiskRewardAnalysis[] => Object.freeze([...boxes.values()]);
  const notifyRiskBoxes = (): void => { options.onRiskBoxesChange?.(getRiskBoxes()); };
  const riskBoxDrawings = (): RendererChartDrawing[] =>
    [...boxes.values()].map(projectRiskBox).filter((drawing): drawing is RendererRiskBoxDrawing => drawing !== null);
  // Drawings first, then boxes: the one list for presentation, tap selection and hover selection.
  const currentRendererDrawings = (): readonly RendererChartDrawing[] => [...projectChartDrawings(collection.getDrawings()), ...riskBoxDrawings()];
  const present = (binding: ActiveBinding): void => {
    refreshChartDrawingPresentationFromCollection(binding.refresh, collection);
  };

  const release = (): void => {
    const current = active;
    if (current === null) return;
    active = null;
    current.interaction?.destroy();
    current.layer.destroy();
  };

  const lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle = {
    attach(binding: LightweightChartsV5DriverBinding, handle: ChartEngineSeriesHandle): void {
      if (destroyed) throw new Error('analysis-drawing-tools-session-destroyed');
      release();
      const layer = createLightweightChartsV5TrendLineDrawingLayerPort(binding, options.style).attach(handle);
      const refresh: ChartDrawingPresentationDrawingRefreshSession = {
        // The P18 coordinators pass the collection's drawings; the boxes are appended so every refresh keeps them.
        replaceDrawings(drawings) { layer.replaceDrawings([...drawings, ...riskBoxDrawings()]); },
        // The live renderer owns the market series; a full replace only re-presents drawings on it.
        replace(_series, drawings) { layer.replaceDrawings([...drawings, ...riskBoxDrawings()]); },
        destroy() { /* the layer session is released with the binding, never through presentation refresh */ },
      };
      const next: ActiveBinding = { handle, layer, refresh, interaction: null };
      active = next;
      let editing = false;
      const tolerancePx = options.endpointEditTolerancePx;
      // The risk box tool's three taps: entry, stop, then target. Every other anchor goes to the P18 path.
      const interceptAnchor = (anchor: UserRiskBoxPoint, preClickStatus: ChartDrawingInteractionStatus): boolean => {
        const interaction = next.interaction;
        if (interaction === null || active !== next) return false;
        const state = interaction.getState();
        // Moving a box handle: the P18 edit path only knows the drawing collection, so the box move is taken here.
        if (preClickStatus === 'editing' && state.status === 'editing') {
          const box = boxes.get(state.drawingId);
          if (box === undefined) return false;
          const moved = moveUserRiskBoxHandle(box, state.endpoint, anchor);
          if (!moved.ok) return true;
          boxes.set(box.analysis.id, moved.box);
          interaction.dispatch({ type: 'reset-interaction' });
          present(next);
          notifyRiskBoxes();
          return true;
        }
        if (!isRiskBoxDraftState(state)) return false;
        if (state.status === 'tool-selected') {
          boxDraft = { entry: anchor };
          interaction.dispatch({ type: 'start-drawing' });
          return true;
        }
        const entry = boxDraft.entry;
        if (entry === undefined) return true;
        if (state.status === 'drawing') {
          if (checkUserRiskBoxStop(entry, anchor).ok) {
            boxDraft = { entry, stop: anchor };
            interaction.dispatch({ type: 'preview-drawing' });
          }
          return true;
        }
        const stop = boxDraft.stop;
        if (stop === undefined) return true;
        const built = constructUserRiskBox(createChartDrawingId(), entry, stop, anchor);
        if (!built.ok) return true;
        boxes.set(built.box.analysis.id, built.box);
        interaction.dispatch({ type: 'commit-drawing', drawingId: built.box.analysis.id });
        present(next);
        notifyRiskBoxes();
        return true;
      };
      next.interaction = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
        binding,
        handle,
        (state) => {
          if (!isRiskBoxDraftState(state)) boxDraft = {};
          options.onStateChange?.(state);
          if (state.status === 'editing') editing = true;
          else if (editing && state.status === 'idle') {
            // The released P18.59 execution replaced the drawing (or the edit was cancelled) and reset the interaction; re-read the collection.
            editing = false;
            notifyDrawings();
          }
          if (state.status !== 'preview' || active !== next || next.interaction === null) return;
          const committed = commitChartTrendLineDraftToCollection(next.interaction, collection);
          if (committed === null) return;
          present(next);
          notifyDrawings();
        },
        currentRendererDrawings,
        tolerancePx === undefined ? undefined : {
          // The released P18.5 projection of the committed drawings on the exact bound chart and series; nothing is cached across clicks.
          getCurrentSegments: () => {
            // The released driver contracts do not declare the vendor's time→coordinate and price→coordinate; without them there are no segments to grab (fail closed).
            const timeScale: unknown = binding.resolveChart(handle).timeScale();
            const series: unknown = binding.resolveSeries(handle);
            if (!hasTimeToCoordinate(timeScale) || !hasPriceToCoordinate(series)) return [];
            return projectLightweightChartsV5TrendLineSegments(currentRendererDrawings(), timeScale, series);
          },
          tolerancePx,
        },
        tolerancePx === undefined ? undefined : { collection, presentation: refresh },
        interceptAnchor,
      );
      present(next);
    },
    detach(handle: ChartEngineSeriesHandle): void {
      if (active === null || active.handle !== handle) return;
      release();
    },
  };

  return {
    lifecycle,
    presentation() {
      return active === null
        ? Object.freeze({ kind: 'pending-series' as const })
        : Object.freeze({ kind: 'bound' as const, drawingCount: collection.getDrawings().length });
    },
    getState() { return active?.interaction?.getState() ?? null; },
    getDrawings() { return collection.getDrawings(); },
    selectTrendLineTool() {
      const interaction = active?.interaction;
      if (!interaction) return false;
      if (interaction.getState().status !== 'idle') interaction.dispatch({ type: 'reset-interaction' });
      return interaction.dispatch({ type: 'select-tool', tool: 'trend-line' }).status === 'tool-selected';
    },
    selectZoneTool() {
      const interaction = active?.interaction;
      if (!interaction) return false;
      if (interaction.getState().status !== 'idle') interaction.dispatch({ type: 'reset-interaction' });
      return interaction.dispatch({ type: 'select-tool', tool: 'zone' }).status === 'tool-selected';
    },
    selectRiskBoxTool() {
      const interaction = active?.interaction;
      if (!interaction) return false;
      if (interaction.getState().status !== 'idle') interaction.dispatch({ type: 'reset-interaction' });
      boxDraft = {};
      return interaction.dispatch({ type: 'select-tool', tool: 'risk-box' }).status === 'tool-selected';
    },
    cancel() {
      const interaction = active?.interaction;
      if (!interaction) return false;
      const cancelled = interaction.dispatch({ type: 'cancel-interaction' }).status === 'cancelled';
      interaction.dispatch({ type: 'reset-interaction' });
      return cancelled;
    },
    deleteSelected() {
      const current = active;
      if (current === null || current.interaction === null) return null;
      const deleting = initiateChartDrawingDeletionFromSelection(current.interaction);
      if (deleting === null || deleting.status !== 'deleting') return null;
      const box = boxes.get(deleting.drawingId);
      if (box !== undefined) {
        boxes.delete(deleting.drawingId);
        current.interaction.dispatch({ type: 'reset-interaction' });
        present(current);
        notifyRiskBoxes();
        return null;
      }
      const deleted = executeChartDrawingDeletionAndRefreshPresentation(current.interaction, collection, current.refresh);
      if (deleted !== null) notifyDrawings();
      return deleted;
    },
    loadDrawings(drawings) {
      const interaction = active?.interaction;
      if (interaction) {
        interaction.dispatch({ type: 'cancel-interaction' });
        interaction.dispatch({ type: 'reset-interaction' });
      }
      for (const existing of collection.getDrawings()) collection.removeDrawing(existing.id);
      for (const drawing of drawings) collection.addDrawing(drawing);
      if (active !== null) present(active);
      notifyDrawings();
      return collection.getDrawings();
    },
    getRiskBoxes,
    loadRiskBoxes(next) {
      const interaction = active?.interaction;
      if (interaction) {
        interaction.dispatch({ type: 'cancel-interaction' });
        interaction.dispatch({ type: 'reset-interaction' });
      }
      boxes.clear();
      for (const box of next) boxes.set(box.analysis.id, box);
      if (active !== null) present(active);
      notifyRiskBoxes();
      return getRiskBoxes();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
      collection.destroy();
    },
  };
}
