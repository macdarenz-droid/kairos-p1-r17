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
    expect(result).toEqual({ ok: true, price: '0.00001234', at: '2026-10-24T10:32:00.000Z', source: 'binance', market: 'PEPEUSDT', midPrice: false, futures: false, quote: 'USDT' });
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
    expect(result).toEqual({ ok: true, price: '1.16682', at: '2026-10-24T10:31:00.000Z', source: 'oanda', market: 'EUR/USD', midPrice: true, futures: false, quote: 'USD' });
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
    // Review r1: it never fills by itself, so the words never promise a read on their own.
    expect(describePriceNowFailure(offline)).toEqual({ message: "Price now: you're offline. Try again when you're back online.", retry: true });
    const oanda = await readPriceNow(deps(() => ({ ok: false, reason: 'unavailable', why: 'not-set-up', retryAfterSeconds: null })).value, { marketType: 'forex', symbol: 'EURUSD' }, { nowMs: NOW });
    if (oanda.ok) return;
    expect(describePriceNowFailure(oanda)).toEqual({ message: "Price now: OANDA isn't connected to the Kairos server yet.", retry: false });
    const thrown = await readPriceNow(deps(() => { throw new Error('boom'); }).value, { marketType: 'crypto', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(thrown).toMatchObject({ ok: false, why: 'source-down' });
  });

  it('review r1: forex takes the last finished minute, never the open one', async () => {
    const { value } = deps(() => answer(candle('2026-10-24T10:31:00.000Z', '1.16682'), candle('2026-10-24T10:32:00.000Z', '1.16690')));
    expect(await readPriceNow(value, { marketType: 'forex', symbol: 'EURUSD' }, { nowMs: NOW })).toMatchObject({ ok: true, price: '1.16682', at: '2026-10-24T10:31:00.000Z' });
  });

  it('review r1: a futures-only market reads Binance Futures by its name, as the trade picture does (D171)', async () => {
    const { value, acquireHistory } = deps(() => answer(candle('2026-10-24T10:32:00.000Z', '0.0123')));
    expect(await readPriceNow(value, { marketType: 'futures', symbol: '1000PEPEUSDT' }, { nowMs: NOW })).toMatchObject({ ok: true, price: '0.0123', market: '1000PEPEUSDT', source: 'binance' });
    expect(acquireHistory.mock.calls[0]![0].instrument).toEqual({ venue: 'binance-usdm', symbol: '1000PEPEUSDT' });
    const missing = await readPriceNow(deps(() => ({ ok: false, reason: 'unavailable', why: 'unknown-market', retryAfterSeconds: null })).value, { marketType: 'futures', symbol: '1000PEPEUSDT' }, { nowMs: NOW });
    if (missing.ok) throw new Error('expected no price');
    expect(describePriceNowFailure(missing)).toEqual({ message: "Price now: Binance Spot and Futures don't list 1000PEPEUSDT. Check the spelling, for example BTCUSDT.", retry: false });
  });

  it('review r1: says no-source for a market without a price and invalid-symbol for no symbol, and reads nothing', async () => {
    for (const [marketType, symbol] of [['stock', 'AAPL'], ['options', 'AAPL240119C00150000'], ['other', 'GOLDCOIN'], ['forex', 'GOLD']] as const) {
      const { value, acquireHistory } = deps(() => answer());
      expect(await readPriceNow(value, { marketType, symbol }, { nowMs: NOW }), symbol).toMatchObject({ ok: false, why: 'no-source' });
      expect(acquireHistory).not.toHaveBeenCalled();
    }
    const blank = await readPriceNow(deps(() => answer()).value, { marketType: 'crypto', symbol: ' ' }, { nowMs: NOW });
    expect(blank).toMatchObject({ ok: false, why: 'invalid-symbol' });
    if (blank.ok) return;
    expect(describePriceNowFailure(blank)).toEqual({ message: 'Price now: type a symbol first.', retry: false });
  });

  it('review r2: a futures trade says Binance Futures, and reads Binance Spot once when there are no futures candles', async () => {
    const futures = await readPriceNow(deps(() => answer(candle('2026-10-24T10:32:00.000Z', '65010'))).value, { marketType: 'futures', symbol: 'BTCUSDT' }, { nowMs: NOW });
    if (!futures.ok) throw new Error('futures price');
    expect(describePriceNowSource(futures)).toMatch(/^Binance Futures · BTCUSDT · \d\d:\d\d$/);
    const { value, acquireHistory } = deps(request => (request.instrument.venue === 'binance-usdm'
      ? { ok: false, reason: 'invalid-request', detail: 'no futures' } as MarketCandleHistoryResult
      : answer(candle('2026-10-24T10:32:00.000Z', '65000'))));
    const spot = await readPriceNow(value, { marketType: 'futures', symbol: 'BTCUSDT' }, { nowMs: NOW });
    expect(acquireHistory.mock.calls.map(call => call[0].instrument.venue)).toEqual(['binance-usdm', 'binance-spot']);
    expect(spot).toMatchObject({ ok: true, price: '65000', futures: false });
  });

  it("T-061c gives the price's quote currency: the Binance pair's, a forex pair's when Kairos knows it, else none", async () => {
    const quoteOf = async (marketType: 'crypto' | 'futures' | 'forex', symbol: string, markets?: LiveMarketUniverseInstrumentMetadataFact[]) => {
      const result = await readPriceNow(deps(() => answer(candle('2026-10-24T10:31:00.000Z', '1.5')), markets).value, { marketType, symbol }, { nowMs: NOW });
      if (!result.ok) throw new Error(`no price for ${symbol}`);
      return result.quote;
    };
    expect(await quoteOf('crypto', 'BTCUSDT')).toBe('USDT');
    expect(await quoteOf('crypto', 'ETHBTC', [fact('ETH', 'BTC')])).toBe('BTC');
    expect(await quoteOf('futures', 'BTCUSDT')).toBe('USDT');
    expect(await quoteOf('forex', 'EUR/USD')).toBe('USD');
    expect(await quoteOf('forex', 'XAUUSD')).toBe('USD');
    // CNH is not one of the eight currencies Kairos knows, so the pair's quote is not taken as a currency.
    expect(await quoteOf('forex', 'USDCNH')).toBeNull();
    // A futures-only market is read by its name alone: Kairos does not know its quote.
    expect(await quoteOf('futures', '1000PEPEUSDT')).toBeNull();
  });
});
