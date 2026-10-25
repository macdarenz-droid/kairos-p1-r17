import { describe, expect, it } from 'vitest';
import {
  INITIAL_CHART_DRAWING_INTERACTION_STATE,
  reduceChartDrawingInteraction,
  type ChartDrawingInteractionState,
} from '../src/features/chart';

describe('P18.23 chart drawing interaction reducer', () => {
  it('owns the explicit trend-line creation transition sequence', () => {
    const selected = reduceChartDrawingInteraction(
      INITIAL_CHART_DRAWING_INTERACTION_STATE,
      { type: 'select-tool', tool: 'trend-line' },
    );
    const drawing = reduceChartDrawingInteraction(selected, { type: 'start-drawing' });
    const preview = reduceChartDrawingInteraction(drawing, { type: 'preview-drawing' });
    const committed = reduceChartDrawingInteraction(preview, {
      type: 'commit-drawing',
      drawingId: 'drawing-1',
    });

    expect(selected).toEqual({ status: 'tool-selected', tool: 'trend-line' });
    expect(drawing).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(preview).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(committed).toEqual({ status: 'committed', drawingId: 'drawing-1' });
  });

  it('requires the matching selected drawing before edit/delete can start', () => {
    const selectedForEdit = reduceChartDrawingInteraction(
      INITIAL_CHART_DRAWING_INTERACTION_STATE,
      { type: 'select-drawing', drawingId: 'drawing-2' },
    );
    expect(
      reduceChartDrawingInteraction(selectedForEdit, {
        type: 'start-editing',
        drawingId: 'drawing-2',
        endpoint: 'start',
      }),
    ).toEqual({ status: 'editing', drawingId: 'drawing-2', endpoint: 'start' });

    const selectedForDelete = reduceChartDrawingInteraction(
      INITIAL_CHART_DRAWING_INTERACTION_STATE,
      { type: 'select-drawing', drawingId: 'drawing-3' },
    );
    expect(
      reduceChartDrawingInteraction(selectedForDelete, {
        type: 'start-deleting',
        drawingId: 'drawing-3',
      }),
    ).toEqual({ status: 'deleting', drawingId: 'drawing-3' });
  });

  it('makes invalid state/event combinations no-ops rather than inventing transitions', () => {
    const drawing: ChartDrawingInteractionState = {
      status: 'drawing',
      tool: 'trend-line',
    };

    expect(
      reduceChartDrawingInteraction(drawing, {
        type: 'commit-drawing',
        drawingId: 'drawing-4',
      }),
    ).toBe(drawing);

    expect(
      reduceChartDrawingInteraction(drawing, {
        type: 'start-editing',
        drawingId: 'drawing-4',
        endpoint: 'end',
      }),
    ).toBe(drawing);
  });

  it('cancels active interactions and requires explicit reset after terminal states', () => {
    const active: ChartDrawingInteractionState = {
      status: 'preview',
      tool: 'trend-line',
    };
    const cancelled = reduceChartDrawingInteraction(active, { type: 'cancel-interaction' });

    expect(cancelled).toEqual({ status: 'cancelled' });
    expect(
      reduceChartDrawingInteraction(cancelled, { type: 'select-tool', tool: 'trend-line' }),
    ).toBe(cancelled);
    expect(reduceChartDrawingInteraction(cancelled, { type: 'reset-interaction' })).toEqual({
      status: 'idle',
    });
  });
});
