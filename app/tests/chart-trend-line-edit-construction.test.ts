import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString, type DecimalString } from '../src/domain/trades';
import {
  constructChartTrendLineEdit,
  type ChartDrawingAnchor,
  type ChartTrendLineDrawing,
} from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid positive decimal fixture: ${value}`);
  return parsed.value;
}

function drawing(): ChartTrendLineDrawing {
  return {
    id: 'drawing-48',
    kind: 'trend-line',
    start: { timestamp: '2026-09-05T00:00:00.000Z', price: decimal('100.25') },
    end: { timestamp: '2026-09-05T00:05:00.000Z', price: decimal('105.75') },
  };
}

describe('P18.48 chart trend-line edit construction', () => {
  it('replaces only the start anchor while preserving committed identity and kind', () => {
    const original = drawing();
    const replacement: ChartDrawingAnchor = {
      timestamp: '2026-09-05T00:01:00.000Z',
      price: decimal('101.5'),
    };

    const edited = constructChartTrendLineEdit(original, 'start', replacement);

    expect(edited).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: replacement,
      end: original.end,
    });
    expect(edited).not.toBe(original);
    expect(original).toEqual(drawing());
  });

  it('replaces only the end anchor while preserving the untouched start anchor', () => {
    const original = drawing();
    const replacement: ChartDrawingAnchor = {
      timestamp: '2026-09-05T00:06:00.000Z',
      price: decimal('106.25'),
    };

    const edited = constructChartTrendLineEdit(original, 'end', replacement);

    expect(edited.id).toBe(original.id);
    expect(edited.kind).toBe('trend-line');
    expect(edited.start).toEqual(original.start);
    expect(edited.end).toEqual(replacement);
  });

  it('returns detached anchor snapshots without mutating caller-owned drawing evidence', () => {
    const original = drawing();
    const replacement: ChartDrawingAnchor = {
      timestamp: '2026-09-05T00:02:00.000Z',
      price: decimal('102.5'),
    };

    const edited = constructChartTrendLineEdit(original, 'start', replacement);

    expect(edited.start).not.toBe(replacement);
    expect(edited.end).not.toBe(original.end);
    expect(original.start.price).toBe(decimal('100.25'));
    expect(original.end.price).toBe(decimal('105.75'));
  });

  it('fails closed for an unsupported runtime endpoint instead of guessing an edit target', () => {
    const original = drawing();

    expect(() =>
      constructChartTrendLineEdit(original, 'middle' as never, {
        timestamp: '2026-09-05T00:03:00.000Z',
        price: decimal('103'),
      }),
    ).toThrow('chart-trend-line-edit-endpoint-unsupported');
    expect(original).toEqual(drawing());
  });
});
