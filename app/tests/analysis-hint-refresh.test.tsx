import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { loadTradeReview, type TradeReviewResult } from '../src/application/journal/loadTradeReview';
import { saveManualTrade } from '../src/application/trades';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { tradeReviewHref } from '../src/app/ReviewTradeLink';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ThemeProvider } from '../src/design-system/themes';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';

let db: KairosDatabase | null = null;
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); db = null; } });

const openedAt = '2026-09-12T04:00:00.000Z', closedAt = '2026-09-12T05:00:00.000Z';
const offline: TradePictureCandleLoader = async () => null;

it('keeps an open "What does this mean?" sheet when Analysis refreshes the same trade', async () => {
  db = createKairosDatabase(`analysis-hint-${crypto.randomUUID()}`); await db.open();
  const saved = await saveManualTrade(db, {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: '100', plannedStopPrice: '90', plannedTargetPrice: '130', plannedQuantity: '2' },
    executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: closedAt }],
  });
  if (!saved.ok) throw new Error('fixture');
  const current = db;
  const load = vi.fn((id: string | null): Promise<TradeReviewResult> => loadTradeReview(id, current));
  const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={load} /> }], { initialEntries: [tradeReviewHref(saved.tradeId)] });
  render(<ThemeProvider><TradePictureCandleLoaderContext.Provider value={offline}><RouterProvider router={router} /></TradePictureCandleLoaderContext.Provider></ThemeProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'What does "Result after fees" mean?' }));
  const dialog = screen.getByRole('dialog', { name: 'Result after fees' });
  await waitFor(() => expect(within(dialog).getByText(/Traders call it:/)).toBeTruthy());
  expect(dialog.contains(document.activeElement)).toBe(true);
  const calls = load.mock.calls.length;

  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(load.mock.calls.length).toBe(calls + 1));
  // Wait for the Analysis read only: the workspace below has network statuses of its own.
  await waitFor(() => expect(screen.getByRole('region', { name: 'Analysis' }).getAttribute('aria-busy')).toBeNull());

  expect(screen.getByRole('dialog', { name: 'Result after fees' })).toBe(dialog);
  expect(dialog.contains(document.activeElement)).toBe(true);
});

async function seedTrade(): Promise<{ readonly tradeId: string; readonly read: (id: string | null) => Promise<TradeReviewResult> }> {
  db = createKairosDatabase(`analysis-hint-${crypto.randomUUID()}`); await db.open();
  const saved = await saveManualTrade(db, {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: '100', plannedStopPrice: '90', plannedTargetPrice: '130', plannedQuantity: '2' },
    executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: closedAt }],
  });
  if (!saved.ok) throw new Error('fixture');
  const current = db;
  return { tradeId: saved.tradeId, read: (id) => loadTradeReview(id, current) };
}
function mountAnalysis(load: (id: string | null) => Promise<TradeReviewResult>, path: string) {
  const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={load} /> }], { initialEntries: [path] });
  render(<ThemeProvider><TradePictureCandleLoaderContext.Provider value={offline}><RouterProvider router={router} /></TradePictureCandleLoaderContext.Provider></ThemeProvider>);
  return router;
}
const analysisIdle = () => waitFor(() => expect(screen.getByRole('region', { name: 'Analysis' }).getAttribute('aria-busy')).toBeNull());
const headingFocused = () => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Analysis' }));

it('gives focus back to the heading after "Try again" reloads', async () => {
  const { tradeId, read } = await seedTrade();
  let fail = true;
  const load = vi.fn((id: string | null) => {
    if (fail) { fail = false; return Promise.reject(new Error('offline')); }
    return read(id);
  });
  mountAnalysis(load, tradeReviewHref(tradeId));
  const retry = await screen.findByRole('button', { name: 'Try again' });
  retry.focus();
  fireEvent.click(retry);
  await screen.findByRole('button', { name: 'What does "Result after fees" mean?' });
  await analysisIdle();
  headingFocused();
});

it('treats A, another trade, then A again as a new selection', async () => {
  const { tradeId, read } = await seedTrade();
  const pending: ((value: TradeReviewResult) => void)[] = [];
  let hold = false;
  const load = vi.fn((id: string | null) => (hold ? new Promise<TradeReviewResult>((resolve) => { pending.push(resolve); }) : read(id)));
  const router = mountAnalysis(load, tradeReviewHref(tradeId));
  await screen.findByRole('button', { name: 'What does "Result after fees" mean?' });
  await analysisIdle();

  hold = true;
  await act(async () => { await router.navigate('/analysis'); });
  await act(async () => { await router.navigate(tradeReviewHref(tradeId)); });
  expect(pending).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /What does/ })).toBeNull();
  expect(document.querySelector('[data-trade-picture]')).toBeNull();

  await act(async () => { pending[1](await read(tradeId)); });
  await screen.findByRole('button', { name: 'What does "Result after fees" mean?' });
  await analysisIdle();
  headingFocused();
});
