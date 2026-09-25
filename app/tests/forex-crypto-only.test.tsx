import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
async function database(): Promise<KairosDatabase> { const name = `kairos-forex-crypto-only-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const DAY = 24 * 60 * 60_000;
const fact = (baseAsset: string, quoteAsset = 'USDT'): LiveMarketUniverseInstrumentMetadataFact => ({
  instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true,
});
const facts = [fact('BTC'), fact('ETH'), fact('EUR', 'USD')];
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

describe('T-043d crypto only for now, in plain words', () => {
  it('the Analysis market chart says it is crypto-only for a forex trade', async () => {
    render(<AnalysisHistoryWorkspace entry={tradeEntry('EURUSD', 2, 'forex')} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByText(/^The market chart has crypto markets from Binance only for now\./)).toBeInTheDocument();
    await screen.findByRole('combobox', { name: 'Chart symbol' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByText("This trade's symbol is not on Binance Spot.")).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Chart symbol' })).toHaveValue('');
    expect(screen.queryByTestId('saved-trade-canvas')).toBeNull();
  });

  it('a crypto-like trade with the same letters is still matched', async () => {
    render(<AnalysisHistoryWorkspace entry={tradeEntry('EURUSD', 2)} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent(/^EURUSD\//);
  });

  it('the Analysis review uses plain words', async () => {
    const db = await database();
    const at = (hour: string) => `2026-09-12T${hour}:00:00.000Z`;
    const saved = await saveManualTrade(db, {
      symbol: 'EURUSD', marketType: 'forex', side: 'long', status: 'closed', openedAt: at('04'), closedAt: at('05'), grossPnlCurrency: 'USD',
      executions: [{ type: 'entry', price: '1.085', quantity: '10000', executedAt: at('04') }, { type: 'exit', price: '1.09', quantity: '10000', executedAt: at('05') }],
      fees: [{ amount: '0.7', currency: 'USD' }],
    });
    if (!saved.ok) throw new Error('fixture');
    const entry = (await getJournalHistoryEntry(db, saved.tradeId))!;
    const { container, rerender } = render(<TradeReviewDetails entry={entry} />);
    const result = within(screen.getByRole('region', { name: 'Recorded result' }));
    for (const text of ['Result before fees', 'Result after fees', '50 USD']) expect(result.getByText(text)).toBeInTheDocument();
    expect(result.getAllByText('49.3 USD')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Your entries and exits' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Trade overview' })).getByText('Forex')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(fills?|executions?|executed)\b|P&L/i);

    rerender(<TradeReviewDetails entry={{ ...entry, fees: [{ ...entry.fees[0]!, executionId: entry.executions[1]!.id }] }} />);
    expect(screen.getByText('For exit 2')).toBeInTheDocument();
    rerender(<TradeReviewDetails entry={{ ...entry, fees: [{ ...entry.fees[0]!, executionId: 'missing' as (typeof entry.executions)[0]['id'] }] }} />);
    expect(screen.getByText('Its entry or exit is not available')).toBeInTheDocument();
  });

  it('Replay says it is crypto-only for a forex pair, and keeps the spelling note otherwise', async () => {
    const NOW = Date.parse('2024-04-01T00:00:00.000Z');
    for (const [typed, message] of [
      ['EUR/USD', 'Replay has crypto markets from Binance only for now, so it cannot replay EUR/USD. Try a crypto market, for example BTCUSDT.'],
      ['EURUSX', "Kairos can't find this market on Binance. Check the spelling, for example BTCUSDT."],
    ] as const) {
      const fake = fakeReplayMarket({ nowMs: NOW });
      const db = await database();
      render(<MemoryRouter><ReplayScreen db={db} market={fake.market} playStepMs={25} /></MemoryRouter>);
      fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: typed } });
      fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-01T12:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(/^Market/)).toHaveFocus());
      expect(fake.requests).toHaveLength(0);
      cleanup();
    }
  });
});
