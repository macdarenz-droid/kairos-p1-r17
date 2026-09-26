import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  validateLiveMarketSummaryDelivery,
  type LiveMarketSummaryDelivery,
  type LiveMarketSummaryFact,
  type MarketDataInstrument,
} from '../src/services/market-data';

function positive(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid positive DecimalString fixture: ${value}`);
  return parsed.value;
}

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };

function fact(instrument: MarketDataInstrument, lastPrice: string): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: positive(lastPrice),
    open24h: positive('1'),
    high24h: positive('2'),
    low24h: positive('0.5'),
    baseVolume24h: '10' as DecimalString,
    quoteVolume24h: '20' as DecimalString,
    observedAt: '2026-09-07T00:00:00.000Z',
    sourceTimestamp: '2026-09-06T23:59:59.900Z',
  };
}

describe('P21.3 live market summary delivery completeness contract', () => {
  it('accepts incremental changed-symbol facts without implying a complete market scope', () => {
    const delivery: LiveMarketSummaryDelivery = {
      completeness: 'incremental',
      facts: [fact(btc, '64000')],
    };
    expect(validateLiveMarketSummaryDelivery(delivery)).toEqual({ ok: true, delivery });
  });

  it('accepts complete-for-scope only when every declared scope instrument is represented exactly once', () => {
    const delivery: LiveMarketSummaryDelivery = {
      completeness: 'complete-for-scope',
      scope: [btc, eth],
      facts: [fact(btc, '64000'), fact(eth, '3200')],
    };
    expect(validateLiveMarketSummaryDelivery(delivery)).toEqual({ ok: true, delivery });
  });

  it('rejects false completeness when a declared scope instrument is missing', () => {
    const delivery: LiveMarketSummaryDelivery = {
      completeness: 'complete-for-scope',
      scope: [btc, eth],
      facts: [fact(btc, '64000')],
    };
    expect(validateLiveMarketSummaryDelivery(delivery)).toEqual({ ok: false, reason: 'scope-fact-missing' });
  });

  it('rejects duplicate facts and facts outside a declared complete scope', () => {
    expect(validateLiveMarketSummaryDelivery({
      completeness: 'incremental',
      facts: [fact(btc, '64000'), fact(btc, '64001')],
    })).toEqual({ ok: false, reason: 'fact-instrument-duplicate' });

    expect(validateLiveMarketSummaryDelivery({
      completeness: 'complete-for-scope',
      scope: [btc],
      facts: [fact(eth, '3200')],
    })).toEqual({ ok: false, reason: 'fact-outside-scope' });
  });
});
