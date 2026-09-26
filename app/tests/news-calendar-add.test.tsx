import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import { NewsCalendarScreen } from '../src/features/economic-calendar/NewsCalendarScreen';

const names: string[] = [];
const opened: Dexie[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
afterEach(async () => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup(); vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const NOW = '2026-09-24T04:00:00.000Z';
const now = () => NOW;
const MACHINE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const savedAt = '2026-09-20T08:00:00.000Z';
const SPEECH: EconomicEventRecord = { id: economicEventId('typed', 'speech'), source: 'typed', title: 'ECB President speaks', currency: 'EUR', startsAt: '2026-09-24T09:00:00.000Z', impact: 'medium', expected: null, previous: null, actual: null, savedAt, fetchedAt: null };
const CPI_BLS: EconomicEventRecord = {
  id: 'bls:3bc656751421b9fb', source: 'bls', title: 'Consumer Price Index', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z',
  impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T03:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z',
};

async function database(zone: string, rows: readonly EconomicEventRecord[] = []): Promise<KairosDatabase> {
  const name = `kairos-news-add-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW);
  await db.economicEvents.bulkPut([...rows]);
  return db;
}

async function openForm(db: KairosDatabase) {
  render(<NewsCalendarScreen db={db} now={now} />);
  return within(await screen.findByRole('region', { name: 'Add your own news' }));
}
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe('T-046l add your own news', () => {
  it('saves a news event on this device and shows it in its day, then clears the form', async () => {
    const db = await database(MACHINE_ZONE);
    const form = await openForm(db);
    type(form.getByLabelText(/^Name/), 'US CPI');
    type(form.getByLabelText(/^Date and time/), '2026-09-24T20:30');
    type(form.getByLabelText(/^Currency/), 'usd');
    fireEvent.click(form.getByRole('radio', { name: 'Big news' }));
    type(form.getByLabelText('Expected'), '3.1%');
    type(form.getByLabelText('Last time'), '2.9%');
    fireEvent.click(form.getByRole('button', { name: 'Save news' }));
    expect(await form.findByRole('status')).toHaveTextContent('Saved: US CPI, Thursday 24 September 2026 at 20:30.');
    const thursday = within(await screen.findByRole('group', { name: 'Thursday 24 September 2026' }));
    const item = thursday.getByText('US CPI').closest('li')!;
    expect([...item.querySelectorAll('p')].map((p) => p.textContent)).toEqual(expect.arrayContaining(['20:30 US CPI', 'USD · Big news', 'Added by you', 'Expected 3.1% · Last time 2.9%']));
    const rows = await db.economicEvents.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'typed', fetchedAt: null, startsAt: new Date('2026-09-24T20:30').toISOString(), currency: 'USD', impact: 'high', expected: '3.1%', previous: '2.9%', actual: null });
    expect(form.getByLabelText(/^Name/)).toHaveValue('');
    expect(form.getByLabelText(/^Date and time/)).toHaveValue('');
    expect(form.getByRole('radio', { name: 'Not sure' })).toBeChecked();
  });

  it('says which sizes reach the trade cards, and names both zones when the calendar zone is not this device\'s', async () => {
    const form = await openForm(await database(MACHINE_ZONE));
    expect(form.getByRole('group', { name: 'How big is it?' })).toHaveAccessibleDescription('Only news you mark as Big news shows on your trade cards.');
    expect(form.getByLabelText(/^Date and time/)).toHaveAccessibleDescription("As this device's clock shows it.");
    cleanup();
    const other = MACHINE_ZONE === 'Pacific/Kiritimati' ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati';
    const otherForm = await openForm(await database(other));
    expect(otherForm.getByLabelText(/^Date and time/)).toHaveAccessibleDescription(`As this device's clock shows it (${MACHINE_ZONE}). This calendar shows times in ${other}, so the time you see after saving can differ.`);
  });

  it('moves the calendar to the week of the news just saved', async () => {
    const form = await openForm(await database(MACHINE_ZONE));
    type(form.getByLabelText(/^Name/), 'Company earnings');
    type(form.getByLabelText(/^Date and time/), '2026-10-08T09:00');
    fireEvent.click(form.getByRole('button', { name: 'Save news' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Week of Monday 5 October 2026' })).toBeInTheDocument();
    expect(within(await screen.findByRole('group', { name: 'Thursday 8 October 2026' })).getByText('Company earnings')).toBeInTheDocument();
  });

  it('shows each field\'s error and focuses it; the numbers open first', async () => {
    const form = await openForm(await database(MACHINE_ZONE));
    const save = form.getByRole('button', { name: 'Save news' });
    fireEvent.click(save);
    await waitFor(() => expect(form.getByLabelText(/^Name/)).toHaveFocus());
    expect(form.getByLabelText(/^Name/)).toHaveAccessibleDescription(expect.stringContaining('Add a name of up to 80 characters, such as US CPI.'));
    type(form.getByLabelText(/^Name/), 'US CPI');
    fireEvent.click(save);
    await waitFor(() => expect(form.getByLabelText(/^Date and time/)).toHaveFocus());
    expect(form.getByText('Add the date and time.')).toBeInTheDocument();
    type(form.getByLabelText(/^Date and time/), '2026-09-24T20:30');
    type(form.getByLabelText(/^Currency/), 'US');
    fireEvent.click(save);
    await waitFor(() => expect(form.getByLabelText(/^Currency/)).toHaveFocus());
    expect(form.getByText('Use 3 letters, such as USD, or leave it empty.')).toBeInTheDocument();
    type(form.getByLabelText(/^Currency/), '');
    const details = form.getByText('Add the numbers (optional)').closest('details')!;
    type(form.getByLabelText('Expected'), 'x'.repeat(17));
    details.open = false;
    fireEvent.click(save);
    await waitFor(() => expect(form.getByLabelText('Expected')).toHaveFocus());
    expect(details.open).toBe(true);
    expect(form.getByText('Use up to 16 characters, such as 3.1% or 21.5K.')).toBeInTheDocument();
    expect(form.queryByRole('status')).toBeNull();
  });

  it('says when 1,000 news events are kept, and when saving fails', async () => {
    const full = Array.from({ length: 1000 }, (_, index): EconomicEventRecord => ({ ...SPEECH, id: economicEventId('typed', `n${index}`), startsAt: '2025-01-01T00:00:00.000Z' }));
    const form = await openForm(await database(MACHINE_ZONE, full));
    type(form.getByLabelText(/^Name/), 'US CPI');
    type(form.getByLabelText(/^Date and time/), '2026-09-24T20:30');
    fireEvent.click(form.getByRole('button', { name: 'Save news' }));
    expect(await form.findByRole('alert')).toHaveTextContent('You have added 1,000 news events, the most Kairos keeps. Delete some you no longer need, then save this one.');
    cleanup();

    const db = await database(MACHINE_ZONE);
    vi.spyOn(db.economicEvents, 'put').mockRejectedValue(new Error('disk full'));
    const failing = await openForm(db);
    type(failing.getByLabelText(/^Name/), 'US CPI');
    type(failing.getByLabelText(/^Date and time/), '2026-09-24T20:30');
    fireEvent.click(failing.getByRole('button', { name: 'Save news' }));
    expect(await failing.findByRole('alert')).toHaveTextContent('Kairos could not save this news. Nothing was changed.');
    expect(failing.getByLabelText(/^Name/)).toHaveValue('US CPI');
  });
});

describe('T-046l delete your own news', () => {
  it('only your news has Delete; the confirm keeps or deletes it, and focus goes where it should', async () => {
    const db = await database('Asia/Manila', [SPEECH, CPI_BLS]);
    render(<NewsCalendarScreen db={db} now={now} />);
    const thursday = within(await screen.findByRole('group', { name: 'Thursday 24 September 2026' }));
    expect(thursday.getAllByRole('button', { name: /^Delete/ })).toHaveLength(1);
    const remove = thursday.getByRole('button', { name: 'Delete ECB President speaks, Thursday 24 September 2026 at 17:00' });
    fireEvent.click(remove);
    const confirm = within(screen.getByRole('group', { name: 'Delete ECB President speaks?' }));
    expect(confirm.getByText('Delete ECB President speaks for good?')).toBeInTheDocument();
    await waitFor(() => expect(confirm.getByRole('button', { name: 'Keep it' })).toHaveFocus());
    fireEvent.click(confirm.getByRole('button', { name: 'Keep it' }));
    const again = await screen.findByRole('button', { name: 'Delete ECB President speaks, Thursday 24 September 2026 at 17:00' });
    await waitFor(() => expect(again).toHaveFocus());
    fireEvent.click(again);
    fireEvent.click(within(screen.getByRole('group', { name: 'Delete ECB President speaks?' })).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Deleted ECB President speaks.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { level: 2, name: 'Week of Monday 21 September 2026' })).toHaveFocus();
    await waitFor(() => expect(screen.queryByText(/ECB President speaks$/)).toBeNull());
    expect(await db.economicEvents.get(SPEECH.id)).toBeUndefined();
    expect(await db.economicEvents.get(CPI_BLS.id)).toBeDefined();
    expect(within(screen.getByRole('group', { name: 'Thursday 24 September 2026' })).getByText(/US inflation \(CPI\)/)).toBeInTheDocument();
  });

  it('keeps the news and says so when deleting fails', async () => {
    const db = await database('Asia/Manila', [SPEECH, CPI_BLS]);
    vi.spyOn(db.economicEvents, 'delete').mockRejectedValue(new Error('disk full'));
    render(<NewsCalendarScreen db={db} now={now} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Delete ECB President speaks/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Delete ECB President speaks?' })).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not delete this news. Nothing was changed.');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Delete ECB President speaks/ })).toHaveFocus());
    expect(screen.queryByRole('group', { name: 'Delete ECB President speaks?' })).toBeNull();
    expect(await db.economicEvents.get(SPEECH.id)).toBeDefined();
  });
});
