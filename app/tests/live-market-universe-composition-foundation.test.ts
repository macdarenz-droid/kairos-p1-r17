import { describe, expect, it } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import {
  composeLiveMarketUniverse,
  type LiveMarketSummaryFact,
  type LiveMarketUniverseInstrumentMetadataFact,
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

function summary(symbol: string, quoteVolume24h: string, venue = 'binance-spot'): LiveMarketSummaryFact {
  return {
    instrument: { venue, symbol },
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

describe('Live Market Universe provider-neutral composition', () => {
  it('delegates eligibility, exact identity join, ordering, tie-break, and configured Top-N', () => {
    const metadataFacts = [
      metadata('ETHUSDT', 'ETH'),
      metadata('BTCUSDT', 'BTC'),
      metadata('XRPUSDT', 'XRP'),
      metadata('USDCUSDT', 'USDC'),
      metadata('SOLUSDT', 'SOL', { tradingEnabled: false }),
      metadata('DOGEFDUSD', 'DOGE', { quoteAsset: 'FDUSD' }),
    ];
    const summaryFacts = [
      summary('XRPUSDT', '100'),
      summary('ETHUSDT', '200'),
      summary('BTCUSDT', '200'),
      summary('USDCUSDT', '999'),
      summary('SOLUSDT', '998'),
      summary('DOGEFDUSD', '997'),
      summary('BTCUSDT', '1000', 'different-venue'),
    ];

    expect(composeLiveMarketUniverse(metadataFacts, summaryFacts, {
      excludedStablecoinBaseAssets: new Set(['USDC']),
      topNCount: 2,
    })).toEqual([
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ]);
  });

  it('omits eligible metadata that has no matching summary fact and never synthesizes market facts', () => {
    expect(composeLiveMarketUniverse(
      [metadata('BTCUSDT', 'BTC'), metadata('ETHUSDT', 'ETH')],
      [summary('ETHUSDT', '50')],
      { excludedStablecoinBaseAssets: new Set() },
    )).toEqual([{ venue: 'binance-spot', symbol: 'ETHUSDT' }]);
  });

  it('uses exact trimmed venue plus symbol identity rather than symbol-only association', () => {
    expect(composeLiveMarketUniverse(
      [metadata('BTCUSDT', 'BTC', { venue: 'binance-spot' })],
      [summary('BTCUSDT', '1000', 'other-venue'), summary('BTCUSDT', '10', ' binance-spot ')],
      { excludedStablecoinBaseAssets: new Set() },
    )).toEqual([{ venue: ' binance-spot ', symbol: 'BTCUSDT' }]);
  });

  it('delegates the config-owned default Top-N and does not mutate caller arrays', () => {
    const metadataFacts = Array.from({ length: 35 }, (_, index) =>
      metadata(`S${String(index).padStart(2, '0')}USDT`, `S${String(index).padStart(2, '0')}`),
    );
    const summaryFacts = metadataFacts.map((fact, index) => summary(fact.instrument.symbol, String(1000-index)));
    const metadataBefore = [...metadataFacts];
    const summaryBefore = [...summaryFacts];

    const selected = composeLiveMarketUniverse(metadataFacts, summaryFacts, {
      excludedStablecoinBaseAssets: new Set(),
    });

    expect(selected).toHaveLength(30);
    expect(metadataFacts).toEqual(metadataBefore);
    expect(summaryFacts).toEqual(summaryBefore);
  });
});
