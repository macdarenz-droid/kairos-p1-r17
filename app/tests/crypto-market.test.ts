import { describe, expect, it } from 'vitest';
import { describeCandleSource, describeFuturesOnlyNotListed, describeFuturesOnlySource, futuresOnlyMarket, matchCryptoMarket, type CryptoMarketMatch } from '../src/application/market-reference';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';
import type { MarketCandleOrigin } from '../src/services/market-data/MarketCandleHistoryPort';

const fact = (symbol: string, baseAsset: string, quoteAsset: string): LiveMarketUniverseInstrumentMetadataFact =>
  ({ instrument: { venue: 'binance-spot', symbol }, baseAsset, quoteAsset, tradingEnabled: true });
const LIST = [
  fact('BTCUSDT', 'BTC', 'USDT'),
  fact('ETHBTC', 'ETH', 'BTC'),
  fact('PERPUSDT', 'PERP', 'USDT'),
  fact('币安人生USDT', '币安人生', 'USDT'),
  fact('BTCUSDC', 'BTC', 'USDC'),
];
const match = (typed: string, marketType: Parameters<typeof matchCryptoMarket>[1] = 'crypto') => matchCryptoMarket(typed, marketType, LIST);

describe('P16.A1.5 matching a typed crypto symbol to a Binance market', () => {
  it('matches the listed symbol exactly, as spot, with no note', () => {
    expect(match('BTCUSDT')).toEqual({ ok: true, symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', candles: 'spot', how: ['exact'], note: null });
  });

  it('joins base and quote around one separator and says so', () => {
    for (const typed of ['btc/usdt', 'BTC-USDT', 'btc_usdt', 'BTC:USDT']) {
      expect(match(typed), typed).toEqual({ ok: true, symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', candles: 'spot', how: ['separators'], note: `Matched ${typed} to BTC/USDT on Binance.` });
    }
  });

  it('reads USD as USDT only when Binance has no USD market, and XBT as BTC', () => {
    expect(match('BTC/USD')).toEqual({
      ok: true, symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', candles: 'spot', how: ['separators', 'usd-as-usdt'],
      note: 'Matched BTC/USD to BTC/USDT on Binance. Binance has no BTC/USD market, so Kairos shows BTC/USDT (USDT is a dollar stablecoin).',
    });
    expect(match('XBTUSD')).toMatchObject({ ok: true, symbol: 'BTCUSDT', how: ['xbt-is-btc', 'usd-as-usdt'] });
    expect(match('XBT/USDT')).toMatchObject({ ok: true, symbol: 'BTCUSDT', how: ['separators', 'xbt-is-btc'], note: 'Matched XBT/USDT to BTC/USDT on Binance.' });
    const withUsd = matchCryptoMarket('BTC/USD', 'crypto', [...LIST, fact('BTCUSD', 'BTC', 'USD')]);
    expect(withUsd).toMatchObject({ ok: true, symbol: 'BTCUSD', how: ['separators'] });
  });

  it('removes a perpetual mark and asks for futures candles, but keeps a coin named PERP', () => {
    expect(match('BTCUSDT.P')).toEqual({ ok: true, symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', candles: 'usdm-futures', how: ['perpetual-mark'], note: 'Matched BTCUSDT.P to BTC/USDT on Binance. Futures candles.' });
    for (const typed of ['BTCUSDTPERP', 'BTC-USDT-PERP', 'btcusdt.perp', 'BTCUSDT_PERP']) {
      expect(match(typed), typed).toMatchObject({ ok: true, symbol: 'BTCUSDT', candles: 'usdm-futures' });
    }
    expect(match('PERPUSDT')).toEqual({ ok: true, symbol: 'PERPUSDT', base: 'PERP', quote: 'USDT', candles: 'spot', how: ['exact'], note: null });
  });

  it('asks for futures candles for a futures trade, matches a CJK symbol exactly, and explains a miss', () => {
    expect(match('BTCUSDT', 'futures')).toMatchObject({ ok: true, candles: 'usdm-futures', how: ['exact'], note: null });
    expect(match('币安人生USDT')).toMatchObject({ ok: true, symbol: '币安人生USDT', how: ['exact'] });
    expect(match('DOGE/EUR')).toEqual({ ok: false, why: 'not-listed', note: "Binance doesn't list DOGE/EUR. Check the spelling, for example BTCUSDT." });
    expect(match('  ')).toEqual({ ok: false, why: 'empty', note: 'Type a market, for example BTCUSDT.' });
  });

  it('only matches markets on the Binance Spot list', () => {
    const other = [{ ...fact('SOLUSDT', 'SOL', 'USDT'), instrument: { venue: 'okx', symbol: 'SOLUSDT' } }];
    expect(matchCryptoMarket('SOLUSDT', 'crypto', other)).toMatchObject({ ok: false, why: 'not-listed' });
  });
});

describe('P16.A1.5 the candle source line', () => {
  const btc = match('BTCUSDT') as CryptoMarketMatch;
  const origin = (provider: MarketCandleOrigin['provider'], market: MarketCandleOrigin['market'], backup: MarketCandleOrigin['backup'] = null): MarketCandleOrigin =>
    ({ provider, market, symbol: provider === 'okx' ? 'BTC-USDT' : 'BTCUSDT', backup });

  it('names the place and the pair, and why a backup answered', () => {
    expect(describeCandleSource(undefined, btc, 'spot')).toBe('Candles: Binance Spot · BTC/USDT');
    expect(describeCandleSource(origin('binance', 'spot'), btc, 'spot')).toBe('Candles: Binance Spot · BTC/USDT');
    expect(describeCandleSource(origin('binance', 'usdm-futures'), btc, 'usdm-futures')).toBe('Candles: Binance Futures · BTC/USDT');
    expect(describeCandleSource(origin('okx', 'spot', 'refused'), btc, 'spot')).toBe("Candles: OKX Spot · BTC/USDT · Binance isn't available in your region");
    expect(describeCandleSource(origin('okx', 'perpetual-swap', 'busy'), btc, 'usdm-futures')).toBe('Candles: OKX Futures · BTC/USDT · Binance was busy');
    expect(describeCandleSource(origin('okx', 'perpetual-swap', 'down'), btc, 'usdm-futures')).toBe("Candles: OKX Futures · BTC/USDT · Binance didn't answer");
  });

  it('says when futures candles were asked for but spot candles came', () => {
    expect(describeCandleSource(origin('binance', 'spot'), btc, 'usdm-futures')).toBe('Candles: Binance Spot · BTC/USDT · no futures candles for this market');
    expect(describeCandleSource(undefined, btc, 'usdm-futures')).toBe('Candles: Binance Spot · BTC/USDT · futures candles need the Kairos server');
  });
});

describe('T-048f D171 futures markets on no spot list', () => {
  it('reads the futures name only for a futures trade or a perpetual mark', () => {
    expect(futuresOnlyMarket('1000PEPEUSDT.P', 'crypto')).toBe('1000PEPEUSDT');
    expect(futuresOnlyMarket('1000pepe/usdt', 'futures')).toBe('1000PEPEUSDT');
    expect(futuresOnlyMarket('1000PEPEUSDT', 'crypto')).toBeNull();
    expect(futuresOnlyMarket('币安人生USDT', 'futures')).toBeNull();
  });

  it('names the futures market whole, and says when neither list has it', () => {
    expect(describeFuturesOnlySource('1000PEPEUSDT')).toBe('Candles: Binance Futures · 1000PEPEUSDT');
    expect(describeFuturesOnlyNotListed(' 1000pepeusdt ')).toBe("Binance Spot and Futures don't list 1000pepeusdt. Check the spelling, for example BTCUSDT.");
  });
});
