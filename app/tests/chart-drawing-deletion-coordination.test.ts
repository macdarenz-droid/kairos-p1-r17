import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  createChartDrawingCollectionPort,
  createChartDrawingInteractionPort,
  executeChartDrawingDeletion,
  type ChartDrawing,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawing = {
  id: 'drawing-45-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T08:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T08:01:00.000Z', price: decimal('101.75') },
};

const second: ChartDrawing = {
  id: 'drawing-45-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T08:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T08:03:00.000Z', price: decimal('103.75') },
};

describe('P18.45 chart drawing deletion coordination', () => {
  it('removes exactly the authoritative deleting drawing and resets interaction after success', () => {
    const onStateChange = vi.fn();
    const interaction = createChartDrawingInteractionPort().create(onStateChange);
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: first.id });

    expect(executeChartDrawingDeletion(interaction, collection)).toBe(first);
    expect(collection.getDrawings()).toEqual([second]);
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(onStateChange).toHaveBeenLastCalledWith({ status: 'idle' });
  });

  it('does not initiate deletion from selected state', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });

    expect(executeChartDrawingDeletion(interaction, collection)).toBeNull();
    expect(collection.getDrawings()).toEqual([first]);
    expect(interaction.getState()).toEqual({ status: 'selected', drawingId: first.id });
  });

  it('fails closed when deleting state points at a stale committed identity', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: first.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: first.id });

    expect(executeChartDrawingDeletion(interaction, collection)).toBeNull();
    expect(collection.getDrawings()).toEqual([second]);
    expect(interaction.getState()).toEqual({ status: 'deleting', drawingId: first.id });
  });

  it('never removes a different committed drawing than the authoritative deleting identity', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(first);
    collection.addDrawing(second);

    interaction.dispatch({ type: 'select-drawing', drawingId: second.id });
    interaction.dispatch({ type: 'start-deleting', drawingId: second.id });

    expect(executeChartDrawingDeletion(interaction, collection)).toBe(second);
    expect(collection.getDrawings()).toEqual([first]);
    expect(collection.getDrawing(first.id)).toBe(first);
  });
});
