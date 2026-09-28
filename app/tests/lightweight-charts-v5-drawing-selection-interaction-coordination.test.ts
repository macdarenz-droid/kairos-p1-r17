import { describe, expect, it, vi } from 'vitest';
import {
  coordinateLightweightChartsV5DrawingSelectionInteraction,
  createChartDrawingInteractionPort,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-1',
    kind: 'trend-line',
    start: { time: 10, value: 20 },
    end: { time: 30, value: 40 },
  },
  {
    id: 'trend-2',
    kind: 'trend-line',
    start: { time: 40, value: 50 },
    end: { time: 60, value: 70 },
  },
];

const drawingHit = (drawingId: string) => ({
  hoveredInfo: {
    sourceKind: 'series-primitive' as const,
    objectKind: 'primitive' as const,
    objectId: drawingId,
  },
});

describe('P18.41 Lightweight Charts v5 drawing selection interaction coordination', () => {
  it('dispatches one current drawing selection into the authoritative P18.24 session', () => {
    const onStateChange = vi.fn();
    const interaction = createChartDrawingInteractionPort().create(onStateChange);

    const result = coordinateLightweightChartsV5DrawingSelectionInteraction(
      interaction,
      drawings,
      drawingHit('trend-2'),
    );

    expect(result).toEqual({ status: 'selected', drawingId: 'trend-2' });
    expect(interaction.getState()).toEqual({ status: 'selected', drawingId: 'trend-2' });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('keeps selection switching semantics owned by the existing reducer', () => {
    const interaction = createChartDrawingInteractionPort().create(() => undefined);

    coordinateLightweightChartsV5DrawingSelectionInteraction(
      interaction,
      drawings,
      drawingHit('trend-1'),
    );
    const result = coordinateLightweightChartsV5DrawingSelectionInteraction(
      interaction,
      drawings,
      drawingHit('trend-2'),
    );

    expect(result).toEqual({ status: 'selected', drawingId: 'trend-2' });
  });

  it('fails closed without dispatch for stale or unrelated provider evidence', () => {
    const dispatch = vi.fn();

    expect(
      coordinateLightweightChartsV5DrawingSelectionInteraction(
        { dispatch },
        drawings,
        drawingHit('stale-drawing'),
      ),
    ).toBeNull();
    expect(
      coordinateLightweightChartsV5DrawingSelectionInteraction(
        { dispatch },
        drawings,
        {
          hoveredInfo: {
            sourceKind: 'series',
            objectKind: 'series',
            objectId: 'trend-1',
          },
        },
      ),
    ).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not bypass P18.23 when valid selection evidence arrives in a non-selectable state', () => {
    const interaction = createChartDrawingInteractionPort().create(() => undefined);
    interaction.dispatch({ type: 'select-tool', tool: 'trend-line' });

    const result = coordinateLightweightChartsV5DrawingSelectionInteraction(
      interaction,
      drawings,
      drawingHit('trend-1'),
    );

    expect(result).toEqual({ status: 'tool-selected', tool: 'trend-line' });
    expect(interaction.getState()).toEqual({ status: 'tool-selected', tool: 'trend-line' });
  });
});
