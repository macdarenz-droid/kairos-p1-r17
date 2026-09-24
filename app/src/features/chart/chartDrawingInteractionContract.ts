import type { ChartDrawingId, ChartDrawingKind } from './chartDrawingContract';
import type { ChartTrendLineEditEndpoint } from './chartTrendLineEditConstruction';

/**
 * P18.21 provider-neutral drawing interaction-state vocabulary.
 *
 * This contract intentionally models interaction state as one discriminated
 * union instead of independent flags that can contradict each other.
 * P18.38 extends the vocabulary with one explicit selected-drawing state so
 * edit/delete intent can be gated by authoritative interaction state rather than
 * arbitrary caller-supplied drawing identity. P18.23 still owns transitions;
 * this file owns state shape only. P18.49 extends the existing editing-state
 * shape with one authoritative P18.48 trend-line endpoint so later mutation
 * coordination cannot accept an arbitrary execution-time endpoint.
 */
export type ChartDrawingInteractionStatus =
  | 'idle'
  | 'tool-selected'
  | 'drawing'
  | 'preview'
  | 'committed'
  | 'selected'
  | 'cancelled'
  | 'editing'
  | 'deleting';

export type ChartDrawingInteractionState =
  | { readonly status: 'idle' }
  | { readonly status: 'tool-selected'; readonly tool: ChartDrawingKind }
  | { readonly status: 'drawing'; readonly tool: ChartDrawingKind }
  | { readonly status: 'preview'; readonly tool: ChartDrawingKind }
  | { readonly status: 'committed'; readonly drawingId: ChartDrawingId }
  | { readonly status: 'selected'; readonly drawingId: ChartDrawingId }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'editing';
      readonly drawingId: ChartDrawingId;
      readonly endpoint: ChartTrendLineEditEndpoint;
    }
  | { readonly status: 'deleting'; readonly drawingId: ChartDrawingId };

export const INITIAL_CHART_DRAWING_INTERACTION_STATE: ChartDrawingInteractionState = {
  status: 'idle',
};

export function defineChartDrawingInteractionState(
  state: ChartDrawingInteractionState,
): ChartDrawingInteractionState {
  return state;
}
