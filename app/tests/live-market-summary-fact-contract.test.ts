import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  validateLiveMarketSummaryFact,
  type LiveMarketSummaryFact,
} from '../src/services/market-data';

function positive(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid positive DecimalString fixture: ${value}`);
  return parsed.value;
}

const fact: LiveMarketSummaryFact = {
  instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
  lastPrice: positive('64000.25'),
  open24h: positive('62500.00'),
  high24h: positive('65000.00'),
  low24h: positive('62000.00'),
  baseVolume24h: '0' as DecimalString,
  quoteVolume24h: '125000000.50' as DecimalString,
  observedAt: '2026-09-07T00:00:00.000Z',
  sourceTimestamp: '2026-09-06T23:59:59.900Z',
};

describe('P21.2 live market summary fact contract', () => {
  it('accepts raw provider-neutral positive price facts and non-negative rolling volumes', () => {
    expect(validateLiveMarketSummaryFact(fact)).toEqual({ ok: true, fact });
  });

  it('rejects missing instrument identity, non-positive prices, negative volumes, and invalid timestamps', () => {
    expect(validateLiveMarketSummaryFact({ ...fact, instrument: { venue: '', symbol: 'BTCUSDT' } })).toEqual({ ok: false, reason: 'instrument-required' });
    expect(validateLiveMarketSummaryFact({ ...fact, lastPrice: '0' as DecimalString })).toEqual({ ok: false, reason: 'last-price-invalid' });
    expect(validateLiveMarketSummaryFact({ ...fact, baseVolume24h: '-1' as DecimalString })).toEqual({ ok: false, reason: 'base-volume-24h-invalid' });
    expect(validateLiveMarketSummaryFact({ ...fact, sourceTimestamp: 'not-a-time' })).toEqual({ ok: false, reason: 'source-timestamp-invalid' });
  });
});
