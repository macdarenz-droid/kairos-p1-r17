import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { loadTradeDiscipline, saveDisciplineLists } from '../src/application/discipline';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';
import { TradeReviewControl } from '../src/features/discipline/TradeReviewControl';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-review-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const open = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T07:00:00.000Z' } as const);
const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] } as const);
const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const cardButton = async (symbol: string, name: string) => { let found: HTMLElement | null = null; await waitFor(() => { found = within(card(symbol)).getByRole('button', { name }); }); return found!; };
const idOf = (saved: Awaited<ReturnType<typeof saveManualTrade>>) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId as TradeId; };
const lists = KAIROS_DEFAULT_DISCIPLINE_LISTS;
const box = (dialog: HTMLElement, label: string) => within(dialog).getByRole('checkbox', { name: label }) as HTMLInputElement;

async function saveReview(dialog: HTMLElement) {
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save review' })); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('T-032b "After the trade" on closed cards', () => {
  it('shows the review button on closed cards only and saves a review', async () => {
    const db = await database();
    const tradeId = idOf(await saveManualTrade(db, closed('BTCUSDT')));
    await saveManualTrade(db, open('ETHUSDT'));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'After the trade: not reviewed yet'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(within(card('ETHUSDT')).queryByRole('button', { name: /After the trade/ })).toBeNull();

    const dialog = screen.getByRole('dialog', { name: 'After the trade: BTCUSDT' });
    expect(within(dialog).getByRole('textbox', { name: /Note/ }).getAttribute('maxlength')).toBe('500');
    fireEvent.click(box(dialog, lists.review[0].label));
    fireEvent.click(box(dialog, lists.mistakes[1].label));
    fireEvent.click(box(dialog, lists.mistakes[4].label));
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Note/ }), { target: { value: 'Moved my stop too early.' } });
    await saveReview(dialog);

    expect(within(card('BTCUSDT')).getByRole('button', { name: 'After the trade: reviewed, 2 mistakes' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const loaded = await loadTradeDiscipline(db, [tradeId]);
    const record = loaded.ok ? loaded.records.get(tradeId) : undefined;
    expect(record?.reviewedAt).not.toBeNull();
    expect(record?.postTradeReview.filter(answer => answer.answer === 'yes')).toEqual([{ itemId: lists.review[0].id, label: lists.review[0].label, answer: 'yes' }]);
    expect(record?.mistakes).toEqual([{ itemId: lists.mistakes[1].id, label: lists.mistakes[1].label }, { itemId: lists.mistakes[4].id, label: lists.mistakes[4].label }]);
    expect(record?.note).toBe('Moved my stop too early.');
  });

  it('keeps a saved mistake that was removed from the list, ticked at the end', async () => {
    const db = await database();
    const tradeId = idOf(await saveManualTrade(db, closed('BTCUSDT')));
    const removed = lists.mistakes[0];
    const first = render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'After the trade: not reviewed yet'));
    fireEvent.click(box(screen.getByRole('dialog'), removed.label));
    await saveReview(screen.getByRole('dialog'));
    first.unmount();
    expect((await saveDisciplineLists(db, { ...lists, mistakes: lists.mistakes.slice(1) })).ok).toBe(true);

    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'After the trade: reviewed, 1 mistake'));
    const dialog = screen.getByRole('dialog');
    const mistakeBoxes = within(within(dialog).getByRole('group', { name: 'Any mistakes?' })).getAllByRole('checkbox') as HTMLInputElement[];
    expect(mistakeBoxes).toHaveLength(lists.mistakes.length);
    expect(mistakeBoxes.at(-1)!.checked).toBe(true);
    expect(box(dialog, removed.label).checked).toBe(true);
    await saveReview(dialog);
    const loaded = await loadTradeDiscipline(db, [tradeId]);
    expect(loaded.ok && loaded.records.get(tradeId)?.mistakes).toEqual([{ itemId: removed.id, label: removed.label }]);
  });

  it('keeps the answers and says why when the save fails', async () => {
    const onSaved = vi.fn();
    const save = vi.fn()
      .mockResolvedValueOnce({ ok: false, type: 'storage-error', reason: 'discipline-save-failed' })
      .mockResolvedValueOnce({ ok: false, type: 'validation-error', reason: 'note-too-long' });
    render(<TradeReviewControl symbol="BTCUSDT" tradeId="t-1" scope="real" reviewItems={lists.review} mistakeItems={lists.mistakes} record={null} save={save} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'After the trade: not reviewed yet' }));
    const dialog = screen.getByRole('dialog', { name: 'After the trade: BTCUSDT' });
    fireEvent.click(box(dialog, lists.mistakes[2].label));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save review' })); });
    expect(within(dialog).getByRole('alert').textContent).toBe('Kairos could not save your review. Your answers are kept so you can try again.');
    expect(box(dialog, lists.mistakes[2].label).checked).toBe(true);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save review' })); });
    expect(within(dialog).getByRole('alert').textContent).toBe('Keep your note under 500 characters.');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 't-1', scope: 'real', half: 'review', mistakeIds: [lists.mistakes[2].id], note: '' }));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('works for a closed paper trade on the Practice page', async () => {
    const db = await database();
    const saved = await savePracticeTrade(db, closed('BTCUSDT'));
    if (!saved.ok) throw new Error('fixture');
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'After the trade: not reviewed yet'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(box(dialog, lists.review[1].label));
    await saveReview(dialog);
    expect(within(card('BTCUSDT')).getByRole('button', { name: 'After the trade: reviewed, no mistakes' })).toBeTruthy();
    const loaded = await loadTradeDiscipline(db, [saved.tradeId]);
    expect(loaded.ok && loaded.records.get(saved.tradeId)?.reviewedAt).not.toBeNull();
  });
});
