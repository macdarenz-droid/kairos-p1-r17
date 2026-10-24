import { describe, expect, it, vi } from 'vitest';
import {
  checkPriceAtMinute, describeMarketMinute, describeMarketMinuteFailure, describeTypo, localTimeToInstant, readMarketMinute, type MarketMinute,
} from '../src/application/market-reference/minuteCheck';
import type { PriceNowDeps } from '../src/application/market-reference/priceNow';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const d = (value: string) => value as DecimalString;
const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const AT = '2026-10-24T10:32:20.000Z';
const fact = (baseAsset: string, quoteAsset: string): LiveMarketUniverseInstrumentMetadataFact =>
  ({ instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true }) as LiveMarketUniverseInstrumentMetadataFact;
const minuteCandle = { openTime: '2026-10-24T10:32:00.000Z', closeTime: '2026-10-24T10:32:59.999Z', open: '64990', high: '65120.5', low: '64980', close: '65000', volume: '7' };
const answer = (candles: unknown[]) => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', observedAt: '2026-10-24T12:00:00.000Z', candles } }) as unknown as MarketCandleHistoryResult;
function deps(history: (request: MarketCandleHistoryRequest) => MarketCandleHistoryResult) {
  const acquireHistory = vi.fn(async (request: MarketCandleHistoryRequest) => history(request));
  const value: PriceNowDeps = { venue: 'binance-spot', history: { acquireHistory }, metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts: [fact('BTC', 'USDT')] })) } };
  return { value, acquireHistory };
}
const range = { low: d('64980'), high: d('65120.5') };

describe('T-059d where a price sits in its minute', () => {
  it('is inside from the low to the high, both included, and below or above outside', () => {
    expect(checkPriceAtMinute(range, '64980')).toBe('inside');
    expect(checkPriceAtMinute(range, '65120.5')).toBe('inside');
    expect(checkPriceAtMinute(range, '65000.123456789')).toBe('inside');
    expect(checkPriceAtMinute(range, '6500')).toBe('below');
    expect(checkPriceAtMinute(range, '64979.99999999')).toBe('below');
    expect(checkPriceAtMinute(range, '65120.50000001')).toBe('above');
    expect(checkPriceAtMinute(range, 'abc')).toBeNull();
    expect(checkPriceAtMinute(range, '')).toBeNull();
  });

  it('reads the minute that holds the time, from Binance for crypto and OANDA for forex', async () => {
    const crypto = deps(() => answer([minuteCandle]));
    const minute = await readMarketMinute(crypto.value, { marketType: 'crypto', symbol: 'btcusdt', at: AT }, { nowMs: NOW });
    expect(crypto.acquireHistory.mock.calls[0]![0]).toMatchObject({ instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '1m', limit: 1, startTimeMs: Date.parse('2026-10-24T10:32:00.000Z') });
    expect(minute).toEqual({ ok: true, low: '64980', high: '65120.5', at: '2026-10-24T10:32:00.000Z', source: 'binance', market: 'BTCUSDT', midPrice: false });
    if (!minute.ok) return;
    expect(describeMarketMinute(minute)).toMatch(/^At \d\d:\d\d BTCUSDT traded between 64980 and 65120\.5 \(Binance, 1-minute candle\)\.$/);
    expect(describeTypo(minute, '6500')).toMatch(/^BTCUSDT did not trade at 6500 at \d\d:\d\d \(it traded between 64980 and 65120\.5\)\. Typo\?$/);
    const forex = deps(() => answer([{ ...minuteCandle, low: '1.16566', high: '1.16707' }]));
    const pair = await readMarketMinute(forex.value, { marketType: 'forex', symbol: 'EURUSD', at: AT }, { nowMs: NOW });
    expect(forex.acquireHistory.mock.calls[0]![0].instrument).toEqual({ venue: 'oanda-forex', symbol: 'EURUSD' });
    if (!pair.ok) throw new Error('forex minute');
    expect(describeMarketMinute(pair)).toMatch(/^At \d\d:\d\d EUR\/USD traded between 1\.16566 and 1\.16707 \(OANDA, 1-minute candle, mid prices\)\.$/);
  });

  it('says why there is no minute: a future time, no price, a market not listed, and the source\'s own reason', async () => {
    const say = async (history: () => MarketCandleHistoryResult, ask: { marketType: 'crypto' | 'forex'; symbol: string; at: string }) => {
      const minute = await readMarketMinute(deps(history).value, ask, { nowMs: NOW });
      if (minute.ok) throw new Error('expected no minute');
      return describeMarketMinuteFailure(minute as Extract<MarketMinute, { ok: false }>);
    };
    expect(await say(() => answer([minuteCandle]), { marketType: 'crypto', symbol: 'BTCUSDT', at: '2026-10-24T13:00:00.000Z' })).toEqual({ message: "That time hasn't happened yet.", retry: false });
    expect(await say(() => answer([]), { marketType: 'crypto', symbol: 'BTCUSDT', at: AT })).toEqual({ message: 'There is no market price for that minute. The market may have been closed.', retry: false });
    expect(await say(() => answer([]), { marketType: 'crypto', symbol: 'BTCUSTD', at: AT })).toEqual({ message: "Binance doesn't list BTCUSTD. Check the spelling, for example BTCUSDT.", retry: false });
    expect(await say(() => ({ ok: false, reason: 'unavailable', why: 'offline', retryAfterSeconds: null }), { marketType: 'crypto', symbol: 'BTCUSDT', at: AT }))
      .toEqual({ message: "The market price at that minute: you're offline. Try again when you're back online.", retry: true });
    expect(await say(() => ({ ok: false, reason: 'unavailable', why: 'not-set-up', retryAfterSeconds: null }), { marketType: 'forex', symbol: 'EURUSD', at: AT }))
      .toEqual({ message: "The market price at that minute: OANDA isn't connected to the Kairos server yet.", retry: false });
  });

  it('reads a datetime-local value in this device\'s time zone, and nothing else', () => {
    expect(localTimeToInstant('2026-10-24T10:32')).toBe(new Date('2026-10-24T10:32').toISOString());
    expect(localTimeToInstant('')).toBeNull();
    expect(localTimeToInstant('yesterday')).toBeNull();
  });

  it('review r1: a futures-only market reads its minute from Binance Futures; a market without a price reads nothing', async () => {
    const futures = deps(() => answer([minuteCandle]));
    expect(await readMarketMinute(futures.value, { marketType: 'futures', symbol: '1000PEPEUSDT', at: AT }, { nowMs: NOW })).toMatchObject({ ok: true, market: '1000PEPEUSDT' });
    expect(futures.acquireHistory.mock.calls[0]![0].instrument).toEqual({ venue: 'binance-usdm', symbol: '1000PEPEUSDT' });
    const stock = deps(() => answer([minuteCandle]));
    expect(await readMarketMinute(stock.value, { marketType: 'stock', symbol: 'AAPL', at: AT }, { nowMs: NOW })).toMatchObject({ ok: false, why: 'no-source' });
    expect(stock.acquireHistory).not.toHaveBeenCalled();
  });
});
