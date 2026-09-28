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
import { TradeChecklistControl } from '../src/features/discipline/TradeChecklistControl';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-checklist-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const draft = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedQuantity: '2' } } as const);
const open = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T07:00:00.000Z' } as const);
const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] } as const);
const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const cardButton = async (symbol: string, name: string) => { let found: HTMLElement | null = null; await waitFor(() => { found = within(card(symbol)).getByRole('button', { name }); }); return found!; };
const n = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.length;
const idOf = (saved: Awaited<ReturnType<typeof saveManualTrade>>) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId; };

describe('T-032a "Before you trade" on draft and open cards', () => {
  it('shows the button on draft and open cards only, keeping the list items', async () => {
    const db = await database();
    await saveManualTrade(db, draft('BTCUSDT'));
    await saveManualTrade(db, open('ETHUSDT'));
    await saveManualTrade(db, closed('SOLUSDT'));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByRole('button', { name: 'Before you trade: not done yet' })).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(within(card('ETHUSDT')).getByRole('button', { name: 'Before you trade: not done yet' })).toBeTruthy();
    expect(within(card('SOLUSDT')).queryByRole('button', { name: /Before you trade/ })).toBeNull();
  });

  it('saves the ticked steps and shows the count on the card', async () => {
    const db = await database();
    const tradeId = idOf(await saveManualTrade(db, draft('BTCUSDT')));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'Before you trade: not done yet'));
    const dialog = screen.getByRole('dialog', { name: 'Before you trade: BTCUSDT' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes).toHaveLength(n);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const button = within(card('BTCUSDT')).getByRole('button', { name: `Before you trade: 2 of ${n} ticked` });
    expect(button.querySelectorAll('[data-ticked="true"]')).toHaveLength(2);
    const loaded = await loadTradeDiscipline(db, [tradeId as TradeId]);
    if (!loaded.ok) throw new Error('read');
    const checklist = loaded.records.get(tradeId as TradeId)!.preTradeChecklist;
    expect(checklist).toHaveLength(n);
    expect(checklist.filter(answer => answer.answer === 'yes')).toHaveLength(2);
    expect(checklist.map(answer => answer.label)).toEqual(KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.map(item => item.label));
    fireEvent.click(button);
    const again = within(screen.getByRole('dialog')).getAllByRole('checkbox') as HTMLInputElement[];
    expect(again.map(box => box.checked)).toEqual(Array.from({ length: n }, (_, index) => index < 2));
  });

  it('keeps the sheet and the ticks when the save fails', async () => {
    const onSaved = vi.fn();
    const save = vi.fn(async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'discipline-save-failed' as const }));
    render(<TradeChecklistControl symbol="BTCUSDT" tradeId="t-1" scope="real" items={KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist} record={null} save={save} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Before you trade: not done yet' }));
    const dialog = screen.getByRole('dialog', { name: 'Before you trade: BTCUSDT' });
    fireEvent.click(within(dialog).getAllByRole('checkbox')[0]);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' })); });
    expect(within(dialog).getByRole('alert').textContent).toBe('Kairos could not save your checklist. Your ticks are kept so you can try again.');
    expect((within(dialog).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 't-1', scope: 'real', half: 'checklist' }));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps the words a trade was answered with after a step is renamed', async () => {
    const db = await database();
    await saveManualTrade(db, draft('BTCUSDT'));
    await saveManualTrade(db, open('ETHUSDT'));
    const first = render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'Before you trade: not done yet'));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save checklist' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount();
    const oldLabel = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist[0].label;
    const renamed = { ...KAIROS_DEFAULT_DISCIPLINE_LISTS, checklist: KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.map((item, index) => (index === 0 ? { ...item, label: 'My plan is on paper' } : item)) };
    expect((await saveDisciplineLists(db, renamed)).ok).toBe(true);

    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', `Before you trade: 0 of ${n} ticked`));
    expect(within(screen.getByRole('dialog')).getByText(oldLabel)).toBeTruthy();
    expect(within(screen.getByRole('dialog')).queryByText('My plan is on paper')).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(card('ETHUSDT')).getByRole('button', { name: 'Before you trade: not done yet' }));
    expect(within(screen.getByRole('dialog')).getByText('My plan is on paper')).toBeTruthy();
  });

  it('works for a practice draft on the Practice page', async () => {
    const db = await database();
    const saved = await savePracticeTrade(db, draft('BTCUSDT'));
    if (!saved.ok) throw new Error('fixture');
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'Before you trade: not done yet'));
    const dialog = screen.getByRole('dialog', { name: 'Before you trade: BTCUSDT' });
    fireEvent.click(within(dialog).getAllByRole('checkbox')[0]);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const loaded = await loadTradeDiscipline(db, [saved.tradeId]);
    expect(loaded.ok && loaded.records.get(saved.tradeId)?.preTradeChecklist.filter(answer => answer.answer === 'yes')).toHaveLength(1);
  });
});
