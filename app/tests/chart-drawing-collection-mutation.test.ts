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
  id: 'drawing-44-a',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T07:00:00.000Z', price: decimal('100.25') },
  end: { timestamp: '2026-09-05T07:01:00.000Z', price: decimal('101.75') },
};

const second: ChartDrawing = {
  id: 'drawing-44-b',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T07:02:00.000Z', price: decimal('102.25') },
  end: { timestamp: '2026-09-05T07:03:00.000Z', price: decimal('103.75') },
};

const third: ChartDrawing = {
  id: 'drawing-44-c',
  kind: 'trend-line',
  start: { timestamp: '2026-09-05T07:04:00.000Z', price: decimal('104.25') },
  end: { timestamp: '2026-09-05T07:05:00.000Z', price: decimal('105.75') },
};

describe('P18.44 chart drawing collection mutation', () => {
  it('replaces an existing committed drawing without changing identity or insertion order', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);
    session.addDrawing(second);

    const replacement: ChartDrawing = {
      ...first,
      end: { timestamp: '2026-09-05T07:06:00.000Z', price: decimal('106.25') },
    };

    expect(session.replaceDrawing(first.id, replacement)).toEqual([replacement, second]);
    expect(session.getDrawing(first.id)).toBe(replacement);
  });

  it('fails closed when replacement identity does not match the authoritative key', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);
    session.addDrawing(second);

    expect(() => session.replaceDrawing(first.id, second)).toThrow(
      'chart-drawing-collection-identity-mismatch',
    );
    expect(session.getDrawings()).toEqual([first, second]);
  });

  it('fails closed when replacement targets a missing committed drawing', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);

    expect(() => session.replaceDrawing('drawing-44-missing', first)).toThrow(
      'chart-drawing-collection-missing-id',
    );
    expect(session.getDrawings()).toEqual([first]);
  });

  it('removes exactly one existing committed drawing while preserving survivor order', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);
    session.addDrawing(second);
    session.addDrawing(third);

    expect(session.removeDrawing(second.id)).toEqual([first, third]);
    expect(session.getDrawing(second.id)).toBeNull();
    expect(session.getDrawings()).toEqual([first, third]);
  });

  it('fails closed when removal targets a missing committed drawing', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);

    expect(() => session.removeDrawing('drawing-44-missing')).toThrow(
      'chart-drawing-collection-missing-id',
    );
    expect(session.getDrawings()).toEqual([first]);
  });

  it('destroyed collections reject later replace and remove mutation', () => {
    const session = createChartDrawingCollectionPort().create();
    session.addDrawing(first);
    session.destroy();

    expect(() => session.replaceDrawing(first.id, first)).toThrow('chart-drawing-collection-destroyed');
    expect(() => session.removeDrawing(first.id)).toThrow('chart-drawing-collection-destroyed');
  });
});
