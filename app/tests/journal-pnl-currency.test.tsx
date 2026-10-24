import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosDatabaseSnapshot, parseKairosBackup, prepareKairosRestore, replaceKairosDatabaseFromPreparedRestore, serializeKairosBackup } from '../src/data/backup';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { updateOpenManualTrade } from '../src/application/trades/updateOpenManualTrade';
import { listJournalHistory, listJournalVisualPnlDailySummary } from '../src/application/journal';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { JournalRoute } from '../src/app/JournalRoute';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z', closedAt = '2026-09-12T05:00:00.000Z';
const entry = { type: 'entry' as const, price: '100', quantity: '2', executedAt: openedAt };
const exit = { type: 'exit' as const, price: '120', quantity: '2', executedAt: closedAt };
const input: SaveManualTradeInput = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, executions: [entry, exit], fees: [{ amount: '0.1', currency: 'USDT' }, { amount: '0.2', currency: 'USDT' }] };
async function start(overrides: Partial<SaveManualTradeInput> = {}) {
  db = createKairosDatabase('currency-' + crypto.randomUUID()); await db.open();
  expect((await saveManualTrade(db, { ...input, ...overrides })).ok).toBe(true);
  return (await listJournalHistory(db))[0];
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

it('persists explicit currency and computes exact matching-fee net P&L after reload through history, daily and bubble owners', async () => {
  await start({ grossPnlCurrency: ' usdt ' }); db.close(); await db.open();
  const saved = (await listJournalHistory(db))[0];
  expect(saved.trade.grossPnlCurrency).toBe('USDT');
  expect(saved.metrics).toMatchObject({ grossPnl: '40', netPnl: '39.7', netPnlCurrency: 'USDT' });
  expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '39.7', currency: 'USDT' });
  expect(JSON.stringify(await listJournalVisualPnlDailySummary(db, 'Australia/Melbourne'))).toContain('39.7');
});
it.each([undefined, null, '', '   '])('keeps unknown currency %s unknown without deriving it from BTCUSDT or USDT fees', async grossPnlCurrency => {
  const saved = await start({ grossPnlCurrency });
  expect(saved.trade).not.toHaveProperty('grossPnlCurrency');
  expect(saved.metrics).toMatchObject({ grossPnl: '40', netPnl: null, netPnlCurrency: null });
});
it('does not subtract mismatched or mixed-currency fees or infer a conversion', async () => {
  expect((await start({ grossPnlCurrency: 'USD' })).metrics).toMatchObject({ grossPnl: '40', netPnl: null });
  await saveManualTrade(db, { ...input, grossPnlCurrency: 'USDT', fees: [{ amount: '1', currency: 'USD' }, { amount: '1', currency: 'USDT' }] });
  expect((await listJournalHistory(db))[0].metricsError).toBe('mixed-fee-currency');
});
it('labels zero-fee results with known currency and preserves legacy unitless results', async () => {
  expect((await start({ grossPnlCurrency: 'AUD', fees: [] })).metrics).toMatchObject({ netPnl: '40', netPnlCurrency: 'AUD' });
  await saveManualTrade(db, { ...input, fees: [] });
  expect((await listJournalHistory(db))[0].metrics).toMatchObject({ netPnl: '40', netPnlCurrency: null });
});
it('adds currency once to an existing open trade without new fills, rejects a same-millisecond stale update and preserves all facts', async () => {
  const expected = await start({ status: 'open', closedAt: null, executions: [entry] });
  const original = await db.tradeExecutions.toArray();
  const common = { expected, status: 'open' as const, closedAt: null, executions: [], fees: [] };
  const results = await Promise.all(['USDT', 'USD'].map(grossPnlCurrency => updateOpenManualTrade(db, { ...common, grossPnlCurrency }, { now: () => expected.trade.updatedAt })));
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(results.find(r => !r.ok)).toMatchObject({ reason: 'trade-changed' });
  expect(await db.tradeExecutions.toArray()).toEqual(original);
  let latest = (await listJournalHistory(db))[0]; const currency = latest.trade.grossPnlCurrency;
  expect(await updateOpenManualTrade(db, { ...common, expected: latest, grossPnlCurrency: 'EUR' })).toMatchObject({ ok: false, reason: 'recorded-currency-immutable' });
  expect((await updateOpenManualTrade(db, { ...common, expected: latest, status: 'closed', closedAt, executions: [exit] })).ok).toBe(true);
  latest = (await listJournalHistory(db))[0];
  expect(latest.trade.grossPnlCurrency).toBe(currency);
  expect(latest.metrics).toMatchObject({ netPnl: '39.7', netPnlCurrency: currency });
});
it('rolls back new currency with a failed append and preserves it on successful retry', async () => {
  const expected = await start({ status: 'open', closedAt: null, executions: [entry] });
  const update = { expected, status: 'closed' as const, closedAt, grossPnlCurrency: 'USDT', executions: [exit], fees: [] };
  const failure = vi.spyOn(db.tradeExecutions, 'put').mockRejectedValue(new Error('disk-full'));
  expect(await updateOpenManualTrade(db, update)).toMatchObject({ type: 'storage-error' });
  expect(await db.trades.get(expected.trade.id)).toEqual(expected.trade);
  failure.mockRestore(); expect((await updateOpenManualTrade(db, update)).ok).toBe(true);
  expect((await listJournalHistory(db))[0].metrics?.netPnl).toBe('39.7');
});
it('roundtrips currency through full backup/restore; legacy absence survives; rejects invalid currency payloads', async () => {
  await start({ grossPnlCurrency: 'USDT' });
  await saveManualTrade(db, { ...input, symbol: 'LEGACY' });
  const snapshot = await createKairosDatabaseSnapshot(db), serialized = serializeKairosBackup(snapshot);
  expect(parseKairosBackup(serialized).payload.trades).toEqual(snapshot.payload.trades);
  await replaceKairosDatabaseFromPreparedRestore(db, await prepareKairosRestore(db, serialized));
  expect((await listJournalHistory(db)).find(x => x.trade.symbol === 'BTCUSDT')?.metrics?.netPnl).toBe('39.7');
  expect((await listJournalHistory(db)).find(x => x.trade.symbol === 'LEGACY')?.trade).not.toHaveProperty('grossPnlCurrency');
  for (const value of [0, {}, [], '', ' usdt ']) {
    const bad = JSON.parse(serialized); bad.payload.trades[0].grossPnlCurrency = value;
    expect(() => parseKairosBackup(JSON.stringify(bad))).toThrow();
  }
});
it('allows UI currency-only updates with discard protection and then shows saved currency read-only', async () => {
  const expected = await start({ status: 'open', closedAt: null, executions: [entry] }); render(<JournalRoute db={db}/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Update trade' }));
  let ui = within(screen.getByRole('region', { name: 'Update BTCUSDT' }));
  fireEvent.change(ui.getByLabelText('Currency code'), { target: { value: 'USDT' } });
  fireEvent.click(ui.getByRole('button', { name: 'Cancel' }));
  expect(ui.getByRole('group', { name: 'Discard unsaved update' })).toBeVisible();
  expect(await db.trades.get(expected.trade.id)).toEqual(expected.trade);
  fireEvent.click(ui.getByRole('button', { name: 'Keep editing' }));
  fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
  await screen.findByText('Trade updated. Your saved details are below.');
  fireEvent.click(screen.getByRole('button', { name: 'Update trade' }));
  ui = within(screen.getByRole('region', { name: 'Update BTCUSDT' }));
  expect(ui.getByLabelText('Currency code')).toHaveValue('USDT');
  expect(ui.getByLabelText('Currency code')).toHaveAttribute('readonly');
});
