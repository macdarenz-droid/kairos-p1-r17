import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import {
  deriveLiveMarketSummary24hPercentageMovement,
  type LiveMarketSummaryFact,
} from '../src/services/market-data';

function decimal(value: string): DecimalString {
  return value as DecimalString;
}

function fact(
  lastPrice = '120',
  open24h = '100',
): LiveMarketSummaryFact {
  return {
    instrument: { venue: 'TEST', symbol: 'BTCUSDT' },
    lastPrice: decimal(lastPrice),
    open24h: decimal(open24h),
    high24h: decimal('125'),
    low24h: decimal('95'),
    baseVolume24h: decimal('10'),
    quoteVolume24h: decimal('1000'),
    observedAt: '2026-09-10T00:00:00.000Z',
    sourceTimestamp: null,
  };
}

describe('Live Market Summary 24h Percentage Movement Foundation', () => {
  it('derives a positive 24h movement with released Decimal arithmetic', () => {
    const input = fact('120', '100');
    const result = deriveLiveMarketSummary24hPercentageMovement(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.movement.movementPercent24h).toBe('20');
    expect(result.movement.fact).toBe(input);
    expect(result.movement.instrument).toBe(input.instrument);
  });

  it('preserves the sign for negative movement', () => {
    const result = deriveLiveMarketSummary24hPercentageMovement(fact('80', '100'));

    expect(result).toMatchObject({
      ok: true,
      movement: { movementPercent24h: '-20' },
    });
  });

  it('derives exact zero for an unchanged 24h price', () => {
    const result = deriveLiveMarketSummary24hPercentageMovement(fact('100', '100'));

    expect(result).toMatchObject({
      ok: true,
      movement: { movementPercent24h: '0' },
    });
  });

  it('keeps Decimal precision rather than using JavaScript floating arithmetic', () => {
    const result = deriveLiveMarketSummary24hPercentageMovement(fact('1.1', '1'));

    expect(result).toMatchObject({
      ok: true,
      movement: { movementPercent24h: '10' },
    });
  });

  it('fails closed through the released fact validator before arithmetic', () => {
    const invalid = fact('120', '0');
    const result = deriveLiveMarketSummary24hPercentageMovement(invalid);

    expect(result).toEqual({ ok: false, reason: 'fact-invalid' });
  });
});
