import { describe, expect, it, vi } from 'vitest';
import {
  coordinateChartTrendLineEditEndpointHit,
  createChartDrawingInteractionPort,
  type ChartDrawingInteractionSession,
} from '../src/features/chart';

describe('P18.56 chart trend-line edit endpoint-hit coordination', () => {
  it('initiates editing only when endpoint-hit identity matches authoritative selected identity', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-56-selected' });

    expect(coordinateChartTrendLineEditEndpointHit(interaction, {
      id: 'drawing-56-selected',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'end',
    })).toEqual({
      status: 'editing',
      drawingId: 'drawing-56-selected',
      endpoint: 'end',
    });
    expect(interaction.getState()).toEqual({
      status: 'editing',
      drawingId: 'drawing-56-selected',
      endpoint: 'end',
    });
  });

  it('does nothing when there is no P18.55 endpoint-hit evidence', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-56-null' });

    expect(coordinateChartTrendLineEditEndpointHit(interaction, null)).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-56-null',
    });
  });

  it('never applies an endpoint hit from a different drawing to the selected drawing', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-56-authoritative' });

    expect(coordinateChartTrendLineEditEndpointHit(interaction, {
      id: 'drawing-56-other',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'start',
    })).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-56-authoritative',
    });
  });

  it('does not initiate editing from non-selected authoritative interaction state', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());

    expect(coordinateChartTrendLineEditEndpointHit(interaction, {
      id: 'drawing-56-idle',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'start',
    })).toBeNull();
    expect(interaction.getState()).toEqual({ status: 'idle' });
  });

  it('fails closed if authoritative selection changes before P18.54 delegation revalidates it', () => {
    const getState = vi.fn()
      .mockReturnValueOnce({ status: 'selected' as const, drawingId: 'drawing-56-race' })
      .mockReturnValueOnce({ status: 'idle' as const });
    const dispatch = vi.fn();
    const interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'> = {
      getState,
      dispatch,
    };

    expect(coordinateChartTrendLineEditEndpointHit(interaction, {
      id: 'drawing-56-race',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'end',
    })).toBeNull();
    expect(getState).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
