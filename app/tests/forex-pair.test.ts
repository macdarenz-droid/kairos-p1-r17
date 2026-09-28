import { describe, expect, it } from 'vitest';
import { FOREX_MAJOR_CURRENCIES, parseForexPair, projectForexPips, projectForexPipValue, projectForexSize, type ForexPair } from '../src/application/markets/forexPair';
import { calculateTradeMetrics, decimalMultiply } from '../src/domain/calculations';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord, TradeId, TradeSide } from '../src/domain/trades';

const pair = (symbol: string): ForexPair => {
  const result = parseForexPair(symbol);
  if (!result.ok) throw new Error(result.reason);
  return result.pair;
};
const d = (value: string) => value as DecimalString;

describe('T-043a currency pairs', () => {
  it('reads a pair however it is typed', () => {
    for (const typed of ['EURUSD', 'eur/usd', 'EUR-USD', ' eur usd ']) {
      expect(parseForexPair(typed)).toEqual({ ok: true, pair: { symbol: 'EURUSD', base: 'EUR', quote: 'USD', quoteKnown: true, label: 'EUR/USD', standard: true, pipSize: '0.0001' } });
    }
    for (const symbol of ['USDJPY', 'GBPJPY', 'CHFJPY']) expect(pair(symbol)).toMatchObject({ pipSize: '0.01', quoteKnown: true });
    for (const symbol of ['NZDCAD', 'CADCHF']) expect(pair(symbol)).toMatchObject({ standard: true, pipSize: '0.0001', quoteKnown: true });
  });

  it('knows exactly the 28 standard pairs, in quoting order', () => {
    let count = 0;
    FOREX_MAJOR_CURRENCIES.forEach((base, i) => FOREX_MAJOR_CURRENCIES.forEach((quote, j) => {
      if (i >= j) return;
      count += 1;
      expect(pair(base + quote).standard).toBe(true);
      expect(pair(quote + base)).toMatchObject({ standard: false, pipSize: null, quoteKnown: true });
    }));
    expect(count).toBe(28);
  });

  it('keeps other pairs as pairs without pips, and never takes a non-currency as the quote', () => {
    expect(pair('XAUUSD')).toMatchObject({ quote: 'USD', standard: false, pipSize: null, quoteKnown: true });
    expect(pair('USDTRY')).toMatchObject({ quote: 'TRY', standard: false, pipSize: null, quoteKnown: false });
    expect(pair('SILVER')).toMatchObject({ base: 'SIL', quote: 'VER', standard: false, pipSize: null, quoteKnown: false });
    for (const symbol of ['EURUSDT', 'EUR', '', 'EURUSD.A', 'EURUSDm', 'EUR1SD']) expect(parseForexPair(symbol)).toEqual({ ok: false, reason: 'not-a-pair' });
    expect(parseForexPair('EUREUR')).toEqual({ ok: false, reason: 'same-currency' });
    const result = parseForexPair('EURUSD');
    expect(Object.isFrozen(result) && result.ok && Object.isFrozen(result.pair)).toBe(true);
    expect(Object.isFrozen(parseForexPair('EUR'))).toBe(true);
    expect(Object.isFrozen(parseForexPair('EUREUR'))).toBe(true);
  });

  it('gives lots for a size in units', () => {
    const eurusd = pair('EURUSD');
    expect(projectForexSize(eurusd, '10000')).toEqual({ units: '10000', lots: '0.1', belowMicroLot: false });
    expect(projectForexSize(eurusd, '100000')?.lots).toBe('1');
    expect(projectForexSize(eurusd, '1000')).toMatchObject({ lots: '0.01', belowMicroLot: false });
    expect(projectForexSize(eurusd, '999')).toMatchObject({ lots: '0.00999', belowMicroLot: true });
    expect(projectForexSize(eurusd, '0.5')).toMatchObject({ lots: '0.000005', belowMicroLot: true });
    for (const bad of ['0', '-5', 'abc', '']) expect(projectForexSize(eurusd, bad)).toBeNull();
    expect(projectForexSize(pair('XAUUSD'), '10000')).toBeNull();
    expect(Object.isFrozen(projectForexSize(eurusd, '10000'))).toBe(true);
  });

  it('gives the value of 1 pip', () => {
    expect(projectForexPipValue(pair('EURUSD'), d('10000'))).toBe('1');
    expect(projectForexPipValue(pair('EURUSD'), d('12345'))).toBe('1.2345');
    expect(projectForexPipValue(pair('USDJPY'), d('100000'))).toBe('1000');
    expect(projectForexPipValue(pair('USDJPY'), d('20000'))).toBe('200');
    expect(projectForexPipValue(pair('XAUUSD'), d('10000'))).toBeNull();
  });

  it('gives the pips won or lost', () => {
    expect(projectForexPips(pair('EURUSD'), 'long', d('1.085'), d('1.09'))).toBe('50');
    expect(projectForexPips(pair('EURUSD'), 'short', d('1.085'), d('1.09'))).toBe('-50');
    expect(projectForexPips(pair('USDJPY'), 'short', d('150.25'), d('149.8'))).toBe('45');
    expect(projectForexPips(pair('GBPUSD'), 'long', d('1.2710'), d('1.26955'))).toBe('-14.5');
    expect(projectForexPips(pair('EURUSD'), 'long', d('1.085034'), d('1.085'))).toBe('-0.34');
    expect(projectForexPips(pair('XAUUSD'), 'long', d('1'), d('2'))).toBeNull();
  });

  it('pips times the value of 1 pip is the result before fees', () => {
    const fill = (type: 'entry' | 'exit', price: string, quantity: string): TradeExecutionRecord =>
      ({ id: `${type}-${price}` as TradeExecutionId, tradeId: 't' as TradeId, type, price: d(price), quantity: d(quantity), executedAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-20T10:00:00.000Z' });
    const cases: [string, TradeSide, string, string, string, string][] = [
      ['EURUSD', 'long', '10000', '1.085', '1.09', '50'],
      ['USDJPY', 'short', '20000', '150.25', '149.8', '9000'],
      ['GBPUSD', 'long', '5000', '1.2710', '1.26955', '-7.25'],
    ];
    for (const [symbol, side, units, entry, exit, gross] of cases) {
      const p = pair(symbol);
      const pips = projectForexPips(p, side, d(entry), d(exit))!;
      const value = projectForexPipValue(p, d(units))!;
      const product = decimalMultiply(pips, value);
      const metrics = calculateTradeMetrics(side, [fill('entry', entry, units), fill('exit', exit, units)]);
      if (!product.ok || !metrics.ok) throw new Error('fixture');
      expect(product.value).toBe(gross);
      expect(metrics.value.grossPnl).toBe(gross);
    }
  });
});
