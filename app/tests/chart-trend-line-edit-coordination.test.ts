import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  createChartDrawingCollectionPort,
  createChartDrawingInteractionPort,
  executeChartTrendLineEdit,
  type ChartDrawing,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const original: ChartDrawing = {
  id: 'drawing-50-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T10:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T10:01:00.000Z', price: decimal('101.75') },
};

const other: ChartDrawing = {
  id: 'drawing-50-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T10:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T10:03:00.000Z', price: decimal('103.75') },
};

describe('P18.50 chart trend-line edit coordination', () => {
  it('edits exactly the authoritative endpoint and resets interaction after committed replacement', () => {
    const onStateChange = vi.fn();
    const interaction = createChartDrawingInteractionPort().create(onStateChange);
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    collection.addDrawing(other);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'start',
    });

    const replacementAnchor = {
      timestamp: '2026-09-05T10:04:00.000Z' as const,
      price: decimal('99.50'),
    };
    const edited = executeChartTrendLineEdit(interaction, collection, replacementAnchor);

    expect(edited).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: replacementAnchor,
      end: original.end,
    });
    expect(collection.getDrawings()).toEqual([edited, other]);
    expect(interaction.getState()).toEqual({ status: 'idle' });
    expect(onStateChange).toHaveBeenLastCalledWith({ status: 'idle' });
  });

  it('uses the authoritative editing endpoint rather than accepting an execution-time endpoint argument', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'end',
    });

    const replacementAnchor = {
      timestamp: '2026-09-05T10:05:00.000Z' as const,
      price: decimal('105.25'),
    };
    const edited = executeChartTrendLineEdit(interaction, collection, replacementAnchor);

    expect(edited?.start).toEqual(original.start);
    expect(edited?.end).toEqual(replacementAnchor);
  });

  it('does not initiate editing from selected state', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });

    const result = executeChartTrendLineEdit(interaction, collection, {
      timestamp: '2026-09-05T10:06:00.000Z',
      price: decimal('98.50'),
    });

    expect(result).toBeNull();
    expect(collection.getDrawings()).toEqual([original]);
    expect(interaction.getState()).toEqual({ status: 'selected', drawingId: original.id });
  });

  it('fails closed when authoritative editing state points at a stale committed identity', () => {
    const interaction = createChartDrawingInteractionPort().create(vi.fn());
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(other);

    interaction.dispatch({ type: 'select-drawing', drawingId: original.id });
    interaction.dispatch({
      type: 'start-editing',
      drawingId: original.id,
      endpoint: 'start',
    });

    const result = executeChartTrendLineEdit(interaction, collection, {
      timestamp: '2026-09-05T10:07:00.000Z',
      price: decimal('97.50'),
    });

    expect(result).toBeNull();
    expect(collection.getDrawings()).toEqual([other]);
    expect(interaction.getState()).toEqual({
      status: 'editing',
      drawingId: original.id,
      endpoint: 'start',
    });
  });
});
