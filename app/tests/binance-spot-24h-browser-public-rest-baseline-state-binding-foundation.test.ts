import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { DecimalString } from '../src/domain/trades';
import {
  acquireBinanceSpot24hBrowserPublicRestBaselineIntoState,
  applyLiveMarketSummaryDeliveryState,
  createLiveMarketSummaryDeliveryState,
  getLiveMarketSummaryDeliveryStateFact,
  type LiveMarketSummaryFact,
  type MarketDataInstrument,
} from '../src/services/market-data';

function positive(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid positive DecimalString fixture: ${value}`);
  return parsed.value;
}

const originalFetch = globalThis.fetch;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const sol: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };
const scope = [btc] as const;
const observedAt = '2026-09-08T02:48:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

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

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P21.18 Binance Spot browser public REST baseline state binding foundation', () => {
  it('composes released P21.15 browser acquisition with released P21.17 state orchestration and preserves out-of-scope state', async () => {
    const prior = withIncrementalFact(sol, '140');
    const text = vi.fn(async () => payload);
    const fetchMock = vi.fn(async () => ({ text }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoState(
      prior,
      readObservedAt,
      scope,
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, btc)?.lastPrice).toBe(positive('64000'));
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, btc)?.observedAt).toBe(observedAt);
      expect(getLiveMarketSummaryDeliveryStateFact(result.state, sol)?.lastPrice).toBe(positive('140'));
    }
  });

  it('forwards caller-owned cancellation through released P21.15 and P21.17 unchanged', async () => {
    const prior = createLiveMarketSummaryDeliveryState();
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => ({
      text: async () => payload,
      init,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpot24hBrowserPublicRestBaselineIntoState(
      prior,
      () => observedAt,
      scope,
      options,
    )).resolves.toMatchObject({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.signal).toBe(controller.signal);
  });

  it('preserves released acquisition-failed semantics and returns the exact prior state unchanged', async () => {
    const prior = withIncrementalFact(sol, '140');
    globalThis.fetch = vi.fn(async () => { throw new Error('native-fetch-failure'); }) as unknown as typeof fetch;

    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoState(
      prior,
      () => observedAt,
      scope,
    );

    expect(result).toEqual({ ok: false, reason: 'acquisition-failed', state: prior });
    expect(result.state).toBe(prior);
  });
});
