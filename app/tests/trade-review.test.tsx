import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosDatabaseSnapshot } from '../src/data/backup';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { getJournalHistoryEntry, listJournalHistory } from '../src/application/journal';
import { loadTradeReview, type TradeReviewResult } from '../src/application/journal/loadTradeReview';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { TradeReviewDetails } from '../src/app/TradeReviewDetails';
import { ReviewTradeLink, tradeReviewHref } from '../src/app/ReviewTradeLink';
import type { TradeId } from '../src/domain/trades';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z', closedAt = '2026-09-12T05:00:00.000Z';
const input: SaveManualTradeInput = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT', plan: { plannedEntryPrice: '90', plannedStopPrice: '80', plannedTargetPrice: '130', plannedQuantity: '2' }, executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: closedAt }], fees: [{ amount: '0.3', currency: 'USDT' }] };
async function start(overrides: Partial<SaveManualTradeInput> = {}) {
  db = createKairosDatabase('review-' + crypto.randomUUID()); await db.open();
  const saved = await saveManualTrade(db, { ...input, ...overrides });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  return saved.tradeId;
}
function route(path: string, load: (id: string | null) => Promise<TradeReviewResult> = id => loadTradeReview(id, db)) {
  const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={load} /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />); return router;
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

it('loads one exact older identity beyond the recent list and shares P12 hydration without changing saved facts', async () => {
  const id = await start();
  const original = (await getJournalHistoryEntry(db, id))!;
  await db.trades.bulkPut(Array.from({ length: 501 }, (_, i) => ({ ...original.trade, id: `newer-${i}` as TradeId, updatedAt: '9999-12-31T23:59:59.999Z' })));
  expect((await listJournalHistory(db, { limit: 500 })).some(entry => entry.trade.id === id)).toBe(false);
  const before = await createKairosDatabaseSnapshot(db);
  expect(await getJournalHistoryEntry(db, id)).toEqual(original);
  expect((await getJournalHistoryEntry(db, 'newer-1'))?.executions).toEqual([]);
  expect(await loadTradeReview('does-not-exist', db)).toEqual({ kind: 'missing' });
  expect(await loadTradeReview('', db)).toEqual({ kind: 'missing' });
  expect((await createKairosDatabaseSnapshot(db)).payload).toEqual(before.payload);
});
it('shows exact plan, ordered actual executions, separate fees and the existing currency-aware result', async () => {
  const id = await start(); route(tradeReviewHref(id));
  await screen.findByRole('region', { name: 'Trade overview' });
  expect(within(screen.getByRole('region', { name: 'Saved plan' })).getByText('90')).toBeVisible();
  const executions = within(screen.getByRole('region', { name: 'Actual executions' }));
  expect(executions.getByText('100')).toBeVisible(); expect(executions.getByText('120')).toBeVisible();
  expect(executions.getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByRole('region', { name: 'Recorded fees' })).getByText('0.3 USDT')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Recorded result' })).getAllByText('39.7 USDT')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /save|delete|edit/i })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Analysis' })).toHaveFocus());
});
it('keeps unknown currency and zero-execution results explicit instead of using plan prices', async () => {
  const id = await start({ grossPnlCurrency: undefined, executions: [], fees: [] }); route(tradeReviewHref(id));
  await screen.findByText('No executions recorded.');
  expect(screen.getByText('No actual executions are recorded. Planned prices alone do not establish a result.')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Recorded result' })).getAllByText('Not available').length).toBeGreaterThan(0);
  expect(screen.getByText('No fees recorded.')).toBeVisible();
});
it('keeps fees attached to the correct execution and does not invent a missing association', async () => {
  const id = await start(); const entry = (await getJournalHistoryEntry(db, id))!;
  const ui = render(<TradeReviewDetails entry={{ ...entry, fees: [{ ...entry.fees[0], executionId: entry.executions[1].id }] }} />);
  expect(screen.getByText('Execution 2 · Exit')).toBeVisible();
  ui.rerender(<TradeReviewDetails entry={{ ...entry, fees: [{ ...entry.fees[0], executionId: 'missing' as typeof entry.executions[0]['id'] }] }} />);
  expect(screen.getByText('Linked execution unavailable')).toBeVisible();
});
it('encodes a saved identity in a standalone link without confusing symbols or query characters', () => {
  const id = 'saved/id?#two trades'; render(<ReviewTradeLink id={id} />);
  const href = screen.getByRole('link', { name: 'View trade' }).getAttribute('href')!;
  expect(new URL(href, 'https://kairos.test').searchParams.get('trade')).toBe(id);
});
it('offers the recent selector and follows the chosen ID when two symbols are identical', async () => {
  const first = await start();
  const second = await saveManualTrade(db, { ...input, status: 'draft', openedAt: null, closedAt: null, executions: [], fees: [] });
  if (!second.ok) throw new Error('fixture save failed');
  const router = route('/analysis');
  const select = await screen.findByRole('combobox', { name: 'Saved trade' });
  expect(within(select).getAllByRole('option')).toHaveLength(3);
  fireEvent.change(select, { target: { value: first } });
  await screen.findByRole('region', { name: 'Trade overview' });
  expect(router.state.location.search).toContain(first);
  expect(document.querySelector('[data-review-trade-id]')).toHaveAttribute('data-review-trade-id', first);
});
it('shows missing and empty states without silently choosing a different trade', async () => {
  await start(); route('/analysis?trade=missing');
  await screen.findByRole('heading', { name: 'Trade not found' });
  expect(document.querySelector('[data-review-trade-id]')).toBeNull();
  cleanup(); route('/analysis', async () => ({ kind: 'selection', entries: [] }));
  expect(await screen.findByRole('link', { name: 'Log your first trade' })).toHaveAttribute('href', '/journal');
});
it('supports retry after a read failure', async () => {
  const load = vi.fn<(id: string | null) => Promise<TradeReviewResult>>().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue({ kind: 'missing' });
  route('/analysis?trade=retry', load);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Trade not found' })).toBeVisible();
  expect(load).toHaveBeenCalledTimes(2);
});
it('discards a slow previous-ID response after navigation', async () => {
  const id = await start(); const entry = (await getJournalHistoryEntry(db, id))!;
  let resolveOld!: (result: TradeReviewResult) => void;
  const load = (key: string | null): Promise<TradeReviewResult> => key === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ kind: 'missing' });
  const router = route('/analysis?trade=old', load);
  await act(async () => { await router.navigate('/analysis?trade=new'); });
  await screen.findByRole('heading', { name: 'Trade not found' });
  await act(async () => { resolveOld({ kind: 'trade', entry }); });
  expect(document.querySelector('[data-review-trade-id]')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Trade not found' })).toBeVisible();
});
