import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  createChartDrawingCollectionPort,
  createChartDrawingInteractionPort,
  executeChartDrawingDeletionAndRefreshPresentation,
  type ChartDrawing,
} from '../src/features/chart';
import type { ChartDrawingPresentationDrawingRefreshSession } from '../src/features/chart/chartDrawingPresentationPort';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawing = {
  id: 'drawing-52-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T12:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T12:01:00.000Z', price: decimal('101.75') },
};

const second: ChartDrawing = {
  id: 'drawing-52-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T12:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T12:03:00.000Z', price: decimal('103.75') },
};

function presentation(replaceDrawings = vi.fn()): ChartDrawingPresentationDrawingRefreshSession {
  return {
    replace: vi.fn(),
    replaceDrawings,
    destroy: vi.fn(),
  };
}

describe('P18.52 chart drawing deletion presentation coordination', () => {
  it('refreshes current committed drawing presentation exactly once after a successful deletion', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: first.id });

    const replaceDrawings = vi.fn();
    const deleted = executeChartDrawingDeletionAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
    );

    expect(deleted).toBe(first);
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(collection.getDrawings()).toEqual([second]);
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
    expect(replaceDrawings).toHaveBeenCalledWith([
      {
        id: second.id,
        kind: 'trend-line',
        start: { time: 1788609720, value: 102.25 },
        end: { time: 1788609780, value: 103.75 },
      },
    ]);
  });

  it('does not refresh presentation when authoritative interaction state does not execute a deletion', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });

    const replaceDrawings = vi.fn();
    const result = executeChartDrawingDeletionAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
    );

    expect(result).toBeNull();
    expect(collection.getDrawings()).toEqual([first]);
    expect(interaction.getState()).toEqual({ status: 'selected', drawingId: first.id });
    expect(replaceDrawings).not.toHaveBeenCalled();
  });

  it('does not refresh presentation for a stale authoritative deletion target', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: first.id });

    const replaceDrawings = vi.fn();
    const result = executeChartDrawingDeletionAndRefreshPresentation(
      interaction,
      collection,
      presentation(replaceDrawings),
    );

    expect(result).toBeNull();
    expect(collection.getDrawings()).toEqual([second]);
    expect(interaction.getState()).toEqual({ status: 'deleting', drawingId: first.id });
    expect(replaceDrawings).not.toHaveBeenCalled();
  });

  it('never rolls back committed deletion truth when presentation refresh fails', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: first.id });

    const replaceDrawings = vi.fn(() => {
      throw new Error('presentation-refresh-failed');
    });

    expect(() =>
      executeChartDrawingDeletionAndRefreshPresentation(
        interaction,
        collection,
        presentation(replaceDrawings),
      ),
    ).toThrow('presentation-refresh-failed');

    expect(collection.getDrawings()).toEqual([second]);
    expect(collection.getDrawing(first.id)).toBeNull();
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
  });
});
