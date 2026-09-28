import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingInteractionPort,
  reduceChartDrawingInteraction,
  type ChartDrawingInteractionState,
} from '../src/features/chart';

describe('P18.38 chart drawing selection interaction semantics', () => {
  it('selects one drawing from idle and switches selection explicitly', () => {
    const first = reduceChartDrawingInteraction(
      { status: 'idle' },
      { type: 'select-drawing', drawingId: 'drawing-1' },
    );
    const same = reduceChartDrawingInteraction(first, {
      type: 'select-drawing',
      drawingId: 'drawing-1',
    });
    const second = reduceChartDrawingInteraction(first, {
      type: 'select-drawing',
      drawingId: 'drawing-2',
    });

    expect(first).toEqual({ status: 'selected', drawingId: 'drawing-1' });
    expect(same).toBe(first);
    expect(second).toEqual({ status: 'selected', drawingId: 'drawing-2' });
  });

  it('fails closed when edit/delete identity does not match the selected drawing', () => {
    const selected: ChartDrawingInteractionState = {
      status: 'selected',
      drawingId: 'drawing-1',
    };

    expect(
      reduceChartDrawingInteraction(selected, {
        type: 'start-editing',
        drawingId: 'drawing-2',
        endpoint: 'start',
      }),
    ).toBe(selected);
    expect(
      reduceChartDrawingInteraction(selected, {
        type: 'start-deleting',
        drawingId: 'drawing-2',
      }),
    ).toBe(selected);
  });

  it('lets the existing interaction session own selected state without a second state store', () => {
    const onStateChange = vi.fn();
    const session = createChartDrawingInteractionPort().create(onStateChange);

    expect(session.dispatch({ type: 'select-drawing', drawingId: 'drawing-1' })).toEqual({
      status: 'selected',
      drawingId: 'drawing-1',
    });
    expect(
      session.dispatch({
        type: 'start-editing',
        drawingId: 'drawing-1',
        endpoint: 'end',
      }),
    ).toEqual({
      status: 'editing',
      drawingId: 'drawing-1',
      endpoint: 'end',
    });
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });

  it('cancels selection through the existing reducer lifecycle', () => {
    expect(
      reduceChartDrawingInteraction(
        { status: 'selected', drawingId: 'drawing-1' },
        { type: 'cancel-interaction' },
      ),
    ).toEqual({ status: 'cancelled' });
  });
});
