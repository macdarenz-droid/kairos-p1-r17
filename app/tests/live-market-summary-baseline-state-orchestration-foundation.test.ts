import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  acquireLiveMarketSummaryBaselineIntoState,
  applyLiveMarketSummaryDeliveryState,
  createLiveMarketSummaryDeliveryState,
  getLiveMarketSummaryDeliveryStateFact,
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
const sol: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };

function fact(instrument: MarketDataInstrument, lastPrice: string): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: positive(lastPrice),
    open24h: positive('1'),
    high24h: positive('2'),
    low24h: positive('0.5'),
    baseVolume24h: '10' as DecimalString,
    quoteVolume24h: '20' as DecimalString,
    observedAt: '2026-09-08T00:00:00.000Z',
    sourceTimestamp: '2026-09-07T23:59:59.900Z',
  };
}

function withIncrementalFact(instrument: MarketDataInstrument, lastPrice: string) {
  const initial = createLiveMarketSummaryDeliveryState();
  const applied = applyLiveMarketSummaryDeliveryState(initial, {
    completeness: 'incremental',
    facts: [fact(instrument, lastPrice)],
  });
  if (!applied.ok) throw new Error('Expected fixture delivery to apply');
  return applied.state;
}

describe('P21.17 live market summary baseline state orchestration foundation', () => {
  it('acquires one explicit baseline and applies it through released P21.16 state while preserving out-of-scope facts', async () => {
    const prior = withIncrementalFact(sol, '140');
    const scope = [btc, eth] as const;
    const delivery: LiveMarketSummaryCompleteForScopeDelivery = {
      completeness: 'complete-for-scope',
      scope,
      facts: [fact(btc, '64000'), fact(eth, '3200')],
    };
    const acquireBaseline = vi.fn(async () => ({ ok: true as const, delivery }));
    const port: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline };

    const result = await acquireLiveMarketSummaryBaselineIntoState(prior, port, scope);

    expect(result.ok).toBe(true);
    expect(acquireBaseline).toHaveBeenCalledTimes(1);
    expect(acquireBaseline).toHaveBeenCalledWith(scope);
    if (result.ok) {
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, btc)?.lastPrice).toBe(positive('64000'));
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, eth)?.lastPrice).toBe(positive('3200'));
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, sol)?.lastPrice).toBe(positive('140'));
    }
  });

  it('forwards the caller-owned scope and acquisition options unchanged', async () => {
    const prior = createLiveMarketSummaryDeliveryState();
    const scope = [btc] as const;
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const delivery: LiveMarketSummaryCompleteForScopeDelivery = {
      completeness: 'complete-for-scope',
      scope,
      facts: [fact(btc, '64000')],
    };
    const acquireBaseline = vi.fn(async (
      _scope: readonly MarketDataInstrument[],
      _options?: { readonly signal?: AbortSignal },
    ) => ({ ok: true as const, delivery }));
    const port: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline };

    await acquireLiveMarketSummaryBaselineIntoState(prior, port, scope, options);

    expect(acquireBaseline).toHaveBeenCalledTimes(1);
    expect(acquireBaseline.mock.calls[0]?.[0]).toBe(scope);
    expect(acquireBaseline.mock.calls[0]?.[1]).toBe(options);
  });

  it('returns acquisition-failed with the exact prior state unchanged', async () => {
    const prior = withIncrementalFact(sol, '140');
    const acquireBaseline = vi.fn(async () => ({ ok: false as const, reason: 'acquisition-failed' as const }));
    const port: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline };

    const result = await acquireLiveMarketSummaryBaselineIntoState(prior, port, [btc]);

    expect(result).toEqual({ ok: false, reason: 'acquisition-failed', state: prior });
    expect(result.state).toBe(prior);
  });

  it('preserves P21.16 delivery validation and returns delivery-invalid with the exact prior state', async () => {
    const prior = withIncrementalFact(sol, '140');
    const invalidDelivery = {
      completeness: 'complete-for-scope',
      scope: [btc],
      facts: [],
    } as unknown as LiveMarketSummaryCompleteForScopeDelivery;
    const port: LiveMarketSummaryBaselineAcquisitionPort = {
      async acquireBaseline() {
        return { ok: true, delivery: invalidDelivery };
      },
    };

    const result = await acquireLiveMarketSummaryBaselineIntoState(prior, port, [btc]);

    expect(result).toEqual({ ok: false, reason: 'delivery-invalid', state: prior });
    expect(result.state).toBe(prior);
  });
});
