import { describe, expect, it, vi } from 'vitest';
import {
  coordinateLightweightChartsV5TrendLineEditEndpointClick,
  createChartDrawingInteractionPort,
  type LightweightChartsV5TrendLineScreenSegment,
} from '../src/features/chart';

const segments: readonly LightweightChartsV5TrendLineScreenSegment[] = [
  {
    id: 'drawing-57-selected',
    kind: 'trend-line',
    start: { x: 10, y: 20 },
    end: { x: 50, y: 60 },
  },
  {
    id: 'drawing-57-other',
    kind: 'trend-line',
    start: { x: 70, y: 80 },
    end: { x: 110, y: 120 },
  },
];

describe('P18.57 Lightweight Charts v5 trend-line edit endpoint-click coordination', () => {
  it('routes a provider click on the selected drawing endpoint through P18.55 and P18.56', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-57-selected' });

    expect(coordinateLightweightChartsV5TrendLineEditEndpointClick(
      interaction,
      segments,
      { point: { x: 49, y: 59 } },
      2,
    )).toEqual({
      status: 'editing',
      drawingId: 'drawing-57-selected',
      endpoint: 'end',
    });
    expect(interaction.getState()).toEqual({
      status: 'editing',
      drawingId: 'drawing-57-selected',
      endpoint: 'end',
    });
  });

  it('does nothing when the provider click has no point evidence', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-57-selected' });

    expect(coordinateLightweightChartsV5TrendLineEditEndpointClick(
      interaction,
      segments,
      {},
      4,
    )).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-57-selected',
    });
  });

  it('does not convert a line-body click into endpoint edit intent', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-57-selected' });

    expect(coordinateLightweightChartsV5TrendLineEditEndpointClick(
      interaction,
      segments,
      { point: { x: 30, y: 40 } },
      4,
    )).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-57-selected',
    });
  });

  it('never applies an endpoint click from a different drawing to the selected drawing', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-57-selected' });

    expect(coordinateLightweightChartsV5TrendLineEditEndpointClick(
      interaction,
      segments,
      { point: { x: 70, y: 80 } },
      1,
    )).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-57-selected',
    });
  });

  it('preserves P18.55 invalid-input ownership for present provider point evidence', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-57-selected' });

    expect(() => coordinateLightweightChartsV5TrendLineEditEndpointClick(
      interaction,
      segments,
      { point: { x: 10, y: 20 } },
      -1,
    )).toThrow('chart-drawing-hit-test-invalid-input');
    expect(interaction.getState()).toEqual({
      status: 'selected',
      drawingId: 'drawing-57-selected',
    });
  });
});
