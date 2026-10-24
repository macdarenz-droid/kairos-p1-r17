import { describe, expect, it } from 'vitest';
import { candleCloseMs, compareDecimalText, isDecimalText, isMarketSymbol, isoFromEpochMs, longestCandleMs } from '../src/market/marketValues';

describe('market text checks', () => {
  it('compares decimal text exactly', () => {
    expect(compareDecimalText('1.10', '1.1')).toBe(0);
    expect(compareDecimalText('0.009', '0.01')).toBe(-1);
    expect(compareDecimalText('10', '9.99')).toBe(1);
    expect(compareDecimalText('0', '0.0')).toBe(0);
    expect(compareDecimalText('007.5', '7.50')).toBe(0);
    expect(compareDecimalText('0.12', '0.1')).toBe(1);
  });

  it('knows a market symbol', () => {
    for (const symbol of ['BTCUSDT', '币安人生USDT', 'A'.repeat(20)]) expect(isMarketSymbol(symbol), symbol).toBe(true);
    for (const symbol of ['btcusdt', 'BTC/USDT', '', 'A'.repeat(21), 42]) expect(isMarketSymbol(symbol), String(symbol)).toBe(false);
  });

  it('knows decimal text, and a positive one', () => {
    expect(isDecimalText('84403.98000000')).toBe(true);
    expect(isDecimalText('0.00000000')).toBe(true);
    expect(isDecimalText('0.00000000', { positive: true })).toBe(false);
    expect(isDecimalText('0.00001000', { positive: true })).toBe(true);
    for (const text of ['1e5', '-1', '.5', '5.', '', 5]) expect(isDecimalText(text), String(text)).toBe(false);
  });

  it('turns epoch ms into ISO text only for a safe whole instant', () => {
    expect(isoFromEpochMs(1790379214012)).toBe('2026-09-25T23:33:34.012Z');
    for (const ms of [-1, 1.5, 8_640_000_000_000_001, '1', Number.NaN]) expect(isoFromEpochMs(ms), String(ms)).toBeNull();
  });

  it('gives a candle its close time and longest length', () => {
    expect(candleCloseMs(Date.parse('2026-02-01T00:00:00Z'), '1M')).toBe(Date.parse('2026-02-28T23:59:59.999Z'));
    expect(candleCloseMs(Date.parse('2026-12-01T00:00:00Z'), '1M')).toBe(Date.parse('2026-12-31T23:59:59.999Z'));
    expect(candleCloseMs(Date.parse('2026-09-26T00:00:00Z'), '1h')).toBe(Date.parse('2026-09-26T00:59:59.999Z'));
    expect(longestCandleMs('1M')).toBe(31 * 86_400_000);
    expect(longestCandleMs('3d')).toBe(3 * 86_400_000);
  });
});
