import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import type { TradeReviewResult } from '../src/application/journal/loadTradeReview';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-analysis-sections-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  return db;
}
function closed(closedAt: string, exit: string): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function route(path: string) {
  const db = await database();
  const load = vi.fn(async (id: string | null): Promise<TradeReviewResult> => (id === null ? { kind: 'selection', entries: [] } : { kind: 'missing' }));
  const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={load} db={db} now={now} /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { db, load, router };
}
const option = (name: 'Your results' | 'Chart') => within(screen.getByRole('group', { name: 'Analysis view' })).getByRole('button', { name });
async function readyResults() {
  const found = await screen.findByRole('region', { name: 'Your results' });
  await waitFor(() => expect(found.getAttribute('data-results-status')).toMatch(/^(ready|empty)$/));
  await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
  return found;
}

describe('T-051c Analysis opens on "Your results", and "Chart" is one tap away', () => {
  it('opens on "Your results" without reading the trade review', async () => {
    const { load } = await route('/analysis');
    await readyResults();
    expect(option('Your results')).toHaveAttribute('aria-pressed', 'true');
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Choose a saved trade' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Analysis' })).toHaveFocus());
  });

  it('"Chart" opens the chart part at its own address', async () => {
    const { load, router } = await route('/analysis');
    await readyResults();
    fireEvent.click(option('Chart'));
    expect(await screen.findByRole('region', { name: 'Choose a saved trade' })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('chart');
    expect(load).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('region', { name: 'Your results' })).toBeNull();
  });

  it('a trade link and a Library handoff open the chart part', async () => {
    await route('/analysis?trade=x');
    expect(await screen.findByRole('heading', { name: 'Trade not found' })).toBeInTheDocument();
    expect(option('Chart')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Your results' })).toBeNull();
    cleanup();
    await route('/analysis?market=binance-spot:ETHUSDT');
    expect(await screen.findByRole('region', { name: 'Choose a saved trade' })).toBeInTheDocument();
    expect(option('Chart')).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Choose another trade" stays in the chart part', async () => {
    const { router } = await route('/analysis?trade=x');
    fireEvent.click(await screen.findByRole('link', { name: 'Choose another trade' }));
    expect(await screen.findByRole('region', { name: 'Choose a saved trade' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?view=chart');
    expect(option('Chart')).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Your results" keeps only the period in the address', async () => {
    const { router } = await route('/analysis?trade=x&period=year');
    await screen.findByRole('heading', { name: 'Trade not found' });
    fireEvent.click(option('Your results'));
    await readyResults();
    expect(router.state.location.search).toBe('?period=year');
  });

  it('a press on the switch keeps focus on the pressed option', async () => {
    await route('/analysis');
    await readyResults();
    const chart = option('Chart');
    chart.focus();
    fireEvent.click(chart);
    await screen.findByRole('region', { name: 'Choose a saved trade' });
    await act(async () => { await Promise.resolve(); });
    expect(option('Chart')).toHaveFocus();
    const results = option('Your results');
    results.focus();
    fireEvent.click(results);
    await readyResults();
    expect(option('Your results')).toHaveFocus();
  });

  it('"Refresh" reloads the results', async () => {
    const { db } = await route('/analysis');
    await readyResults();
    const saved = await saveManualTrade(db, closed('2026-09-02T10:00:00.000Z', '110'));
    expect(saved.ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('Result after fees').closest('.kairos-stat')).toHaveTextContent('+10 USDT'));
  });

  it('has exactly one glow in "Your results" with trades, and none on the chart (D183)', async () => {
    const db = await database();
    expect((await saveManualTrade(db, closed('2026-09-02T10:00:00.000Z', '110'))).ok).toBe(true);
    const load = vi.fn(async (): Promise<TradeReviewResult> => ({ kind: 'selection', entries: [] }));
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={load} db={db} now={now} /> }], { initialEntries: ['/analysis'] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Your results' })).toHaveAttribute('data-results-status', 'ready'));
    expect(document.querySelectorAll('[data-kairos-emphasis]')).toHaveLength(1);
    fireEvent.click(option('Chart'));
    await screen.findByRole('region', { name: 'Choose a saved trade' });
    expect(document.querySelectorAll('[data-kairos-emphasis]')).toHaveLength(0);
  });
});
