import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  validateLiveMarketSummaryBaselineSuccess,
  type LiveMarketSummaryBaselineAcquisitionPort,
  type LiveMarketSummaryCompleteForScopeDelivery,
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

function complete(scope: readonly MarketDataInstrument[]): LiveMarketSummaryCompleteForScopeDelivery {
  return {
    completeness: 'complete-for-scope',
    scope,
    facts: scope.map((instrument) => fact(instrument, instrument.symbol === 'BTCUSDT' ? '64000' : '3200')),
  };
}

describe('P21.4 live market summary baseline acquisition port foundation', () => {
  it('defines an async provider-neutral port with explicit acquisition failure', async () => {
    const port: LiveMarketSummaryBaselineAcquisitionPort = {
      async acquireBaseline() {
        return { ok: false, reason: 'acquisition-failed' };
      },
    };
    await expect(port.acquireBaseline([btc])).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });

  it('accepts a P21.3 complete-for-scope delivery for the exact caller-requested scope', () => {
    const delivery = complete([btc, eth]);
    expect(validateLiveMarketSummaryBaselineSuccess([eth, btc], delivery)).toEqual({ ok: true, delivery });
  });

  it('rejects a success delivery whose declared scope differs from the caller request', () => {
    const delivery = complete([btc]);
    expect(validateLiveMarketSummaryBaselineSuccess([btc, eth], delivery)).toEqual({
      ok: false,
      reason: 'requested-scope-mismatch',
    });
  });

  it('rejects success delivery that violates canonical P21.3 completeness semantics', () => {
    const delivery: LiveMarketSummaryCompleteForScopeDelivery = {
      completeness: 'complete-for-scope',
      scope: [btc, eth],
      facts: [fact(btc, '64000')],
    };
    expect(validateLiveMarketSummaryBaselineSuccess([btc, eth], delivery)).toEqual({
      ok: false,
      reason: 'delivery-invalid',
    });
  });
});
