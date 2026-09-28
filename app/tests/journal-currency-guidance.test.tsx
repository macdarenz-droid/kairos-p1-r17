import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosDatabaseSnapshot, parseKairosBackup, prepareKairosRestore, replaceKairosDatabaseFromPreparedRestore, serializeKairosBackup } from '../src/data/backup';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { updateOpenManualTrade } from '../src/application/trades/updateOpenManualTrade';
import { isPriceCurrencyInput, PRICE_CURRENCY_INPUT_ERROR } from '../src/application/trades/priceCurrencyInput';
import { listJournalHistory } from '../src/application/journal';
import { JournalRoute } from '../src/app/JournalRoute';
import { JournalClosedTradeGuidance } from '../src/features/journal/JournalClosedTradeGuidance';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z', closedAt = '2026-09-12T05:00:00.000Z';
const input: SaveManualTradeInput = { symbol: 'XRPUSD', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt };
beforeEach(async () => { db = createKairosDatabase('currency-guidance-' + crypto.randomUUID()); await db.open(); });
afterEach(async () => { cleanup(); db.close(); await db.delete(); });
const payload = async () => (await createKairosDatabaseSnapshot(db)).payload;

it.each(['50 USD', '50', '$50', 'USD 50', '50.00USD', 'US DT', 'USD/EUR', '50\nUSD'])('rejects amount/non-code input %s before allocating identity or saving anything', async grossPnlCurrency => {
  const createId = vi.fn(), before = await payload();
  expect(await saveManualTrade(db, { ...input, grossPnlCurrency }, { createId })).toMatchObject({ ok: false, field: 'grossPnlCurrency', reason: 'invalid-pnl-currency' });
  expect(createId).not.toHaveBeenCalled(); expect(await payload()).toEqual(before);
});
it('accepts explicit compact codes, normalizes case, keeps blank unknown, and does not use a guessed currency registry', async () => {
  for (const code of [' usd ', 'USDT', 'AUD', '1INCH', 'USDC', 'MYTOKEN2', '', '   ']) {
    expect(isPriceCurrencyInput(code)).toBe(true);
    const saved = await saveManualTrade(db, { ...input, grossPnlCurrency: code }); expect(saved.ok).toBe(true);
    if (saved.ok) expect((await db.trades.get(saved.tradeId))?.grossPnlCurrency).toBe(code.trim().toUpperCase() || undefined);
  }
});
it('rejects invalid currency-only and closing updates atomically, then accepts a corrected code on the same open trade', async () => {
  await saveManualTrade(db, { ...input, status: 'open', closedAt: null });
  const expected = (await listJournalHistory(db))[0], before = await payload();
  const common = { expected, closedAt: null, executions: [], fees: [], grossPnlCurrency: '50 USD' };
  for (const status of ['open', 'closed'] as const) {
    expect(await updateOpenManualTrade(db, { ...common, status, closedAt: status === 'closed' ? closedAt : null })).toMatchObject({ reason: 'invalid-pnl-currency' });
    expect(await payload()).toEqual(before);
  }
  expect((await updateOpenManualTrade(db, { ...common, status: 'open', grossPnlCurrency: ' usd ' })).ok).toBe(true);
  expect((await db.trades.get(expected.trade.id))?.grossPnlCurrency).toBe('USD');
});
it('preserves a legacy amount-like currency through backup/restore and a later append without rewriting it or blocking the trade', async () => {
  const saved = await saveManualTrade(db, { ...input, status: 'open', closedAt: null }); expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error('fixture');
  const original = (await db.trades.get(saved.tradeId))!;
  await db.trades.put({ ...original, grossPnlCurrency: '50 USD' }); // Existing Gate402-style record.
  const before = await payload(), serialized = serializeKairosBackup(await createKairosDatabaseSnapshot(db));
  expect(parseKairosBackup(serialized).payload).toEqual(before);
  await replaceKairosDatabaseFromPreparedRestore(db, await prepareKairosRestore(db, serialized));
  expect(await payload()).toEqual(before);
  let expected = (await listJournalHistory(db))[0];
  expect((await updateOpenManualTrade(db, { expected, status: 'open', closedAt: null, grossPnlCurrency: '50 USD', executions: [{ type: 'entry', price: '1', quantity: '2', executedAt: openedAt }], fees: [] })).ok).toBe(true);
  expected = (await listJournalHistory(db))[0];
  expect(expected.trade.grossPnlCurrency).toBe('50 USD');
  expect(await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, grossPnlCurrency: 'USD', executions: [], fees: [] })).toMatchObject({ reason: 'recorded-currency-immutable' });
  expect((await db.trades.get(saved.tradeId))?.grossPnlCurrency).toBe('50 USD');
});
it('shows the missing-fill explanation before saving; error focuses and describes the currency field; corrected input saves without invented results', async () => {
  render(<JournalRoute db={db}/>);
  for (const [label, value] of [['Symbol', 'XRPUSD'], ['Market', 'crypto'], ['Direction', 'long'], ['Status', 'closed'], ['Opened', '2026-09-12T14:00'], ['Closed', '2026-09-12T15:00']]) fireEvent.change(screen.getByLabelText(new RegExp('^' + label), { selector: 'input,select' }), { target: { value } });
  expect(screen.getByRole('note', { name: 'Result guidance' })).toHaveTextContent('result stays unavailable');
  const field = screen.getByLabelText('Currency code');
  fireEvent.change(field, { target: { value: '50 USD' } }); fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  const alert = await screen.findByRole('alert'); await waitFor(() => expect(alert).toHaveFocus());
  expect(alert).toHaveTextContent(PRICE_CURRENCY_INPUT_ERROR); expect(field).toHaveValue('50 USD');
  expect(field).toHaveAttribute('aria-invalid', 'true'); expect(field).toHaveAccessibleDescription(expect.stringContaining(PRICE_CURRENCY_INPUT_ERROR));
  expect(await db.trades.count()).toBe(0);
  fireEvent.change(field, { target: { value: 'USD' } }); expect(field).not.toHaveAttribute('aria-invalid');
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' })); await screen.findByText('Trade saved to your journal.');
  const saved = (await listJournalHistory(db))[0]; expect(saved.trade.grossPnlCurrency).toBe('USD'); expect(saved.executions).toEqual([]); expect(saved.visualPnl.amount).toBeNull();
});
it('uses both saved and newly added rows for closing guidance, and keeps an invalid update editable', async () => {
  await saveManualTrade(db, { ...input, status: 'open', closedAt: null, executions: [{ type: 'entry', price: '1', quantity: '2', executedAt: openedAt }] });
  render(<JournalRoute db={db}/>); fireEvent.click(await screen.findByRole('button', { name: 'Update trade' }));
  const ui = within(screen.getByRole('region', { name: 'Update XRPUSD' }));
  fireEvent.change(ui.getByLabelText('Trade status'), { target: { value: 'closed' } });
  expect(ui.getByRole('note')).toHaveTextContent('No actual exit');
  fireEvent.change(ui.getByLabelText('Closed date & time'), { target: { value: '2026-09-12T15:00' } });
  fireEvent.change(ui.getByLabelText('Currency code'), { target: { value: '50 USD' } });
  const before = await payload(); fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
  expect(await ui.findByRole('alert')).toHaveTextContent(PRICE_CURRENCY_INPUT_ERROR);
  expect(ui.getByLabelText('Currency code')).toHaveAttribute('aria-invalid', 'true'); expect(await payload()).toEqual(before);
  fireEvent.change(ui.getByLabelText('Currency code'), { target: { value: 'USD' } });
  fireEvent.click(ui.getByRole('button', { name: 'Add exit' })); expect(ui.queryByRole('note')).toBeNull();
});
it('does not call row presence a calculated result or show a missing-row warning for open trades', () => {
  const { rerender } = render(<JournalClosedTradeGuidance status="open" types={[]}/>); expect(screen.queryByRole('note')).toBeNull();
  rerender(<JournalClosedTradeGuidance status="closed" types={['exit']}/>); expect(screen.getByRole('note')).toHaveTextContent('No actual entry');
  rerender(<JournalClosedTradeGuidance status="closed" types={['entry', 'exit']}/>); expect(screen.queryByRole('note')).toBeNull();
});
