import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { SettingsRoute } from '../src/app/SettingsRoute';
import { disciplineListsPreferenceMetadataKey, loadDisciplineLists } from '../src/application/discipline';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ThemeProvider } from '../src/design-system/themes';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-lists-editor-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const lists = KAIROS_DEFAULT_DISCIPLINE_LISTS;
const card = () => screen.getByRole('form', { name: 'Your checklist' });
const group = (legend: string) => within(card()).getByRole('group', { name: legend });
async function mount(db: KairosDatabase) {
  render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
  await waitFor(() => expect(within(card()).getByRole('textbox', { name: 'Step 1' })).toBeTruthy());
}
async function save() {
  await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Save your checklist' })); });
}

describe('T-032c "Your checklist" in Settings', () => {
  it('shows the default lists in three groups', async () => {
    const db = await database();
    await mount(db);
    const values = (legend: string) => within(group(legend)).getAllByRole('textbox').map(input => (input as HTMLInputElement).value);
    expect(values('Before you trade: your steps')).toEqual(lists.checklist.map(item => item.label));
    expect(values('After the trade: your questions')).toEqual(lists.review.map(item => item.label));
    expect(values('Mistakes you can tag')).toEqual(lists.mistakes.map(item => item.label));
  });

  it('renames, adds and removes items and saves all three lists', async () => {
    const db = await database();
    await mount(db);
    fireEvent.change(within(card()).getByRole('textbox', { name: 'Step 1' }), { target: { value: 'My plan is on paper' } });
    fireEvent.click(within(group('Mistakes you can tag')).getByRole('button', { name: 'Add a mistake' }));
    fireEvent.change(within(card()).getByRole('textbox', { name: `Mistake ${lists.mistakes.length + 1}` }), { target: { value: 'Too many trades' } });
    fireEvent.click(within(card()).getByRole('button', { name: 'Remove question 2' }));
    await save();
    expect((await within(card()).findByRole('status')).textContent).toBe('Your checklist is saved.');

    const loaded = await loadDisciplineLists(db);
    if (!loaded.ok) throw new Error('read');
    expect(loaded.lists.checklist[0]).toEqual({ id: lists.checklist[0].id, label: 'My plan is on paper', ruleId: null });
    expect(loaded.lists.review.map(item => item.id)).toEqual(lists.review.filter((_, index) => index !== 1).map(item => item.id));
    const added = loaded.lists.mistakes.at(-1)!;
    expect(added.label).toBe('Too many trades');
    expect(added.ruleId).toBeNull();
    expect(lists.mistakes.map(item => item.id)).not.toContain(added.id);
  });

  it('refuses an empty item and a list over 20 items, leaving the stored lists alone', async () => {
    const db = await database();
    await mount(db);
    fireEvent.click(within(group('Before you trade: your steps')).getByRole('button', { name: 'Add a step' }));
    await save();
    expect((await within(card()).findByRole('alert')).textContent).toBe('Each item needs some words. Fill it in or remove it.');
    fireEvent.click(within(card()).getByRole('button', { name: `Remove step ${lists.checklist.length + 1}` }));
    const add = within(group('Mistakes you can tag')).getByRole('button', { name: 'Add a mistake' });
    for (let count = lists.mistakes.length; count < 21; count += 1) fireEvent.click(add);
    within(group('Mistakes you can tag')).getAllByRole('textbox').forEach((input, index) => {
      if ((input as HTMLInputElement).value === '') fireEvent.change(input, { target: { value: `Extra mistake ${index}` } });
    });
    await save();
    expect((await within(card()).findByRole('alert')).textContent).toBe('Keep at most 20 items in each list.');
    expect(await db.metadata.get(disciplineListsPreferenceMetadataKey)).toBeUndefined();
  });

  it('shows the renamed step on an unanswered draft card', async () => {
    const db = await database();
    await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedQuantity: '2' } });
    await mount(db);
    fireEvent.change(within(card()).getByRole('textbox', { name: 'Step 1' }), { target: { value: 'My plan is on paper' } });
    await save();
    expect(await within(card()).findByRole('status')).toBeTruthy();
    cleanup();
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    let button: HTMLElement | null = null;
    await waitFor(() => { button = screen.getByRole('button', { name: 'Before you trade: not done yet' }); });
    fireEvent.click(button!);
    expect(within(screen.getByRole('dialog')).getByText('My plan is on paper')).toBeTruthy();
  });
});
