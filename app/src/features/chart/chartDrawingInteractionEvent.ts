import type { ChartDrawingId } from './chartDrawingContract';
import type { ChartDrawingTool } from './chartDrawingInteractionContract';
import type { ChartTrendLineEditEndpoint } from './chartTrendLineEditConstruction';

/**
 * P18.22 provider-neutral drawing interaction event vocabulary.
 *
 * Events describe one interaction intent/evidence item at a time. They do not
 * decide whether a transition is valid and they do not mutate drawing truth.
 * P18.38 adds explicit select-drawing intent; P18.23 remains the sole transition
 * acceptance owner. P18.49 makes the edit endpoint explicit on start-editing
 * intent so accepted editing state can preserve the exact endpoint authority.
 */
export type ChartDrawingInteractionEvent =
  | { readonly type: 'select-tool'; readonly tool: ChartDrawingTool }
  | { readonly type: 'start-drawing' }
  | { readonly type: 'preview-drawing' }
  | { readonly type: 'commit-drawing'; readonly drawingId: ChartDrawingId }
  | { readonly type: 'select-drawing'; readonly drawingId: ChartDrawingId }
  | { readonly type: 'cancel-interaction' }
  | {
      readonly type: 'start-editing';
      readonly drawingId: ChartDrawingId;
      readonly endpoint: ChartTrendLineEditEndpoint;
    }
  | { readonly type: 'start-deleting'; readonly drawingId: ChartDrawingId }
  | { readonly type: 'reset-interaction' };

export function defineChartDrawingInteractionEvent(
  event: ChartDrawingInteractionEvent,
): ChartDrawingInteractionEvent {
  return event;
}
