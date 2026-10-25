import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { renderTradePage, tradePageHeading, tradePagePart } from './fixtures/tradePage';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z';
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

const closedTrade = (exitAt = '2026-09-12T05:00:00.000Z'): SaveManualTradeInput => ({
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt: exitAt, grossPnlCurrency: 'USDT',
  plan: { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' },
  executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: exitAt }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
});

async function start(input: SaveManualTradeInput = closedTrade(), practice = false) {
  db = createKairosDatabase('edit-entries-' + crypto.randomUUID()); await db.open();
  expect((practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input)).ok).toBe(true);
  renderTradePage(db, (await db.trades.toArray())[0].id, { scope: practice ? 'practice' : 'real' });
  await tradePageHeading('BTCUSDT · Long');
  const card = tradePagePart('Change this trade');
  fireEvent.click(await card.findByRole('button', { name: 'Your entries and exits' }));
  return card;
}
const storedExit = async () => (await db.tradeExecutions.toArray()).find(row => row.type === 'exit')!;
const editForm = (card: ReturnType<typeof within>, name: string) => within(card.getByRole('form', { name }));

describe('editing saved entries, exits and fees', () => {
  it('corrects an exit price and the result on the page follows', async () => {
    const card = await start(); const before = await storedExit();
    fireEvent.click(card.getByRole('button', { name: 'Edit exit 2' }));
    const form = editForm(card, 'Edit exit 2');
    expect(form.getByLabelText('Price')).toHaveFocus();
    fireEvent.change(form.getByLabelText('Price'), { target: { value: '130' } });
    fireEvent.click(form.getByRole('button', { name: 'Save change' }));
    expect(await screen.findByText('Trade updated. Your saved details are on this page.')).toBeInTheDocument();
    expect(await storedExit()).toEqual({ ...before, price: '130' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Recorded result' }).textContent).toContain('59.5 USDT'));
  });

  it('keeps an invalid quantity and writes nothing', async () => {
    const card = await start(); const before = await db.tradeExecutions.toArray();
    fireEvent.click(card.getByRole('button', { name: 'Edit exit 2' }));
    const form = editForm(card, 'Edit exit 2');
    fireEvent.change(form.getByLabelText('Quantity'), { target: { value: '0' } });
    fireEvent.click(form.getByRole('button', { name: 'Save change' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Enter a quantity above 0.');
    expect(form.getByLabelText('Quantity')).toHaveValue('0');
    expect(await db.tradeExecutions.toArray()).toEqual(before);
  });

  it('cancels without a write and returns focus to Edit', async () => {
    const card = await start(); const before = await db.tradeExecutions.toArray();
    fireEvent.click(card.getByRole('button', { name: 'Edit exit 2' }));
    fireEvent.change(editForm(card, 'Edit exit 2').getByLabelText('Price'), { target: { value: '999' } });
    fireEvent.click(card.getByRole('button', { name: 'Cancel' }));
    expect(card.queryByRole('form', { name: 'Edit exit 2' })).toBeNull();
    await waitFor(() => expect(card.getByRole('button', { name: 'Edit exit 2' })).toHaveFocus());
    expect(await db.tradeExecutions.toArray()).toEqual(before);
  });

  it('keeps an imported time exactly unless the time field changes', async () => {
    const exitAt = '2026-09-12T05:00:30.123Z';
    const card = await start(closedTrade(exitAt));
    fireEvent.click(card.getByRole('button', { name: 'Edit exit 2' }));
    fireEvent.change(editForm(card, 'Edit exit 2').getByLabelText('Price'), { target: { value: '125' } });
    fireEvent.click(card.getByRole('button', { name: 'Save change' }));
    await waitFor(async () => expect((await storedExit()).price).toBe('125'));
    expect((await storedExit()).executedAt).toBe(exitAt);

    await screen.findByText('Trade updated. Your saved details are on this page.');
    const again = tradePagePart('Change this trade');
    const toggle = await again.findByRole('button', { name: 'Your entries and exits' });
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
    fireEvent.click(again.getByRole('button', { name: 'Edit exit 2' }));
    fireEvent.change(editForm(again, 'Edit exit 2').getByLabelText('Date & time'), { target: { value: '2026-09-12T15:00' } });
    fireEvent.click(again.getByRole('button', { name: 'Save change' }));
    await waitFor(async () => expect((await storedExit()).executedAt).toBe(new Date('2026-09-12T15:00').toISOString()));
  });

  it('corrects a fee amount', async () => {
    const card = await start();
    fireEvent.click(card.getByRole('button', { name: 'Edit fee 1' }));
    fireEvent.change(editForm(card, 'Edit fee 1').getByLabelText('Amount'), { target: { value: '0.7' } });
    fireEvent.click(card.getByRole('button', { name: 'Save change' }));
    await waitFor(async () => expect((await db.tradeFees.toArray())[0].amount).toBe('0.7'));
  });

  it('edits an entry of a practice trade', async () => {
    const card = await start(closedTrade(), true);
    fireEvent.click(card.getByRole('button', { name: 'Edit entry 1' }));
    fireEvent.change(editForm(card, 'Edit entry 1').getByLabelText('Price'), { target: { value: '101' } });
    fireEvent.click(card.getByRole('button', { name: 'Save change' }));
    expect(await screen.findByText('Trade updated. Your saved details are on this page.')).toBeInTheDocument();
    expect((await db.tradeExecutions.toArray()).find(row => row.type === 'entry')!.price).toBe('101');
  });

  it('keeps the typed values after a storage error, and the retry saves once', async () => {
    const card = await start();
    const put = vi.spyOn(db.tradeExecutions, 'put').mockRejectedValueOnce(new Error('quota'));
    fireEvent.click(card.getByRole('button', { name: 'Edit exit 2' }));
    const form = editForm(card, 'Edit exit 2');
    fireEvent.change(form.getByLabelText('Price'), { target: { value: '130' } });
    fireEvent.click(form.getByRole('button', { name: 'Save change' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Kairos could not save the change. Your edits are kept so you can try again.');
    expect(form.getByLabelText('Price')).toHaveValue('130');
    expect((await storedExit()).price).toBe('120');
    fireEvent.click(form.getByRole('button', { name: 'Save change' }));
    await waitFor(async () => expect((await storedExit()).price).toBe('130'));
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('shows nothing for a trade with no entries, exits or fees', async () => {
    db = createKairosDatabase('edit-entries-' + crypto.randomUUID()); await db.open();
    expect((await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'draft' })).ok).toBe(true);
    renderTradePage(db, (await db.trades.toArray())[0].id);
    await tradePageHeading('ETHUSDT · Long');
    expect(screen.queryByRole('button', { name: 'Your entries and exits' })).toBeNull();
  });
});
