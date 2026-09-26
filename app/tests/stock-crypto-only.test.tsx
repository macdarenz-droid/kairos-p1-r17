import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnalysisHistoryWorkspace } from '../src/app/AnalysisHistoryWorkspace';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisSavedTradeOverlayLiveCandleCanvasProps } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { TradeReviewDetails } from '../src/app/TradeReviewDetails';
import { getJournalHistoryEntry, type JournalHistoryEntry } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ReplayScreen } from '../src/features/practice/ReplayScreen';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';
import { fakeReplayMarket } from './fixtures/replayCandles';

beforeAll(async () => { await import('../src/features/practice/ReplayScreen'); }, 30_000);
const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-stock-crypto-only-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const DAY = 24 * 60 * 60_000;
const fact = (baseAsset: string, quoteAsset = 'USDT'): LiveMarketUniverseInstrumentMetadataFact => ({
  instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true,
});
const facts = [fact('BTC'), fact('ETH'), fact('AAP', 'L'), fact('EUR', 'USD')];
const ports = () => ({ metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts })) } });
const LiveCanvas = (props: AnalysisLiveCandleCanvasProps) => <div data-testid="live-candle-canvas">{props.instrument.symbol}/{props.interval}</div>;
const SavedTradeLiveCanvas = (props: AnalysisSavedTradeOverlayLiveCandleCanvasProps) => <div data-testid="saved-trade-canvas">{props.instrument.symbol}/{props.interval}</div>;
function tradeEntry(symbol: string, daysAgo: number, marketType?: string): JournalHistoryEntry {
  const start = new Date(Date.now() - daysAgo * DAY).toISOString();
  const end = new Date(Date.now() - daysAgo * DAY + 3 * 60 * 60_000).toISOString();
  return {
    trade: { id: `trade-${symbol}`, symbol, status: 'closed', openedAt: start, closedAt: end, createdAt: start, ...(marketType ? { marketType } : {}) },
    executions: [{ type: 'entry', executedAt: start }, { type: 'exit', executedAt: end }],
  } as unknown as JournalHistoryEntry;
}
const workspace = (entry: JournalHistoryEntry) => render(<AnalysisHistoryWorkspace entry={entry} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);

describe('T-044d crypto only for now, for stocks too', () => {
  it('the Analysis market chart says it is crypto-only for a stock trade', async () => {
    workspace(tradeEntry('AAPL', 2, 'stock'));
    expect(await screen.findByText('The market chart has crypto markets from Binance only for now. Your stock trade is drawn in its picture above, with your plan, entries and exits.')).toBeInTheDocument();
    await screen.findByRole('combobox', { name: 'Chart symbol' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByText("This trade's symbol is not on Binance Spot.")).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Chart symbol' })).toHaveValue('');
    expect(screen.queryByTestId('saved-trade-canvas')).toBeNull();
  });

  it('a trade saved with no market is matched as before, and forex keeps its words', async () => {
    workspace(tradeEntry('AAPL', 2));
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent(/^AAPL\/15m$/);
    cleanup();
    workspace(tradeEntry('EURUSD', 2, 'forex'));
    expect(await screen.findByText('The market chart has crypto markets from Binance only for now. Your forex trade is drawn in its picture above, with your plan, entries and exits.')).toBeInTheDocument();
  });

  it('the Analysis review shows a stock trade in plain words', async () => {
    const db = await database();
    const at = (hour: string) => `2026-09-12T${hour}:00:00.000Z`;
    const saved = await saveManualTrade(db, {
      symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'closed', openedAt: at('04'), closedAt: at('05'), grossPnlCurrency: 'USD',
      executions: [{ type: 'entry', price: '187.5', quantity: '10', executedAt: at('04') }, { type: 'exit', price: '190', quantity: '10', executedAt: at('05') }],
      fees: [{ amount: '1', currency: 'USD' }],
    });
    if (!saved.ok) throw new Error('fixture');
    render(<TradeReviewDetails entry={(await getJournalHistoryEntry(db, saved.tradeId))!} />);
    const overview = within(screen.getByRole('region', { name: 'Trade overview' }));
    expect(overview.getByText('Stock')).toBeInTheDocument();
    expect(overview.getByText('USD')).toBeInTheDocument();
    const result = within(screen.getByRole('region', { name: 'Recorded result' }));
    for (const text of ['Result before fees', '25 USD']) expect(result.getByText(text)).toBeInTheDocument();
    expect(result.getAllByText('24 USD')).toHaveLength(2);
  });

  it('Replay says it has crypto markets only, and a stock ticker gets the spelling note without asking the network', async () => {
    const fake = fakeReplayMarket({ nowMs: Date.parse('2024-04-01T00:00:00.000Z') });
    const db = await database();
    render(<MemoryRouter><ReplayScreen db={db} market={fake.market} playStepMs={25} /></MemoryRouter>);
    expect(screen.getByLabelText(/^Market/)).toHaveAccessibleDescription('Replay has crypto markets from Binance only for now, such as BTCUSDT.');
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-01T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    expect(await screen.findByText("Kairos can't find this market on Binance. Check the spelling, for example BTCUSDT.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Market/)).toHaveFocus();
    expect(fake.requests).toHaveLength(0);
  });
});
