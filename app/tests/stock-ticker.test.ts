import { describe, expect, it } from 'vitest';
import { parseStockTicker, projectStockResultPerShare } from '../src/application/markets/stockTicker';
import { calculateTradeMetrics, decimalDivide, decimalMultiply } from '../src/domain/calculations';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord, TradeFeeId, TradeFeeRecord, TradeId, TradeSide } from '../src/domain/trades';

const tradeId = 'trade-1' as TradeId;
const at = '2026-09-20T10:00:00.000Z';
let n = 0;
const fill = (type: 'entry' | 'exit', price: string, quantity: string): TradeExecutionRecord =>
  ({ id: `x-${++n}` as TradeExecutionId, tradeId, type, price: price as DecimalString, quantity: quantity as DecimalString, executedAt: at, createdAt: at });
function metrics(side: TradeSide, executions: TradeExecutionRecord[], fees: TradeFeeRecord[] = []) {
  const result = fees.length ? calculateTradeMetrics(side, executions, undefined, fees, { grossPnlCurrency: 'USD' }) : calculateTradeMetrics(side, executions);
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

describe('T-044a stock tickers', () => {
  it('accepts tickers as brokers write them', () => {
    for (const [typed, ticker] of [
      ['AAPL', 'AAPL'], ['aapl', 'AAPL'], [' msft ', 'MSFT'], ['BRK.B', 'BRK.B'], ['brk-b', 'BRK-B'],
      ['7203', '7203'], ['7203.T', '7203.T'], ['130A.T', '130A.T'], ['VOD.L', 'VOD.L'], ['BT.A.L', 'BT.A.L'], ['0700.HK', '0700.HK'],
      ['SHOP.TO', 'SHOP.TO'], ['005930.KS', '005930.KS'], ['BAJAJ-AUTO.NS', 'BAJAJ-AUTO.NS'], ['M&M.NS', 'M&M.NS'], ['A', 'A'], ['A'.repeat(20), 'A'.repeat(20)],
    ]) {
      const result = parseStockTicker(typed);
      expect(result).toEqual({ ok: true, ticker });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('refuses anything that is not a ticker', () => {
    for (const typed of ['', '   ']) expect(parseStockTicker(typed)).toEqual({ ok: false, reason: 'ticker-required' });
    for (const typed of ['NASDAQ:AAPL', 'AAPL US', '$AAPL', 'AAPL!', 'EUR/USD', 'BRK/B', '.AAPL', 'AAPL.', 'BRK..B', 'BRK.-B', '-AB', 'ÄPPL', 'A'.repeat(21)]) {
      const result = parseStockTicker(typed);
      expect(result).toEqual({ ok: false, reason: 'not-a-ticker' });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('gives what a closed trade won or lost per share', () => {
    const aapl = metrics('long', [fill('entry', '187.5', '10'), fill('exit', '190', '10')]);
    expect(projectStockResultPerShare(aapl)).toBe('2.5');
    const product = decimalMultiply('2.5', '10');
    expect(product.ok && product.value).toBe(aapl.grossPnl);
    expect(aapl.grossPnl).toBe('25');
    expect(projectStockResultPerShare(metrics('short', [fill('entry', '2500', '100'), fill('exit', '2487.5', '100')]))).toBe('12.5');
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '400', '0.5'), fill('exit', '390.2', '0.5')]))).toBe('-9.8');
    const thirds = decimalDivide('0.04', '3');
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '10', '3'), fill('exit', '10.01', '1'), fill('exit', '10.01', '1'), fill('exit', '10.02', '1')]))).toBe(thirds.ok ? thirds.value : null);
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '100', '1'), fill('entry', '103', '2'), fill('exit', '104', '3')]))).toBe('2');
    const fee = { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: '1' as DecimalString, currency: 'USD', createdAt: at } as TradeFeeRecord;
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '187.5', '10'), fill('exit', '190', '10')], [fee]))).toBe('2.5');
  });

  it('gives nothing for an open, partly closed or empty trade', () => {
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '187.5', '10')]))).toBeNull();
    expect(projectStockResultPerShare(metrics('long', [fill('entry', '187.5', '10'), fill('exit', '190', '4')]))).toBeNull();
    expect(projectStockResultPerShare(metrics('long', []))).toBeNull();
  });
});
