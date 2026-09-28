import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  createChartDrawingCollectionPort,
  createChartDrawingInteractionPort,
  executeChartTrendLineEditAndRefreshPresentation,
  type ChartDrawing,
} from '../src/features/chart';
import type { ChartDrawingPresentationDrawingRefreshSession } from '../src/features/chart/chartDrawingPresentationPort';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const original: ChartDrawing = {
  id: 'drawing-51-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T11:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T11:01:00.000Z', price: decimal('101.75') },
};

const other: ChartDrawing = {
  id: 'drawing-51-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T11:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T11:03:00.000Z', price: decimal('103.75') },
};

function presentation(replaceDrawings = vi.fn()): ChartDrawingPresentationDrawingRefreshSession {
  return {
    replace: vi.fn(),
    replaceDrawings,
    destroy: vi.fn(),
  };
}

describe('P18.51 chart trend-line edit presentation coordination', () => {
  it('refreshes current committed drawing presentation exactly once after a successful edit', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    collection.addDrawing(other);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'end',
    });

    const replaceDrawings = vi.fn();
    const replacementAnchor = {
      timestamp: '2026-09-05T11:04:00.000Z' as const,
      price: decimal('105.25'),
    };

    const edited = executeChartTrendLineEditAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
      replacementAnchor,
    );

    expect(edited).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: original.start,
      end: replacementAnchor,
    });
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(collection.getDrawings()).toEqual([edited, other]);
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
    expect(replaceDrawings).toHaveBeenCalledWith([
      {
        id: original.id,
        kind: 'trend-line',
        start: { time: 1788606000, value: 100.25 },
        end: { time: 1788606240, value: 105.25 },
      },
      {
        id: other.id,
        kind: 'trend-line',
        start: { time: 1788606120, value: 102.25 },
        end: { time: 1788606180, value: 103.75 },
      },
    ]);
  });

  it('does not refresh presentation when authoritative interaction state does not execute an edit', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    const replaceDrawings = vi.fn();

    const result = executeChartTrendLineEditAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
      { timestamp: '2026-09-05T11:05:00.000Z', price: decimal('99.50') },
    );

    expect(result).toBeNull();
    expect(collection.getDrawing(original.id)).toEqual(original);
    expect(replaceDrawings).not.toHaveBeenCalled();
  });

  it('does not refresh presentation for a stale authoritative edit target', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'start',
    });
    collection.removeDrawing(original.id);

    const replaceDrawings = vi.fn();
    const result = executeChartTrendLineEditAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
      { timestamp: '2026-09-05T11:06:00.000Z', price: decimal('98.25') },
    );

    expect(result).toBeNull();
    expect(interaction.getState()).toEqual({
      status: 'editing',
      drawingId: original.id,
      endpoint: 'start',
    });
    expect(replaceDrawings).not.toHaveBeenCalled();
  });

  it('never rolls back committed edit truth when presentation refresh fails', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'start',
    });

    const replacementAnchor = {
      timestamp: '2026-09-05T11:07:00.000Z' as const,
      price: decimal('97.75'),
    };
    const replaceDrawings = vi.fn(() => {
      throw new Error('presentation-refresh-failed');
    });

    expect(() =>
      executeChartTrendLineEditAndRefreshPresentation(
        interaction,
        collection,
        presentation(replaceDrawings),
        replacementAnchor,
      ),
    ).toThrow('presentation-refresh-failed');

    expect(collection.getDrawing(original.id)).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: replacementAnchor,
      end: original.end,
    });
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
  });
});
