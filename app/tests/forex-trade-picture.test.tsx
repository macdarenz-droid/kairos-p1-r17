import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { listJournalHistory } from '../src/application/journal';
import { loadTradePictureCandles, projectTradePicture, tradePictureHasCandleSource, type TradePictureInput } from '../src/application/trade-visualizer';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { calculateTradeMetrics, decimalMultiply } from '../src/domain/calculations';
import {
  parseDecimalString, type DecimalString, type MarketType, type TradeExecutionId, type TradeExecutionRecord, type TradeFeeId, type TradeFeeRecord,
  type TradeId, type TradePlanId, type TradeRecord, type TradeSide,
} from '../src/domain/trades';
import { TradePicture } from '../src/features/journal/TradePicture';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-forex-picture-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z', now = '2026-09-24T12:00:00.000Z';
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'EURUSD', marketType: 'forex', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USD', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed, ...overrides };
}
function plan(entry: string, stop: string, target: string, quantity: string) {
  return [{ id: 'plan-1' as TradePlanId, tradeId, plannedEntryPrice: dec(entry), plannedStopPrice: dec(stop), plannedTargetPrice: dec(target), plannedQuantity: dec(quantity), createdAt: opened, updatedAt: opened }];
}
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
const usdFee = { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec('0.7'), currency: 'USD', createdAt: closed } as TradeFeeRecord;
const value = (model: ReturnType<typeof projectTradePicture>, key: string) => model.info.find(row => row.key === key);
function simple(symbol: string, side: TradeSide, units: string, entry: string, exit: string | null, currency: string, extra: Partial<TradeRecord> = {}): TradePictureInput {
  return {
    trade: trade({ symbol, side, grossPnlCurrency: currency, ...(exit === null ? { status: 'open', closedAt: null } : {}), ...extra }),
    plans: [],
    executions: [fill('e1', 'entry', entry, units, opened), ...(exit === null ? [] : [fill('x1', 'exit', exit, units, closed)])],
    fees: [],
    candles: null,
    now,
  };
}
const eurUsd: TradePictureInput = {
  trade: trade(),
  plans: plan('1.085', '1.08', '1.095', '10000'),
  executions: [fill('e1', 'entry', '1.085', '10000', opened), fill('x1', 'exit', '1.09', '10000', closed)],
  fees: [usdFee],
  candles: null,
  now,
};

