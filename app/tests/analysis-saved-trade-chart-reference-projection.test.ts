import { describe, expect, it } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import {
  createTradeDomainId,
  parseDecimalString,
  type TradeExecutionId,
  type TradeId,
  type TradePlanId,
} from '../src/domain/trades';
import { projectAnalysisSavedTradeChartReference } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = createTradeDomainId<TradeId>();
const planId = createTradeDomainId<TradePlanId>();
const entryId = createTradeDomainId<TradeExecutionId>();
const exitId = createTradeDomainId<TradeExecutionId>();
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;

function journalEntry(overrides: Partial<JournalHistoryEntry['trade']> = {}): JournalHistoryEntry {
  const trade = {
    id: tradeId,
    symbol: 'ETHUSDT',
    marketType: 'crypto' as const,
    side: 'long' as const,
    status: 'closed' as const,
    source: 'manual' as const,
    grossPnlCurrency: 'USDT',
    openedAt: '2026-09-01T01:00:00Z',
    closedAt: '2026-09-01T03:00:00Z',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T03:00:00Z',
    ...overrides,
  };
  return {
    trade,
    plans: [{
      id: planId,
      tradeId,
      plannedEntryPrice: decimal('2000.25'),
      plannedStopPrice: decimal('1950'),
      plannedTargetPrice: decimal('2100.75'),
      plannedQuantity: decimal('2'),
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:30:00Z',
    }],
    executions: [{
      id: entryId,
      tradeId,
      type: 'entry',
      price: decimal('2001.125'),
      quantity: decimal('1.5'),
      executedAt: '2026-09-01T01:02:03.004Z',
      createdAt: '2026-09-01T01:02:03.004Z',
    }, {
      id: exitId,
      tradeId,
      type: 'exit',
      price: decimal('2088.5'),
      quantity: decimal('1.5'),
      executedAt: '2026-09-01T02:03:04.005Z',
      createdAt: '2026-09-01T02:03:04.005Z',
    }],
    fees: [], metrics: null, metricsError: null,
    visualPnl: { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' },
  };
}

describe('Analysis saved-trade chart reference projection', () => {
  it('delegates exact P14 plan and execution facts for an exact symbol and quote match', () => {
    const result = projectAnalysisSavedTradeChartReference(journalEntry(), scope);
    expect(result.kind).toBe('reference-ready');
    if (result.kind !== 'reference-ready') throw new Error('expected reference-ready');
    expect(result.chartInstrument).toEqual({ venue: 'binance-spot', symbol: 'ETHUSDT' });
    expect(result.chartQuoteAsset).toBe('USDT');
    expect(result.executionVenue).toBeNull();
    expect(result.facts.planned).toEqual({ entry: decimal('2000.25'), stop: decimal('1950'), target: decimal('2100.75') });
    expect(result.facts.executedEntries).toEqual([{
      executionId: entryId, price: decimal('2001.125'), quantity: decimal('1.5'), executedAt: '2026-09-01T01:02:03.004Z',
    }]);
    expect(result.facts.executedExits).toEqual([{
      executionId: exitId, price: decimal('2088.5'), quantity: decimal('1.5'), executedAt: '2026-09-01T02:03:04.005Z',
    }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.chartInstrument)).toBe(true);
    expect(Object.isFrozen(result.facts)).toBe(true);
  });

  it.each([
    [{ marketType: 'stock' as const }, scope, 'market-type-mismatch'],
    [{ symbol: 'BTCUSDT' }, scope, 'symbol-mismatch'],
    [{ grossPnlCurrency: null }, scope, 'price-currency-missing'],
    [{ grossPnlCurrency: undefined }, scope, 'price-currency-missing'],
    [{ grossPnlCurrency: 'USD' }, scope, 'price-currency-mismatch'],
  ] as const)('fails closed without manufacturing compatible chart evidence', (trade, selected, reason) => {
    expect(projectAnalysisSavedTradeChartReference(journalEntry(trade), selected)).toMatchObject({ kind: 'unavailable', reason });
  });

  it('uses exact case-sensitive symbol and quote evidence', () => {
    expect(projectAnalysisSavedTradeChartReference(journalEntry(), { ...scope, instrument: { ...scope.instrument, symbol: 'ethusdt' } })).toMatchObject({ kind: 'unavailable', reason: 'symbol-mismatch' });
    expect(projectAnalysisSavedTradeChartReference(journalEntry(), { ...scope, quoteAsset: 'usdt' })).toMatchObject({ kind: 'unavailable', reason: 'price-currency-mismatch' });
  });

  it('preserves missing executions as empty facts instead of inventing a fill', () => {
    const entry = { ...journalEntry(), executions: [] };
    const result = projectAnalysisSavedTradeChartReference(entry, scope);
    expect(result.kind).toBe('reference-ready');
    if (result.kind !== 'reference-ready') throw new Error('expected reference-ready');
    expect(result.facts.executedEntries).toEqual([]);
    expect(result.facts.executedExits).toEqual([]);
  });
});
