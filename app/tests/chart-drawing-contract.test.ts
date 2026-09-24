import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import { defineChartDrawing, type ChartDrawing } from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

describe('P18.1 chart drawing contract', () => {
  it('preserves a provider-neutral trend-line drawing with DecimalString price anchors', () => {
    const drawing: ChartDrawing = {
      id: 'drawing-1',
      kind: 'trend-line',
      start: { timestamp: '2026-09-03T10:00:00.000Z', price: decimal('100.25') },
      end: { timestamp: '2026-09-03T10:05:00.000Z', price: decimal('101.75') },
    };

    expect(defineChartDrawing(drawing)).toEqual(drawing);
  });
});
