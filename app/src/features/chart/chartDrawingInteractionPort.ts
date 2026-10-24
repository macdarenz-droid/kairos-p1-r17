import {
  INITIAL_CHART_DRAWING_INTERACTION_STATE,
  type ChartDrawingInteractionState,
} from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionEvent } from './chartDrawingInteractionEvent';
import { reduceChartDrawingInteraction } from './chartDrawingInteractionReducer';

export type ChartDrawingInteractionStateListener = (
  state: ChartDrawingInteractionState,
) => void;

export interface ChartDrawingInteractionSession {
  getState(): ChartDrawingInteractionState;
  dispatch(event: ChartDrawingInteractionEvent): ChartDrawingInteractionState;
  destroy(): void;
}

export interface ChartDrawingInteractionPort {
  create(onStateChange: ChartDrawingInteractionStateListener): ChartDrawingInteractionSession;
}

/**
 * P18.24 provider-neutral drawing interaction session lifecycle.
 *
 * This boundary is the sole owner of the ephemeral current interaction state
 * for one active session. P18.23 remains the sole transition-semantics owner:
 * every event is delegated to reduceChartDrawingInteraction(). State listeners
 * are notified only when that reducer produces a different state object.
 *
 * This boundary owns no provider pointer/click APIs, coordinate conversion,
 * drawing mutation, persistence, toolbar state, journal truth, or P19 behavior.
 */
export function createChartDrawingInteractionPort(): ChartDrawingInteractionPort {
  return {
    create(onStateChange): ChartDrawingInteractionSession {
      let currentState: ChartDrawingInteractionState =
        INITIAL_CHART_DRAWING_INTERACTION_STATE;
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-drawing-interaction-destroyed');
      };

      return {
        getState(): ChartDrawingInteractionState {
          assertActive();
          return currentState;
        },
        dispatch(event): ChartDrawingInteractionState {
          assertActive();
          const nextState = reduceChartDrawingInteraction(currentState, event);
          if (nextState !== currentState) {
            currentState = nextState;
            onStateChange(currentState);
          }
          return currentState;
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
        },
      };
    },
  };
}
