import type { ChartDrawingAnchor } from './chartDrawingContract';
import type {
  ChartDrawingInteractionState,
} from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionEvent } from './chartDrawingInteractionEvent';
import {
  createChartDrawingInteractionPort,
  type ChartDrawingInteractionStateListener,
} from './chartDrawingInteractionPort';
import {
  createChartTrendLineDraftAnchorCollectionPort,
  type ChartTrendLineDraftAnchors,
} from './chartTrendLineDraftAnchorCollection';

export interface ChartTrendLineDraftInteractionSession {
  getState(): ChartDrawingInteractionState;
  getAnchors(): ChartTrendLineDraftAnchors;
  dispatch(event: ChartDrawingInteractionEvent): ChartDrawingInteractionState;
  acceptAnchor(anchor: ChartDrawingAnchor | null): ChartDrawingInteractionState;
  destroy(): void;
}

export interface ChartTrendLineDraftInteractionPort {
  create(onStateChange: ChartDrawingInteractionStateListener): ChartTrendLineDraftInteractionSession;
}

/**
 * P18.29 provider-neutral trend-line draft interaction coordination.
 *
 * This boundary owns no interaction state and no draft-anchor storage. P18.24
 * remains the active interaction-session owner and P18.28R1 remains the
 * ephemeral 0/1/2 anchor-evidence owner. This composition only coordinates the
 * two existing owners:
 * - first valid trend-line anchor: tool-selected -> drawing
 * - second valid trend-line anchor: drawing -> preview
 * - successful commit/cancel/reset: clear only the ephemeral draft anchors
 *
 * Every interaction transition is delegated through the authoritative P18.24
 * session, which delegates transition semantics to P18.23. Provider null-anchor
 * evidence fails closed. No provider APIs, committed drawing construction,
 * drawing ID allocation, persistence, toolbar/UI state, drag/edit/delete
 * execution, journal truth, or P19 Risk/Reward behavior live here.
 */
export function createChartTrendLineDraftInteractionPort(): ChartTrendLineDraftInteractionPort {
  return {
    create(onStateChange): ChartTrendLineDraftInteractionSession {
      const interaction = createChartDrawingInteractionPort().create(onStateChange);
      const draft = createChartTrendLineDraftAnchorCollectionPort().create();
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-trend-line-draft-interaction-destroyed');
      };

      const clearDraftAfterLifecycleTransition = (
        previous: ChartDrawingInteractionState,
        next: ChartDrawingInteractionState,
        event: ChartDrawingInteractionEvent,
      ): void => {
        if (next === previous) return;
        if (
          event.type === 'reset-interaction' ||
          (event.type === 'cancel-interaction' && next.status === 'cancelled') ||
          (event.type === 'commit-drawing' && next.status === 'committed') ||
          (event.type === 'select-tool' && next.status === 'tool-selected')
        ) {
          draft.clear();
        }
      };

      return {
        getState(): ChartDrawingInteractionState {
          assertActive();
          return interaction.getState();
        },
        getAnchors(): ChartTrendLineDraftAnchors {
          assertActive();
          return draft.getAnchors();
        },
        dispatch(event): ChartDrawingInteractionState {
          assertActive();
          const previous = interaction.getState();
          const next = interaction.dispatch(event);
          clearDraftAfterLifecycleTransition(previous, next, event);
          return next;
        },
        acceptAnchor(anchor): ChartDrawingInteractionState {
          assertActive();
          if (anchor === null) return interaction.getState();

          const state = interaction.getState();
          const anchors = draft.getAnchors();

          if (
            state.status === 'tool-selected' &&
            (state.tool === 'trend-line' || state.tool === 'zone') &&
            anchors.length === 0
          ) {
            draft.appendAnchor(anchor);
            return interaction.dispatch({ type: 'start-drawing' });
          }

          if (
            state.status === 'drawing' &&
            (state.tool === 'trend-line' || state.tool === 'zone') &&
            anchors.length === 1
          ) {
            draft.appendAnchor(anchor);
            return interaction.dispatch({ type: 'preview-drawing' });
          }

          return state;
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          draft.destroy();
          interaction.destroy();
        },
      };
    },
  };
}
