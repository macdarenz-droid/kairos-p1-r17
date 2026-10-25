import { describe, expect, it } from 'vitest';
import {
  checkTypedCryptoSymbol, FOREX_MARKET_OPTIONS, searchableCryptoMarkets, searchMarketSymbols, SYMBOL_SEARCH_MAX_RESULTS,
} from '../src/application/market-reference/symbolSearch';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const fact = (baseAsset: string, quoteAsset: string, tradingEnabled = true, venue = 'binance-spot'): LiveMarketUniverseInstrumentMetadataFact =>
  ({ instrument: { venue, symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled }) as LiveMarketUniverseInstrumentMetadataFact;
const crypto = [fact('ETH', 'BTC'), fact('SOL', 'USDT'), fact('BTC', 'FDUSD'), fact('BTC', 'USDT'), fact('ETH', 'USDT')];
const symbols = (query: string, marketType: '' | 'crypto' | 'forex' | 'stock' = 'crypto') => searchMarketSymbols(query, { marketType, crypto }).map(row => row.symbol);

describe('T-059a searching markets by what a trader types', () => {
  it('finds crypto by ticker, base asset and the spellings Kairos reads, USDT pairs first', () => {
    expect(symbols('eth')).toEqual(['ETHUSDT', 'ETHBTC']);
    expect(symbols('btc/usdt')).toEqual(['BTCUSDT']);
    expect(symbols('XBTUSD')).toEqual(['BTCUSDT']);
    expect(symbols('btcusdt.p')).toEqual(['BTCUSDT']);
    expect(symbols('')).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BTCFDUSD', 'ETHBTC']);
    expect(symbols('xyz')).toEqual([]);
    const many = Array.from({ length: 120 }, (_, index) => fact(`A${String(index).padStart(3, '0')}`, 'USDT'));
    expect(searchMarketSymbols('', { marketType: 'crypto', crypto: many })).toHaveLength(SYMBOL_SEARCH_MAX_RESULTS);
  });

  it('lists the forex pairs with their names, by letters or by name', () => {
    expect(FOREX_MARKET_OPTIONS).toHaveLength(30);
    expect(searchMarketSymbols('eurusd', { marketType: 'forex', crypto })).toEqual([{ symbol: 'EURUSD', marketType: 'forex', quoteAsset: 'USD', label: 'EUR/USD · Euro / US dollar' }]);
    expect(symbols('gold', 'forex')).toEqual(['XAUUSD']);
    expect(symbols('yen', 'forex')).toEqual(['EURJPY', 'GBPJPY', 'AUDJPY', 'NZDJPY', 'USDJPY', 'CADJPY', 'CHFJPY']);
  });

  it('follows the chosen market: both lists with none, no list for stocks', () => {
    const rows = searchMarketSymbols('eur', { marketType: '', crypto: [...crypto, fact('EUR', 'USDT')] });
    expect(rows[0]).toEqual({ symbol: 'EURUSDT', marketType: 'crypto', quoteAsset: 'USDT', label: 'EURUSDT · EUR/USDT' });
    expect(rows.slice(1).every(row => row.marketType === 'forex')).toBe(true);
    expect(symbols('aapl', 'stock')).toEqual([]);
  });

  it('keeps only Binance Spot markets open for trading, each symbol once', () => {
    const listed = searchableCryptoMarkets([fact('BTC', 'USDT'), fact('LUNA', 'USDT', false), fact('ETH', 'USDT', true, 'binance-usdm-futures'), fact('ETH', 'USDT')]);
    expect(listed.map(item => item.instrument.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('says what a typed symbol is on the list, never changing it', () => {
    expect(checkTypedCryptoSymbol('btcusdt', crypto)).toEqual({ kind: 'listed', symbol: 'BTCUSDT', quote: 'USDT' });
    expect(checkTypedCryptoSymbol('BTC/USDT', crypto)).toEqual({ kind: 'listed', symbol: 'BTCUSDT', quote: 'USDT' });
    expect(checkTypedCryptoSymbol('XBTUSD', crypto)).toEqual({ kind: 'near', symbol: 'BTCUSDT', quote: 'USDT' });
    expect(checkTypedCryptoSymbol('BTCUSTD', crypto)).toEqual({ kind: 'not-listed', note: "Binance doesn't list BTCUSTD. Check the spelling, for example BTCUSDT. You can still save." });
    expect(checkTypedCryptoSymbol('  ', crypto)).toEqual({ kind: 'empty' });
  });

  it('T-059b finds a coin by its name when the names list is there, and says the name; without it, ticker only', () => {
    const names = new Map([['BTC', 'Bitcoin'], ['ETH', 'Ethereum']]);
    const rows = searchMarketSymbols('bitcoin', { marketType: 'crypto', crypto, names });
    expect(rows.map(row => row.label)).toEqual(['BTCUSDT · Bitcoin', 'BTCFDUSD · Bitcoin']);
    expect(searchMarketSymbols('bitcoin', { marketType: 'crypto', crypto, names: null })).toEqual([]);
    expect(searchMarketSymbols('sol', { marketType: 'crypto', crypto, names }).map(row => row.label)).toEqual(['SOLUSDT · SOL/USDT']);
    expect(searchMarketSymbols('b', { marketType: 'crypto', crypto, names }).map(row => row.symbol)).toEqual(['BTCUSDT', 'BTCFDUSD', 'ETHBTC']);
  });
});

