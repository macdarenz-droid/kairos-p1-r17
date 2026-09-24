import { describe, expect, it } from 'vitest';
import {
  assessMarketObservationFreshness,
  validateMarketPriceObservation,
} from '../src/services/market-data';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import type { MarketPriceObservation } from '../src/services/market-data';

function decimal(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid test DecimalString: ${value}`);
  return parsed.value;
}

const baseObservation: MarketPriceObservation = {
  instrument: { venue: 'example', symbol: 'BTCUSD' },
  price: decimal('64000.25'),
  observedAt: '2026-09-03T00:00:00.000Z',
  sourceTimestamp: null,
};

describe('P15.2 market-data observation semantics', () => {
  it('accepts positive decimal price truth with explicit UTC receipt time', () => {
    expect(validateMarketPriceObservation(baseObservation)).toEqual({
      ok: true,
      observation: baseObservation,
    });
  });

  it('rejects malformed, non-positive, or incomplete observations explicitly', () => {
    expect(validateMarketPriceObservation({
      ...baseObservation,
      price: '0' as DecimalString,
    }).ok).toBe(false);
    expect(validateMarketPriceObservation({
      ...baseObservation,
      observedAt: '09/03/2026 10:00',
    }).ok).toBe(false);
    expect(validateMarketPriceObservation({
      ...baseObservation,
      instrument: { venue: '', symbol: 'BTCUSD' },
    }).ok).toBe(false);
  });

  it('uses application receipt time, not provider time, for freshness', () => {
    const withOldProviderTime: MarketPriceObservation = {
      ...baseObservation,
      sourceTimestamp: '2020-01-01T00:00:00.000Z',
    };
    expect(assessMarketObservationFreshness(
      withOldProviderTime,
      '2026-09-03T00:00:00.500Z',
      1000,
    )).toBe('fresh');
  });

  it('classifies stale, future, and invalid observations without reading Date.now()', () => {
    expect(assessMarketObservationFreshness(
      baseObservation,
      '2026-09-03T00:00:02.000Z',
      1000,
    )).toBe('stale');
    expect(assessMarketObservationFreshness(
      { ...baseObservation, observedAt: '2026-09-03T00:00:03.000Z' },
      '2026-09-03T00:00:02.000Z',
      1000,
    )).toBe('future');
    expect(assessMarketObservationFreshness(baseObservation, 'not-a-time', 1000)).toBe('invalid');
  });
});
