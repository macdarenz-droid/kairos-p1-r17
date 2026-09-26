import {
  INITIAL_CHART_DRAWING_INTERACTION_STATE,
  type ChartDrawingInteractionState,
} from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionEvent } from './chartDrawingInteractionEvent';

/**
 * P18.23 provider-neutral drawing interaction reducer.
 *
 * This is the sole owner of interaction-state transition semantics. It is pure:
 * it does not mutate drawing truth, subscribe to provider events, persist state,
 * or perform presentation side effects. Unsupported state/event combinations
 * are explicit no-ops so later pointer/UI wiring cannot invent transitions.
 */
export function reduceChartDrawingInteraction(
  state: ChartDrawingInteractionState,
  event: ChartDrawingInteractionEvent,
): ChartDrawingInteractionState {
  switch (event.type) {
    case 'reset-interaction':
      return INITIAL_CHART_DRAWING_INTERACTION_STATE;

    case 'select-tool':
      return state.status === 'idle'
        ? { status: 'tool-selected', tool: event.tool }
        : state;

    case 'start-drawing':
      return state.status === 'tool-selected'
        ? { status: 'drawing', tool: state.tool }
        : state;

    case 'preview-drawing':
      return state.status === 'drawing'
        ? { status: 'preview', tool: state.tool }
        : state;

    case 'commit-drawing':
      return state.status === 'preview'
        ? { status: 'committed', drawingId: event.drawingId }
        : state;

    case 'select-drawing':
      if (state.status === 'idle') {
        return { status: 'selected', drawingId: event.drawingId };
      }
      if (state.status === 'selected') {
        return state.drawingId === event.drawingId
          ? state
          : { status: 'selected', drawingId: event.drawingId };
      }
      return state;

    case 'cancel-interaction':
      return state.status === 'tool-selected' ||
        state.status === 'drawing' ||
        state.status === 'preview' ||
        state.status === 'selected' ||
        state.status === 'editing' ||
        state.status === 'deleting'
        ? { status: 'cancelled' }
        : state;

    case 'start-editing':
      return state.status === 'selected' && state.drawingId === event.drawingId
        ? {
            status: 'editing',
            drawingId: event.drawingId,
            endpoint: event.endpoint,
          }
        : state;

    case 'start-deleting':
      return state.status === 'selected' && state.drawingId === event.drawingId
        ? { status: 'deleting', drawingId: event.drawingId }
        : state;
  }
}
