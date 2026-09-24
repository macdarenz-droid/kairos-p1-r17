import {
  commitChartTrendLineDraftToCollection,
  createChartDrawingCollectionPort,
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  createLightweightChartsV5TrendLineDrawingLayerPort,
  executeChartDrawingDeletionAndRefreshPresentation,
  initiateChartDrawingDeletionFromSelection,
  projectChartDrawings,
  projectLightweightChartsV5TrendLineSegments,
  refreshChartDrawingPresentationFromCollection,
  type ChartDrawing,
  type ChartDrawingCollectionSession,
  type ChartDrawingInteractionState,
  type ChartDrawingInteractionStateListener,
  type ChartDrawingLayerSession,
  type ChartTrendLineDraftInteractionSession,
  type LightweightChartsV5PriceCoordinateApi,
  type LightweightChartsV5TimeCoordinateApi,
  type LightweightChartsV5TrendLineStrokeStyle,
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
  cancel(): boolean;
  /** Deletes the currently selected drawing through the released deletion coordinators; null when nothing is selected. */
  deleteSelected(): ChartDrawing | null;
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
 * same released click lifecycle. No persistence, journal, market or P19 owner.
 */
const hasTimeToCoordinate = (timeScale: unknown): timeScale is LightweightChartsV5TimeCoordinateApi =>
  typeof timeScale === 'object' && timeScale !== null && typeof (timeScale as { timeToCoordinate?: unknown }).timeToCoordinate === 'function';
const hasPriceToCoordinate = (series: unknown): series is LightweightChartsV5PriceCoordinateApi =>
  typeof series === 'object' && series !== null && typeof (series as { priceToCoordinate?: unknown }).priceToCoordinate === 'function';

export function createAnalysisDrawingToolsRendererSession(
  options: AnalysisDrawingToolsRendererSessionOptions,
): AnalysisDrawingToolsRendererSession {
  const collection: ChartDrawingCollectionSession = createChartDrawingCollectionPort().create();
  let active: ActiveBinding | null = null;
  let destroyed = false;

  const notifyDrawings = (): void => { options.onDrawingsChange?.(collection.getDrawings()); };
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
        replaceDrawings(drawings) { layer.replaceDrawings(drawings); },
        // The live renderer owns the market series; a full replace only re-presents drawings on it.
        replace(_series, drawings) { layer.replaceDrawings(drawings); },
        destroy() { /* the layer session is released with the binding, never through presentation refresh */ },
      };
      const next: ActiveBinding = { handle, layer, refresh, interaction: null };
      active = next;
      let editing = false;
      const tolerancePx = options.endpointEditTolerancePx;
      next.interaction = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
        binding,
        handle,
        (state) => {
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
        () => projectChartDrawings(collection.getDrawings()),
        tolerancePx === undefined ? undefined : {
          // The released P18.5 projection of the committed drawings on the exact bound chart and series; nothing is cached across clicks.
          getCurrentSegments: () => {
            // The released driver contracts do not declare the vendor's time→coordinate and price→coordinate; without them there are no segments to grab (fail closed).
            const timeScale: unknown = binding.resolveChart(handle).timeScale();
            const series: unknown = binding.resolveSeries(handle);
            if (!hasTimeToCoordinate(timeScale) || !hasPriceToCoordinate(series)) return [];
            return projectLightweightChartsV5TrendLineSegments(projectChartDrawings(collection.getDrawings()), timeScale, series);
          },
          tolerancePx,
        },
        tolerancePx === undefined ? undefined : { collection, presentation: refresh },
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
      if (initiateChartDrawingDeletionFromSelection(current.interaction) === null) return null;
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
      collection.destroy();
    },
  };
}
