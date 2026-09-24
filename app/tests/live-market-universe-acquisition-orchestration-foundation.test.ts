import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import {
  acquireLiveMarketUniverseOnce,
  type LiveMarketSummaryBaselineAcquisitionPort,
  type LiveMarketSummaryFact,
  type LiveMarketUniverseInstrumentMetadataAcquisitionPort,
  type LiveMarketUniverseInstrumentMetadataFact,
  type MarketDataInstrument,
} from '../src/services/market-data';

function decimal(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`bad DecimalString fixture: ${value}`);
  return parsed.value;
}

function metadata(
  symbol: string,
  baseAsset: string,
  options: { venue?: string; quoteAsset?: string; tradingEnabled?: boolean } = {},
): LiveMarketUniverseInstrumentMetadataFact {
  return {
    instrument: { venue: options.venue ?? 'binance-spot', symbol },
    baseAsset,
    quoteAsset: options.quoteAsset ?? 'USDT',
    tradingEnabled: options.tradingEnabled ?? true,
  };
}

function summary(instrument: MarketDataInstrument, quoteVolume24h: string): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: decimal('1'),
    open24h: decimal('1'),
    high24h: decimal('1'),
    low24h: decimal('1'),
    baseVolume24h: decimal('1'),
    quoteVolume24h: decimal(quoteVolume24h),
    observedAt: '2026-09-09T00:00:00.000Z',
    sourceTimestamp: null,
  };
}

function baselineSuccess(
  scope: readonly MarketDataInstrument[],
  facts: readonly LiveMarketSummaryFact[],
) {
  return {
    ok: true as const,
    delivery: { completeness: 'complete-for-scope' as const, scope, facts },
  };
}

describe('Live Market Universe one-shot provider-neutral acquisition orchestration', () => {
  it('sequences metadata -> released eligibility scope -> baseline -> Gate334 composition with caller signal', async () => {
    const signal = new AbortController().signal;
    const metadataFacts = [
      metadata('ETHUSDT', 'ETH'),
      metadata('BTCUSDT', 'BTC'),
      metadata('USDCUSDT', 'USDC'),
      metadata('SOLUSDT', 'SOL', { tradingEnabled: false }),
      metadata('DOGEFDUSD', 'DOGE', { quoteAsset: 'FDUSD' }),
    ];
    const metadataAcquire = vi.fn(async () => ({ ok: true as const, facts: metadataFacts }));
    const metadataPort: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      acquireInstrumentMetadata: metadataAcquire,
    };
    const baselineAcquire = vi.fn(async (scope: readonly MarketDataInstrument[]) => baselineSuccess(scope, [
      summary({ venue: 'binance-spot', symbol: 'ETHUSDT' }, '200'),
      summary({ venue: 'binance-spot', symbol: 'BTCUSDT' }, '200'),
    ]));
    const baselinePort: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline: baselineAcquire };

    await expect(acquireLiveMarketUniverseOnce(metadataPort, baselinePort, {
      excludedStablecoinBaseAssets: new Set(['USDC']),
      topNCount: 1,
      signal,
    })).resolves.toEqual({
      ok: true,
      instruments: [{ venue: 'binance-spot', symbol: 'BTCUSDT' }],
    });

    expect(metadataAcquire).toHaveBeenCalledTimes(1);
    expect(metadataAcquire).toHaveBeenCalledWith({ signal });
    expect(baselineAcquire).toHaveBeenCalledTimes(1);
    expect(baselineAcquire).toHaveBeenCalledWith([
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
    ], { signal });
  });

  it('does not call baseline acquisition when metadata acquisition fails', async () => {
    const metadataPort: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      async acquireInstrumentMetadata() { return { ok: false, reason: 'acquisition-failed' }; },
    };
    const baselineAcquire = vi.fn(async () => { throw new Error('must not run'); });
    const baselinePort: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline: baselineAcquire };

    await expect(acquireLiveMarketUniverseOnce(metadataPort, baselinePort, {
      excludedStablecoinBaseAssets: new Set(),
    })).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    expect(baselineAcquire).not.toHaveBeenCalled();
  });

  it('does not issue an invalid empty-scope baseline request when no metadata fact is eligible', async () => {
    const metadataAcquire = vi.fn(async () => ({
      ok: true as const,
      facts: [metadata('BTCUSDT', 'BTC', { tradingEnabled: false })],
    }));
    const metadataPort: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      acquireInstrumentMetadata: metadataAcquire,
    };
    const baselineAcquire = vi.fn(async () => { throw new Error('must not run'); });
    const baselinePort: LiveMarketSummaryBaselineAcquisitionPort = { acquireBaseline: baselineAcquire };

    await expect(acquireLiveMarketUniverseOnce(metadataPort, baselinePort, {
      excludedStablecoinBaseAssets: new Set(),
    })).resolves.toEqual({ ok: true, instruments: [] });
    expect(metadataAcquire).toHaveBeenCalledWith();
    expect(baselineAcquire).not.toHaveBeenCalled();
  });

  it('returns acquisition failure when the explicit-scope baseline acquisition fails', async () => {
    const btc = metadata('BTCUSDT', 'BTC');
    const metadataPort: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      async acquireInstrumentMetadata() { return { ok: true, facts: [btc] }; },
    };
    const baselinePort: LiveMarketSummaryBaselineAcquisitionPort = {
      async acquireBaseline() { return { ok: false, reason: 'acquisition-failed' }; },
    };

    await expect(acquireLiveMarketUniverseOnce(metadataPort, baselinePort, {
      excludedStablecoinBaseAssets: new Set(),
    })).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });
});
