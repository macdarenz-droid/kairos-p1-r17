import { describe, expect, it } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import {
  projectChartCandle,
  projectChartPricePoint,
  projectChartSeries,
} from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid decimal fixture: ${value}`);
  return parsed.value;
}

describe('P17.3 chart series projection boundary', () => {
  it('projects ISO time and DecimalString price only at renderer boundary', () => {
    const source = {
      timestamp: '2026-09-03T00:00:00.000Z',
      price: decimal('100.25'),
    };

    expect(projectChartPricePoint(source)).toEqual({
      time: 1788393600,
      value: 100.25,
    });

    expect(source.price).toBe(decimal('100.25'));
  });

  it('projects candles without inventing execution semantics', () => {
    const source = {
      openTime: '2026-09-03T00:00:00.000Z',
      closeTime: '2026-09-03T00:00:59.999Z',
      open: decimal('100'),
      high: decimal('102'),
      low: decimal('99'),
      close: decimal('101'),
    };

    expect(projectChartCandle(source)).toEqual({
      time: 1788393600,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    });

    expect(source.close).toBe(decimal('101'));
  });

  it('keeps journal execution references outside renderer series projection', () => {
    const projected = projectChartSeries({
      market: {
        venue: 'binance-spot',
        instrument: 'BTCUSDT',
        source: 'market-reference',
      },
      series: {
        kind: 'price-line',
        points: [{
          timestamp: '2026-09-03T00:00:00.000Z',
          price: decimal('100'),
        }],
      },
      journalExecutions: [{
        executionId: 'execution-1',
        timestamp: '2026-09-03T00:00:01.000Z',
        price: decimal('99.5'),
        source: 'journal-execution',
      }],
    });

    expect(projected).toEqual({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100 }],
    });
  });

  it('rejects invalid timestamps instead of inventing time', () => {
    expect(() =>
      projectChartPricePoint({
        timestamp: 'not-a-time',
        price: decimal('100'),
      }),
    ).toThrow('invalid-chart-timestamp');
  });
});
