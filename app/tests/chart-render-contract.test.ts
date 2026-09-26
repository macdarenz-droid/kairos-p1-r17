import { describe, expect, it } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import { createChartRenderModel } from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid decimal fixture: ${value}`);
  return parsed.value;
}

describe('P17.1 chart render contract', () => {
  it('preserves market-reference and journal-execution truths as separate inputs', () => {
    const model = createChartRenderModel({
      market: {
        venue: 'binance-spot',
        instrument: 'BTCUSDT',
        source: 'market-reference',
      },
      series: {
        kind: 'price-line',
        points: [{
          timestamp: '2026-09-03T00:00:00.000Z',
          price: decimal('100.00'),
        }],
      },
      journalExecutions: [{
        executionId: 'execution-1',
        timestamp: '2026-09-03T00:00:01.000Z',
        price: decimal('99.50'),
        source: 'journal-execution',
      }],
    });

    expect(model.market.source).toBe('market-reference');
    expect(model.journalExecutions[0]?.source).toBe('journal-execution');
    expect(model.series.kind).toBe('price-line');
  });

  it('accepts candle presentation data without deriving execution truth', () => {
    const model = createChartRenderModel({
      market: {
        venue: 'binance-spot',
        instrument: 'BTCUSDT',
        source: 'market-reference',
      },
      series: {
        kind: 'candles',
        candles: [{
          openTime: '2026-09-03T00:00:00.000Z',
          closeTime: '2026-09-03T00:00:59.999Z',
          open: decimal('100'),
          high: decimal('102'),
          low: decimal('99'),
          close: decimal('101'),
        }],
      },
      journalExecutions: [],
    });

    expect(model.series.kind).toBe('candles');
    expect(model.journalExecutions).toEqual([]);
  });
});
