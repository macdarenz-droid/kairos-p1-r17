import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { JournalHistoryList } from '../src/app/JournalHistoryList';
import { JournalRoute } from '../src/app/JournalRoute';
import { VisualPnlPerformanceSummary } from '../src/app/VisualPnlPerformanceSummary';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { createAnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { ChartDrawing } from '../src/features/chart';
import type { DecimalString } from '../src/domain/trades/tradeTypes';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-journal-list-kit-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const noop = () => undefined;
function entry(id: string, visualPnl: JournalHistoryEntry['visualPnl']): JournalHistoryEntry {
  return {
    trade: { id: id as never, symbol: id.toUpperCase(), marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' },
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl,
  };
}
const profit = entry('btcusd', { outcome: 'profit', label: 'Profit', amount: '10' as never, currency: 'USD', source: 'net-pnl' });
const loss = entry('ethusd', { outcome: 'loss', label: 'Loss', amount: '-4' as never, currency: null, source: 'net-pnl' });
const list = (props: Partial<Parameters<typeof JournalHistoryList>[0]> = {}) =>
  render(<JournalHistoryList entries={[profit, loss]} isLoading={false} errorMessage={null} statusFilter="" onStatusFilterChange={noop} {...props} />);

describe('T-049h the trade list on the kit', () => {
  it('draws each result with a shape, a word and a sign', async () => {
    const { container } = list();
    const up = container.querySelector('[data-outcome="profit"]')!;
    expect(up.querySelector('[data-icon="result-up"]')).not.toBeNull();
    expect(up).toHaveTextContent('Profit');
    expect(up).toHaveTextContent('+10 USD');
    const down = container.querySelector('[data-outcome="loss"]')!;
    expect(down.querySelector('[data-icon="result-down"]')).not.toBeNull();
    expect(down).toHaveTextContent('-4');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows the result days as tiles', () => {
    render(<VisualPnlPerformanceSummary summary={{ availableResultDays: 5, profitDays: 3, lossDays: 1, breakEvenDays: 1, unavailableResultDays: 0, totalResultDays: 5 }} />);
    const value = (label: string) => screen.getByText(label).closest('dt')!.nextElementSibling;
    expect(value('Profit days')?.tagName).toBe('DD');
    expect(value('Profit days')).toHaveTextContent('3');
    expect(value('Loss days')).toHaveTextContent('1');
    expect(screen.queryByText('Days not available')).toBeNull();
  });

  it('a failed load and failed older trades each offer "Try again"', () => {
    const onRetry = vi.fn();
    list({ entries: [], errorMessage: 'Kairos could not load your saved trade history. Your stored trades were not changed.', onRetry });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Kairos could not load your saved trade history. Your stored trades were not changed.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();
    const onShowOlder = vi.fn();
    list({ olderFailed: true, hasOlder: true, onShowOlder });
    const older = screen.getByRole('alert');
    expect(older).toHaveTextContent('Kairos could not load older trades. Your stored trades were not changed.');
    fireEvent.click(within(older).getByRole('button', { name: 'Try again' }));
    expect(onShowOlder).toHaveBeenCalledTimes(1);
  });

  it('empty: a picture with words, and "Show all trades" when a filter hides everything', () => {
    list({ entries: [] });
    expect(screen.getByRole('heading', { name: 'No saved trades yet' })).toBeInTheDocument();
    expect(screen.getByText('Your first saved trade will appear here.')).toBeInTheDocument();
    cleanup();
    const onStatusFilterChange = vi.fn();
    list({ entries: [], statusFilter: 'closed', onStatusFilterChange });
    expect(screen.getByRole('heading', { name: 'No closed trades found.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all trades' }));
    expect(onStatusFilterChange).toHaveBeenCalledWith('');
  });
});

const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '0.5', currency: 'USDT' }] } as const);

describe('T-049h a question before any saved record is deleted', () => {
  it('deleting a trade asks in a dialog; "Keep trade" keeps it and "Delete for good" deletes it', async () => {
    const db = await database();
    await saveManualTrade(db, closed('ETHUSDT'));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Delete ETHUSDT for good?' });
    expect(dialog).toHaveTextContent('Its 2 entries and exits and 1 fee go with it.');
    expect(within(dialog).getByRole('button', { name: 'Keep trade' })).toHaveFocus();
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep trade' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await db.trades.count()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    dialog = screen.getByRole('alertdialog', { name: 'Delete ETHUSDT for good?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ETHUSDT deleted, with its 2 entries and exits and 1 fee.'));
    expect(await db.trades.count()).toBe(0);
  });

  const market = analysisMarketReference({ venue: 'binance-spot', symbol: 'ETHUSDT' });
  const line = (id: string): ChartDrawing => ({ id, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as DecimalString }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as DecimalString } });
  const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

  it('"Delete analysis" asks first; "Keep it" keeps the saved analysis and "Delete for good" removes it', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    expect((await ports.save(market, [line('d1')])).ok).toBe(true);
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={0} getDrawings={() => []} onLoad={noop} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved analysis' }).getAttribute('data-saved-analysis-count')).toBe('1'));
    await click('Delete analysis');
    expect(screen.getByRole('alertdialog', { name: 'Delete this saved analysis for good?' })).toHaveTextContent('will be gone from this device. Your chart and your trades stay as they are.');
    expect(await axeViolations(document.body)).toEqual([]);
    await click('Keep it');
    expect(await db.savedAnalyses.count()).toBe(1);
    await click('Delete analysis');
    await click('Delete for good');
    await waitFor(async () => expect(await db.savedAnalyses.count()).toBe(0));
  });

  it('"Delete snapshot" asks first; "Keep it" keeps the saved estimate and "Delete for good" removes it', async () => {
    const db = await database();
    const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
    const snapshot: TimeAssistedTradeSnapshot = { kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' }, closing: null, durationMs: null };
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    expect((await ports.save(snapshot, 'UTC')).ok).toBe(true);
    render(<AnalysisTimeAssistedSnapshotControls history={{ acquireHistory: vi.fn(async () => { throw new Error('unused'); }) }} saved={ports} instrument={instrument} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved snapshot' }).getAttribute('data-saved-snapshot-count')).toBe('1'));
    await click('Delete snapshot');
    expect(screen.getByRole('alertdialog', { name: 'Delete this saved estimate for good?' })).toHaveTextContent('It will be gone from this device. Your trades stay as they are.');
    expect(await axeViolations(document.body)).toEqual([]);
    await click('Keep it');
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
    await click('Delete snapshot');
    await click('Delete for good');
    await waitFor(async () => expect(await db.savedTimeAssistedSnapshots.count()).toBe(0));
  });
});
