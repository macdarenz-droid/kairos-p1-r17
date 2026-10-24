import { describe, expect, it, vi } from 'vitest';
import { describePriceNowFailure, describePriceNowSource, hasPriceNow, readPriceNow, type PriceNowDeps } from '../src/application/market-reference/priceNow';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const NOW = Date.parse('2026-10-24T10:32:40.000Z');
const fact = (baseAsset: string, quoteAsset: string): LiveMarketUniverseInstrumentMetadataFact =>
  ({ instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true }) as LiveMarketUniverseInstrumentMetadataFact;
const candle = (openTime: string, close: string) => ({ openTime, closeTime: openTime.replace(':00.000Z', ':59.999Z'), open: close, high: close, low: close, close, volume: '1' });
const answer = (...candles: ReturnType<typeof candle>[]) => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', observedAt: '2026-10-24T10:32:40.000Z', candles } }) as unknown as MarketCandleHistoryResult;

function deps(history: (request: MarketCandleHistoryRequest) => MarketCandleHistoryResult, markets = [fact('BTC', 'USDT'), fact('PEPE', 'USDT')]) {
  const acquireHistory = vi.fn(async (request: MarketCandleHistoryRequest) => history(request));
  const value: PriceNowDeps = { venue: 'binance-spot', history: { acquireHistory }, metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts: markets })) } };
  return { value, acquireHistory };
}

describe('T-059c the price now', () => {
  it('reads the open minute of a crypto market and keeps its close as text, with where it came from', async () => {
    const { value, acquireHistory } = deps(() => answer(candle('2026-10-24T10:31:00.000Z', '65000.5'), candle('2026-10-24T10:32:00.000Z', '0.00001234')));
    const result = await readPriceNow(value, { marketType: 'crypto', symbol: 'pepeusdt' }, { nowMs: NOW });
    expect(acquireHistory.mock.calls[0]![0]).toEqual({
      instrument: { venue: 'binance-spot', symbol: 'PEPEUSDT' }, interval: '1m', limit: 6,
      startTimeMs: Date.parse('2026-10-24T10:27:00.000Z'), endTimeMs: NOW, pair: { base: 'PEPE', quote: 'USDT' },
    });
    expect(result).toEqual({ ok: true, price: '0.00001234', at: '2026-10-24T10:32:00.000Z', source: 'binance', market: 'PEPEUSDT', midPrice: false });
    if (!result.ok) return;
    expect(describePriceNowSource(result)).toMatch(/^Binance · PEPEUSDT · \d\d:\d\d$/);
  });

  it('asks futures candles for a futures trade', async () => {
    const { value, acquireHistory } = deps(() => answer(candle('2026-10-24T10:32:00.000Z', '65010')));
    await readPriceNow(value, { marketType: 'futures', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(acquireHistory.mock.calls[0]![0].instrument).toEqual({ venue: 'binance-usdm', symbol: 'BTCUSDT' });
  });

  it('reads forex and metals from OANDA as mid prices, without the market list', async () => {
    const { value, acquireHistory } = deps(() => answer(candle('2026-10-24T10:31:00.000Z', '1.16682')));
    const result = await readPriceNow(value, { marketType: 'forex', symbol: 'EUR/USD' }, { nowMs: NOW });
    expect(acquireHistory.mock.calls[0]![0].instrument).toEqual({ venue: 'oanda-forex', symbol: 'EURUSD' });
    expect(acquireHistory.mock.calls[0]![0].pair).toBeUndefined();
    expect(value.metadata.acquireInstrumentMetadata).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, price: '1.16682', at: '2026-10-24T10:31:00.000Z', source: 'oanda', market: 'EUR/USD', midPrice: true });
    if (!result.ok) return;
    expect(describePriceNowSource(result)).toMatch(/^OANDA · EUR\/USD · mid price · \d\d:\d\d$/);
  });

  it('offers no price for stocks, a forex symbol that is not a pair, or no symbol', () => {
    expect(hasPriceNow('stock', 'AAPL')).toBe(false);
    expect(hasPriceNow('forex', 'GOLD')).toBe(false);
    expect(hasPriceNow('crypto', ' ')).toBe(false);
    expect(hasPriceNow('', 'BTCUSDT')).toBe(false);
    expect(hasPriceNow('crypto', 'BTCUSDT')).toBe(true);
    expect(hasPriceNow('forex', 'XAUUSD')).toBe(true);
  });

  it('says why there is no price: not listed, no candles, the source\'s own reason, and a failed read', async () => {
    const notListed = await readPriceNow(deps(() => answer()).value, { marketType: 'crypto', symbol: 'BTCUSTD' }, { nowMs: NOW });
    expect(notListed).toMatchObject({ ok: false, why: 'not-listed' });
    if (notListed.ok) return;
    expect(describePriceNowFailure(notListed)).toEqual({ message: "Price now: Binance doesn't list BTCUSTD. Check the spelling, for example BTCUSDT.", retry: false });
    const empty = await readPriceNow(deps(() => answer()).value, { marketType: 'crypto', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(empty).toMatchObject({ ok: false, why: 'no-candles' });
    if (empty.ok) return;
    expect(describePriceNowFailure(empty)).toEqual({ message: 'Price now: no price in the last few minutes. Try again in a moment.', retry: true });
    const offline = await readPriceNow(deps(() => ({ ok: false, reason: 'unavailable', why: 'offline', retryAfterSeconds: null })).value, { marketType: 'crypto', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(offline).toMatchObject({ ok: false, why: 'offline' });
    if (offline.ok) return;
    expect(describePriceNowFailure(offline).message).toBe("Price now: you're offline. Kairos will try again when you're back online.");
    const oanda = await readPriceNow(deps(() => ({ ok: false, reason: 'unavailable', why: 'not-set-up', retryAfterSeconds: null })).value, { marketType: 'forex', symbol: 'EURUSD' }, { nowMs: NOW });
    if (oanda.ok) return;
    expect(describePriceNowFailure(oanda)).toEqual({ message: "Price now: OANDA isn't connected to the Kairos server yet.", retry: false });
    const thrown = await readPriceNow(deps(() => { throw new Error('boom'); }).value, { marketType: 'crypto', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(thrown).toMatchObject({ ok: false, why: 'source-down' });
  });
});