describe('T-043c the forex trade picture', () => {
  it('shows the pair, units and lots, pips and the value of 1 pip', () => {
    const model = projectTradePicture(eurUsd);
    expect(value(model, 'market')).toMatchObject({ value: 'EURUSD', text: 'EUR/USD' });
    expect(value(model, 'size')).toMatchObject({ value: '10000', unit: 'units', text: '10000 units (0.1 lots)' });
    expect(value(model, 'result')?.text).toBe('49.3 USD');
    expect(value(model, 'pips')).toMatchObject({ label: 'Pips won or lost', value: '50', unit: 'pips', text: '+50 pips' });
    expect(value(model, 'pip-value')).toMatchObject({ label: 'Value of 1 pip', value: '1', unit: 'USD', text: '1 USD' });
    expect(model.info.map(row => row.key)).toEqual(['market', 'direction', 'opened', 'closed', 'planned-entry', 'stop', 'target', 'average-exit', 'size', 'result', 'pips', 'pip-value', 'planned-reward', 'actual-r', 'duration', 'status']);
    expect(model.marketHasCandles).toBe(false);
    expect(model.missing.map(item => item.part)).toContain('candles');
    const metrics = calculateTradeMetrics('long', eurUsd.executions, undefined, eurUsd.fees, { grossPnlCurrency: 'USD' });
    const product = decimalMultiply(value(model, 'pips')!.value!, value(model, 'pip-value')!.value!);
    expect(metrics.ok && product.ok && product.value).toBe(metrics.ok ? metrics.value.grossPnl : null);
    expect(metrics.ok && metrics.value.grossPnl).toBe('50');
  });

  it('works for yen pairs, losses, rounding, one pip and one lot', () => {
    const yen = projectTradePicture(simple('USDJPY', 'short', '20000', '150.25', '149.8', 'JPY'));
    expect(value(yen, 'pips')).toMatchObject({ value: '45', text: '+45 pips' });
    expect(value(yen, 'pip-value')).toMatchObject({ value: '200', text: '200 JPY' });
    expect(value(yen, 'size')?.text).toBe('20000 units (0.2 lots)');
    expect(value(yen, 'result')?.text).toBe('9000 JPY');
    const cable = projectTradePicture(simple('GBPUSD', 'long', '5000', '1.2710', '1.26955', 'USD'));
    expect(value(cable, 'pips')).toMatchObject({ value: '-14.5', text: '-14.5 pips' });
    expect(value(cable, 'pip-value')).toMatchObject({ value: '0.5', text: '0.5 USD' });
    expect(value(cable, 'size')?.text).toBe('5000 units (0.05 lots)');
    expect(value(projectTradePicture(simple('EURUSD', 'long', '10000', '1.085034', '1.085', 'USD')), 'pips')).toMatchObject({ value: '-0.34', text: '-0.3 pips' });
    expect(value(projectTradePicture(simple('EURUSD', 'long', '10000', '1.0850', '1.0851', 'USD')), 'pips')).toMatchObject({ value: '1', text: '+1 pip' });
    expect(value(projectTradePicture(simple('EURUSD', 'long', '100000', '1.085', '1.09', 'USD')), 'size')?.text).toBe('100000 units (1 lot)');
  });

  it('has no pips for an open trade, a pair that is not standard, or a symbol that is not a pair', () => {
    const open = projectTradePicture(simple('EURUSD', 'long', '10000', '1.085', null, 'USD'));
    expect(value(open, 'pips')).toMatchObject({ value: null, text: null });
    expect(value(open, 'pip-value')?.value).toBe('1');
    const gold = projectTradePicture(simple('XAUUSD', 'long', '10', '2000', '2010', 'USD'));
    expect(value(gold, 'market')?.text).toBe('XAU/USD');
    expect(value(gold, 'size')?.text).toBe('10 units');
    expect(value(gold, 'pips')?.value).toBeNull();
    expect(value(gold, 'pip-value')?.value).toBeNull();
    const old = projectTradePicture(simple('EURUSDM', 'long', '10000', '1.085', '1.09', 'USD'));
    expect(value(old, 'market')?.text).toBe('EURUSDM');
    expect(value(old, 'size')?.text).toMatch(/ units$/);
    expect(value(old, 'pips')?.value).toBeNull();
  });

  it('leaves crypto pictures unchanged', () => {
    const btc: TradePictureInput = {
      trade: trade({ symbol: 'BTCUSDT', marketType: 'crypto', grossPnlCurrency: 'USDT' }),
      plans: plan('100', '90', '130', '2'),
      executions: [fill('e1', 'entry', '100', '2', opened), fill('x1', 'exit', '120', '2', closed)],
      fees: [],
      candles: null,
      now,
    };
    const model = projectTradePicture(btc);
    expect(model.info.map(row => row.key)).toEqual(['market', 'direction', 'opened', 'closed', 'planned-entry', 'stop', 'target', 'average-exit', 'size', 'result', 'planned-reward', 'actual-r', 'duration', 'status']);
    expect(value(model, 'size')).toMatchObject({ unit: null, text: '2' });
    expect(model.marketHasCandles).toBe(true);
    expect(tradePictureHasCandleSource('forex')).toBe(false);
    expect(tradePictureHasCandleSource('stock')).toBe(false);
    for (const market of ['crypto', 'futures', 'options', 'other'] as MarketType[]) expect(tradePictureHasCandleSource(market)).toBe(true);
  });

  it('never asks the network for a forex trade', async () => {
    const acquireInstrumentMetadata = vi.fn();
    const acquireHistory = vi.fn();
    const deps = { venue: 'test', metadata: { acquireInstrumentMetadata }, history: { acquireHistory } } as unknown as Parameters<typeof loadTradePictureCandles>[2];
    expect(await loadTradePictureCandles(eurUsd.trade, eurUsd.executions, deps)).toBeNull();
    expect(acquireInstrumentMetadata).not.toHaveBeenCalled();
    expect(acquireHistory).not.toHaveBeenCalled();
  });

  it('says candles are crypto-only on the card', () => {
    const model = projectTradePicture(eurUsd);
    const { container, rerender } = render(<TradePictureCard model={model} />);
    expect(screen.getByText('Candles are shown for crypto trades only for now.')).toBeTruthy();
    expect(screen.queryByText('Candles need a connection.')).toBeNull();
    rerender(<TradePictureCard model={model} candlesLoading />);
    expect(screen.getByText('Candles are shown for crypto trades only for now.')).toBeTruthy();
    expect(screen.queryByText('Loading candles…')).toBeNull();
    expect(container.querySelector('[data-info="pips"] dd')!.textContent).toBe('+50 pips');
    expect(container.querySelector('[data-info="size"] dd')!.textContent).toBe('10000 units (0.1 lots)');
    expect(screen.getByRole('button', { name: 'What does "Pips won or lost" mean?' })).toBeTruthy();
  });

  it('asks for crypto candles only, in the Journal and in Analysis', async () => {
    const db = await database();
    const fx = await saveManualTrade(db, {
      symbol: 'EURUSD', marketType: 'forex', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: 'USD',
      executions: [{ type: 'entry', price: '1.085', quantity: '10000', executedAt: opened }, { type: 'exit', price: '1.09', quantity: '10000', executedAt: closed }],
    });
    const btc = await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: 'USDT',
      plan: { plannedEntryPrice: '60000', plannedStopPrice: '59000', plannedTargetPrice: '62000', plannedQuantity: '0.1' },
      executions: [{ type: 'entry', price: '60000', quantity: '0.1', executedAt: opened }, { type: 'exit', price: '61500', quantity: '0.1', executedAt: closed }],
    });
    expect(fx.ok && btc.ok).toBe(true);
    const offline: TradePictureCandleLoader = async () => null;
    const loader = vi.fn(offline);
    render(<TradePictureCandleLoaderContext.Provider value={loader}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
    const forex = await screen.findByRole('button', { name: 'Open the EURUSD trade picture' });
    await waitFor(() => expect(within(forex).getByText('Candles are shown for crypto trades only for now.')).toBeInTheDocument());
    const crypto = screen.getByRole('button', { name: 'Open the BTCUSDT trade picture' });
    await waitFor(() => expect(within(crypto).getByText('Candles need a connection.')).toBeInTheDocument());
    expect(loader.mock.calls.map(([record]) => record.symbol)).toEqual(['BTCUSDT']);
    cleanup();

    const entry = (await listJournalHistory(db)).find(item => item.trade.symbol === 'EURUSD')!;
    const analysisLoader = vi.fn(offline);
    render(<TradePictureCandleLoaderContext.Provider value={analysisLoader}><TradePicture entry={entry} variant="full" /></TradePictureCandleLoaderContext.Provider>);
    expect(await screen.findByText('Candles are shown for crypto trades only for now.')).toBeInTheDocument();
    expect(analysisLoader).not.toHaveBeenCalled();
  });
});
