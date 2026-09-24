import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  createChartDrawingCollectionPort,
  type ChartDrawing,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawing = {
  id: 'drawing-33-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T02:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T02:01:00.000Z', price: decimal('101.75') },
};

const second: ChartDrawing = {
  id: 'drawing-33-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T02:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T02:03:00.000Z', price: decimal('103.75') },
};

describe('P18.33 chart drawing collection', () => {
  it('owns the committed in-memory drawing set without creating or persisting drawing truth', () => {
    const session = createChartDrawingCollectionPort().create();

    expect(session.getDrawings()).toEqual([]);
    expect(session.addDrawing(first)).toEqual([first]);
    expect(session.addDrawing(second)).toEqual([first, second]);
    expect(session.getDrawings()).toEqual([first, second]);
  });

  it('resolves an exact committed drawing by caller-owned identity', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);

    expect(session.getDrawing('drawing-33-a')).toBe(first);
    expect(session.getDrawing('missing-33')).toBeNull();
  });

  it('rejects duplicate drawing identities without replacing existing committed truth', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);

    const conflicting: ChartDrawing = {
      ...second,
      id: first.id,
    };

    expect(() => session.addDrawing(conflicting)).toThrow('chart-drawing-collection-duplicate-id');
    expect(session.getDrawings()).toEqual([first]);
    expect(session.getDrawing(first.id)).toBe(first);
  });

  it('keeps independent committed drawing collections isolated', () => {
    const port = createChartDrawingCollectionPort();
    const left = port.create();
    const right = port.create();

    left.addDrawing(first);
    right.addDrawing(second);

    expect(left.getDrawings()).toEqual([first]);
    expect(right.getDrawings()).toEqual([second]);
  });

  it('destroy is idempotent and later collection access fails closed', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);

    session.destroy();
    session.destroy();

    expect(() => session.getDrawings()).toThrow('chart-drawing-collection-destroyed');
    expect(() => session.getDrawing(first.id)).toThrow('chart-drawing-collection-destroyed');
    expect(() => session.addDrawing(second)).toThrow('chart-drawing-collection-destroyed');
  });
});
