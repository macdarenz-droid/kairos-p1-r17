import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingInteractionPort,
  initiateChartTrendLineEditFromSelection,
  type ChartDrawingInteractionSession,
} from '../src/features/chart';

describe('P18.54 chart trend-line edit initiation coordination', () => {
  it('initiates editing only for the exact authoritative selected drawing identity and endpoint', () => {
    const onStateChange = vi.fn();
    const interaction = createChartDrawingInteractionPort().create(onStateChange);
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-54-selected' });

    expect(initiateChartTrendLineEditFromSelection(interaction, 'start')).toEqual({
      status: 'editing',
      drawingId: 'drawing-54-selected',
      endpoint: 'start',
    });
    expect(interaction.getState()).toEqual({
      status: 'editing',
      drawingId: 'drawing-54-selected',
      endpoint: 'start',
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'editing',
      drawingId: 'drawing-54-selected',
      endpoint: 'start',
    });
  });

  it('preserves either existing P18.48 edit endpoint without becoming its vocabulary owner', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-54-end' });

    expect(initiateChartTrendLineEditFromSelection(interaction, 'end')).toEqual({
      status: 'editing',
      drawingId: 'drawing-54-end',
      endpoint: 'end',
    });
  });

  it('does not initiate editing from idle or other non-selected authoritative states', () => {
    const idle = createChartDrawingInteractionPort().create(vi.fn());
    expect(initiateChartTrendLineEditFromSelection(idle, 'start')).toBeNull();
    expect(idle.getState()).toEqual({ status: 'idle' });

    const deleting = createChartDrawingInteractionPort().create(vi.fn());
    deleting.dispatch({ type: 'select-drawing', drawingId: 'drawing-54-deleting' });
    deleting.dispatch({ type: 'start-deleting', drawingId: 'drawing-54-deleting' });
    expect(initiateChartTrendLineEditFromSelection(deleting, 'end')).toBeNull();
    expect(deleting.getState()).toEqual({
      status: 'deleting',
      drawingId: 'drawing-54-deleting',
    });
  });

  it('never accepts caller-supplied drawing identity and forwards selected identity plus endpoint exactly once', () => {
    const getState = vi.fn(() => ({
      status: 'selected' as const,
      drawingId: 'drawing-54-authoritative',
    }));
    const dispatch = vi.fn(() => ({
      status: 'editing' as const,
      drawingId: 'drawing-54-authoritative',
      endpoint: 'end' as const,
    }));

    expect(initiateChartTrendLineEditFromSelection({ getState, dispatch }, 'end')).toEqual({
      status: 'editing',
      drawingId: 'drawing-54-authoritative',
      endpoint: 'end',
    });
    expect(getState).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'start-editing',
      drawingId: 'drawing-54-authoritative',
      endpoint: 'end',
    });
  });

  it('fails closed when the active interaction owner rejects or changes the delegated transition', () => {
    const interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'> = {
      getState: () => ({ status: 'selected', drawingId: 'drawing-54-rejected' }),
      dispatch: () => ({
        status: 'editing',
        drawingId: 'drawing-54-rejected',
        endpoint: 'start',
      }),
    };

    expect(initiateChartTrendLineEditFromSelection(interaction, 'end')).toBeNull();
  });
});
