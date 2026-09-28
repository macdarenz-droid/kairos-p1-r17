import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  applyLiveMarketSummaryDeliveryState,
  createLiveMarketSummaryDeliveryState,
  getLiveMarketSummaryDeliveryStateFact,
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
const sol: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };

function fact(instrument: MarketDataInstrument, lastPrice: string, observedAt = '2026-09-07T00:00:00.000Z'): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: positive(lastPrice),
    open24h: positive('1'),
    high24h: positive('2'),
    low24h: positive('0.5'),
    baseVolume24h: '10' as DecimalString,
    quoteVolume24h: '20' as DecimalString,
    observedAt,
    sourceTimestamp: '2026-09-06T23:59:59.900Z',
  };
}

function apply(state: ReturnType<typeof createLiveMarketSummaryDeliveryState>, delivery: LiveMarketSummaryDelivery) {
  const result = applyLiveMarketSummaryDeliveryState(state, delivery);
  if (!result.ok) throw new Error(`Expected delivery state apply success: ${result.reason}`);
  return result.state;
}

describe('P21.16 live market summary delivery state foundation', () => {
  it('applies incremental facts as instrument upserts while preserving unrelated state', () => {
    let state = createLiveMarketSummaryDeliveryState();
    state = apply(state, { completeness: 'incremental', facts: [fact(btc, '64000'), fact(sol, '140')] });
    state = apply(state, { completeness: 'incremental', facts: [fact(btc, '64100')] });

    expect(getLiveMarketSummaryDeliveryStateFact(state, btc)?.lastPrice).toBe(positive('64100'));
    expect(getLiveMarketSummaryDeliveryStateFact(state, sol)?.lastPrice).toBe(positive('140'));
    expect(getLiveMarketSummaryDeliveryStateFact(state, eth)).toBeNull();
  });

  it('replaces only an explicit complete scope and preserves facts outside that scope', () => {
    let state = createLiveMarketSummaryDeliveryState();
    state = apply(state, { completeness: 'incremental', facts: [fact(btc, '63000'), fact(eth, '3100'), fact(sol, '140')] });
    state = apply(state, {
      completeness: 'complete-for-scope',
      scope: [btc, eth],
      facts: [fact(btc, '64000'), fact(eth, '3200')],
    });

    expect(getLiveMarketSummaryDeliveryStateFact(state, btc)?.lastPrice).toBe(positive('64000'));
    expect(getLiveMarketSummaryDeliveryStateFact(state, eth)?.lastPrice).toBe(positive('3200'));
    expect(getLiveMarketSummaryDeliveryStateFact(state, sol)?.lastPrice).toBe(positive('140'));
  });

  it('rejects an invalid delivery atomically and returns the exact prior state unchanged', () => {
    const state = apply(createLiveMarketSummaryDeliveryState(), {
      completeness: 'incremental',
      facts: [fact(btc, '64000')],
    });
    const invalid: LiveMarketSummaryDelivery = { completeness: 'incremental', facts: [] };
    const result = applyLiveMarketSummaryDeliveryState(state, invalid);

    expect(result).toEqual({ ok: false, reason: 'delivery-invalid', state });
    expect(result.state).toBe(state);
    expect(getLiveMarketSummaryDeliveryStateFact(state, btc)?.lastPrice).toBe(positive('64000'));
  });

  it('does not compare timestamps or infer freshness when applying a later-delivered fact', () => {
    let state = createLiveMarketSummaryDeliveryState();
    state = apply(state, { completeness: 'incremental', facts: [fact(btc, '64000', '2026-09-07T00:10:00.000Z')] });
    state = apply(state, { completeness: 'incremental', facts: [fact(btc, '63000', '2026-09-07T00:00:00.000Z')] });
    expect(getLiveMarketSummaryDeliveryStateFact(state, btc)?.lastPrice).toBe(positive('63000'));
  });
});
