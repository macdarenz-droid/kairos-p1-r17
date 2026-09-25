import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { listJournalHistory } from '../src/application/journal';
import { loadTradePictureCandles, projectTradePicture, tradePictureHasCandleSource, type TradePictureInput } from '../src/application/trade-visualizer';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { calculateTradeMetrics, decimalDivide, decimalMultiply } from '../src/domain/calculations';
import {
  parseDecimalString,
  type DecimalString,
  type MarketType,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradeRecord,
  type TradeSide,
} from '../src/domain/trades';
import { TradePicture } from '../src/features/journal/TradePicture';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-stock-picture-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z', now = '2026-09-24T12:00:00.000Z';
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USD', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed, ...overrides };
}
function plan(entry: string, stop: string, target: string, quantity: string) {
  return [{ id: 'plan-1' as TradePlanId, tradeId, plannedEntryPrice: dec(entry), plannedStopPrice: dec(stop), plannedTargetPrice: dec(target), plannedQuantity: dec(quantity), createdAt: opened, updatedAt: opened }];
}
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
const usdFee = { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USD', createdAt: closed } as TradeFeeRecord;
const value = (model: ReturnType<typeof projectTradePicture>, key: string) => model.info.find(row => row.key === key);
function simple(symbol: string, side: TradeSide, shares: string, entry: string, exit: string | null, currency: string | null, marketType: MarketType = 'stock'): TradePictureInput {
  return {
    trade: trade({ symbol, side, marketType, grossPnlCurrency: currency, ...(exit === null ? { status: 'open', closedAt: null } : {}) }),
    plans: [],
    executions: [fill('e1', 'entry', entry, shares, opened), ...(exit === null ? [] : [fill('x1', 'exit', exit, shares, closed)])],
    fees: [],
    candles: null,
    now,
  };
}
const aapl: TradePictureInput = {
  trade: trade(),
  plans: plan('187.5', '185', '192.5', '10'),
  executions: [fill('e1', 'entry', '187.5', '10', opened), fill('x1', 'exit', '190', '10', closed)],
  fees: [usdFee],
  candles: null,
  now,
};

describe('T-044c the stock trade picture', () => {
  it('an AAPL long shows its size in shares and what it won per share', () => {
    const model = projectTradePicture(aapl);
    expect(value(model, 'market')).toMatchObject({ value: 'AAPL', text: 'AAPL' });
    expect(value(model, 'size')).toMatchObject({ value: '10', unit: 'shares', text: '10 shares' });
    expect(value(model, 'result')!.text).toBe('24 USD');
    expect(value(model, 'per-share')).toMatchObject({ label: 'Won or lost per share', value: '2.5', unit: 'USD', text: '+2.5 USD before fees' });
    expect(model.info.map(row => row.key)).toEqual(['market', 'direction', 'opened', 'closed', 'planned-entry', 'stop', 'target', 'average-exit', 'size', 'result', 'per-share', 'planned-reward', 'actual-r', 'duration', 'status']);
    expect(model.marketHasCandles).toBe(false);
    expect(model.missing).toContainEqual({ part: 'candles', message: 'No stock candles yet, so only your plan, entries and exits are shown.' });
    const metrics = calculateTradeMetrics('long', aapl.executions, undefined, aapl.fees, { grossPnlCurrency: 'USD' });
    expect(metrics.ok && metrics.value.grossPnl).toBe('25');
    const product = decimalMultiply(value(model, 'per-share')!.value!, value(model, 'size')!.value!);
    expect(product.ok && product.value).toBe(metrics.ok ? metrics.value.grossPnl : 'metrics');
  });

  it('a 7203.T short in yen', () => {
    const model = projectTradePicture(simple('7203.T', 'short', '100', '2500', '2487.5', 'JPY'));
    expect(value(model, 'size')!.text).toBe('100 shares');
    expect(value(model, 'per-share')).toMatchObject({ value: '12.5', text: '+12.5 JPY before fees' });
    expect(value(model, 'result')!.text).toBe('1250 JPY');
  });

  it('part of a share, and one share', () => {
    const part = projectTradePicture(simple('AAPL', 'long', '0.5', '400', '390.2', 'USD'));
    expect(value(part, 'size')!.text).toBe('0.5 shares');
    expect(value(part, 'per-share')).toMatchObject({ value: '-9.8', text: '-9.8 USD before fees' });
    expect(value(part, 'result')!.text).toBe('-4.9 USD');
    const one = projectTradePicture(simple('AAPL', 'long', '1', '100', '101', 'USD'));
    expect(value(one, 'size')!.text).toBe('1 share');
    expect(value(one, 'per-share')!.text).toBe('+1 USD before fees');
  });

  it('rounds the shown value to 4 places and keeps the exact value', () => {
    const model = projectTradePicture({
      ...simple('AAPL', 'long', '3', '10', null, 'USD'),
      trade: trade(),
      executions: [fill('e1', 'entry', '10', '3', opened), fill('x1', 'exit', '10.01', '1', closed), fill('x2', 'exit', '10.01', '1', closed), fill('x3', 'exit', '10.02', '1', closed)],
    });
    const exact = decimalDivide('0.04' as DecimalString, '3' as DecimalString);
    expect(value(model, 'per-share')!.value).toBe(exact.ok ? exact.value : 'exact');
    expect(value(model, 'per-share')!.text).toBe('+0.0133 USD before fees');
  });

  it('no currency recorded, and an open trade', () => {
    const none = projectTradePicture({ ...aapl, trade: trade({ grossPnlCurrency: null }), fees: [] });
    expect(value(none, 'per-share')).toMatchObject({ value: '2.5', unit: null, text: '+2.5 before fees' });
    const open = projectTradePicture(simple('AAPL', 'long', '10', '187.5', null, 'USD'));
    expect(value(open, 'per-share')).toMatchObject({ value: null, text: null });
    expect(value(open, 'size')!.text).toBe('10 shares');
  });

  it('crypto and forex are unchanged', () => {
    const btc = projectTradePicture({
      trade: trade({ symbol: 'BTCUSDT', marketType: 'crypto', grossPnlCurrency: 'USDT' }),
      plans: plan('100', '90', '130', '2'),
      executions: [fill('e1', 'entry', '100', '2', opened), fill('x1', 'exit', '120', '2', closed)],
      fees: [{ ...usdFee, currency: 'USDT' }],
      candles: null,
      now,
    });
    expect(btc.info.map(row => row.key)).toEqual(['market', 'direction', 'opened', 'closed', 'planned-entry', 'stop', 'target', 'average-exit', 'size', 'result', 'planned-reward', 'actual-r', 'duration', 'status']);
    expect(value(btc, 'size')).toMatchObject({ unit: null, text: '2' });
    expect(btc.marketHasCandles).toBe(true);
    const fx = projectTradePicture(simple('EURUSD', 'long', '10000', '1.085', '1.09', 'USD', 'forex'));
    expect(value(fx, 'pips')).toBeDefined();
    expect(value(fx, 'per-share')).toBeUndefined();
    expect(fx.marketHasCandles).toBe(false);
    expect(tradePictureHasCandleSource('forex')).toBe(false);
    expect(tradePictureHasCandleSource('stock')).toBe(false);
    for (const market of ['crypto', 'futures', 'options', 'other'] as MarketType[]) expect(tradePictureHasCandleSource(market)).toBe(true);
  });

  it('never asks the network for a stock trade', async () => {
    const acquireInstrumentMetadata = vi.fn();
    const acquireHistory = vi.fn();
    const deps = { venue: 'test', metadata: { acquireInstrumentMetadata }, history: { acquireHistory } } as unknown as Parameters<typeof loadTradePictureCandles>[2];
    expect(await loadTradePictureCandles(aapl.trade, aapl.executions, deps)).toBeNull();
    expect(acquireInstrumentMetadata).not.toHaveBeenCalled();
    expect(acquireHistory).not.toHaveBeenCalled();
  });

  it('the card says candles are crypto-only and explains "per share"', async () => {
    const model = projectTradePicture(aapl);
    const { container, rerender } = render(<TradePictureCard model={model} />);
    expect(screen.getByText('Candles are shown for crypto trades only for now.')).toBeTruthy();
    expect(screen.queryByText('Candles need a connection.')).toBeNull();
    rerender(<TradePictureCard model={model} candlesLoading />);
    expect(screen.getByText('Candles are shown for crypto trades only for now.')).toBeTruthy();
    expect(screen.queryByText('Loading candles…')).toBeNull();
    expect(container.querySelector('[data-info="per-share"] dd')!.textContent).toBe('+2.5 USD before fees');
    expect(container.querySelector('[data-info="size"] dd')!.textContent).toBe('10 shares');
    fireEvent.click(screen.getByRole('button', { name: 'What does "Won or lost per share" mean?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Won or lost per share' });
    expect(await within(dialog).findByText(/A small piece of a company/)).toBeInTheDocument();
  });

  it('asks for crypto candles only, in the Journal and in Analysis', async () => {
    const db = await database();
    const stock = await saveManualTrade(db, {
      symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: 'USD',
      executions: [{ type: 'entry', price: '187.5', quantity: '10', executedAt: opened }, { type: 'exit', price: '190', quantity: '10', executedAt: closed }],
      fees: [{ amount: '1', currency: 'USD' }],
    });
    const btc = await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: 'USDT',
      plan: { plannedEntryPrice: '60000', plannedStopPrice: '59000', plannedTargetPrice: '62000', plannedQuantity: '0.1' },
      executions: [{ type: 'entry', price: '60000', quantity: '0.1', executedAt: opened }, { type: 'exit', price: '61500', quantity: '0.1', executedAt: closed }],
    });
    expect(stock.ok && btc.ok).toBe(true);
    const offline: TradePictureCandleLoader = async () => null;
    const loader = vi.fn(offline);
    render(<TradePictureCandleLoaderContext.Provider value={loader}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
    const aaplButton = await screen.findByRole('button', { name: 'Open the AAPL trade picture' });
    await waitFor(() => expect(within(aaplButton).getByText('Candles are shown for crypto trades only for now.')).toBeInTheDocument());
    const crypto = screen.getByRole('button', { name: 'Open the BTCUSDT trade picture' });
    await waitFor(() => expect(within(crypto).getByText('Candles need a connection.')).toBeInTheDocument());
    expect(loader.mock.calls.map(([record]) => record.symbol)).toEqual(['BTCUSDT']);
    cleanup();

    const entry = (await listJournalHistory(db)).find(item => item.trade.symbol === 'AAPL')!;
    const analysisLoader = vi.fn(offline);
    render(<TradePictureCandleLoaderContext.Provider value={analysisLoader}><TradePicture entry={entry} variant="full" /></TradePictureCandleLoaderContext.Provider>);
    expect(await screen.findByText('Candles are shown for crypto trades only for now.')).toBeInTheDocument();
    expect(analysisLoader).not.toHaveBeenCalled();
  });
});
