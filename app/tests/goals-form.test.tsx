import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalsRoute } from '../src/app/GoalsRoute';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { EMPTY_GOALS_PREFERENCE, loadGoalsPreference, saveGoalsPreference } from '../src/application/goals';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-goals-form-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const now = () => '2026-10-24T14:30:00.000Z';
const mount = (db: KairosDatabase) => render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const ready = () => waitFor(() => expect(screen.getByRole('button', { name: 'Save goals' })).toBeEnabled());
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save goals' }));

describe('T-058a the new goals on the Goals page', () => {
  it('saves loss limits and habits, and shows them again', async () => {
    const db = await database();
    const { container } = mount(db);
    await ready();
    expect(screen.getByLabelText('Most trades in a day')).toBeInTheDocument();
    expect(screen.getByText('Counted from the trades you close, after fees. A week runs Monday to Sunday. Open trades count when they close.')).toBeInTheDocument();
    type('Most I can lose in a day', '100');
    type('Most I can lose in a week', '250');
    type('Currency of your loss limits', 'usdt');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Review every trade/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Tick every step/ }));
    expect(screen.getByRole('checkbox', { name: /^Tick every step/ })).toHaveAccessibleDescription('Every trade has its "Before you trade" checklist with every step ticked. A trade logged after it closed has no checklist, so it counts as not ticked.');
    expect(await axeViolations(container)).toEqual([]);
    save();
    await screen.findByText('Goals saved.');
    expect(await loadGoalsPreference(db)).toEqual({ ...EMPTY_GOALS_PREFERENCE, lossLimits: { currency: 'USDT', perDay: '100', perWeek: '250' }, reviewEveryTrade: true, tickEveryStep: true });
    cleanup();
    mount(db);
    await ready();
    expect(screen.getByLabelText('Most I can lose in a day')).toHaveValue('100');
    expect(screen.getByLabelText('Currency of your loss limits')).toHaveValue('USDT');
    expect(screen.getByRole('checkbox', { name: /^Review every trade/ })).toBeChecked();
  });

  it('refuses what it cannot keep, in plain words, and writes nothing', async () => {
    const db = await database();
    expect((await saveGoalsPreference(db, { maxTradesPerDay: '2' }, { now })).ok).toBe(true);
    mount(db);
    await ready();
    const cases: [Record<string, string>, string][] = [
      [{ 'Most trades in a day': '2.5' }, 'Most trades in a day must be a whole number from 1 to 10000, or left blank.'],
      [{ 'Most I can lose in a day': '0', 'Currency of your loss limits': 'USDT' }, 'The most you can lose in a day must be an amount above 0, such as 100 or 49.50, or left blank.'],
      [{ 'Most I can lose in a day': '', 'Most I can lose in a week': 'lots' }, 'The most you can lose in a week must be an amount above 0, such as 250, or left blank.'],
      [{ 'Most I can lose in a week': '250', 'Currency of your loss limits': 'u' }, 'Type the currency of your loss limits, such as USDT or USD.'],
      [{ 'Most I can lose in a day': '300', 'Currency of your loss limits': 'USDT' }, "The most for a week can't be less than the most for a day."],
    ];
    for (const [fields, message] of cases) {
      type('Most trades in a day', '2');
      for (const [label, value] of Object.entries(fields)) type(label, value);
      save();
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    }
    expect(await loadGoalsPreference(db)).toEqual({ ...EMPTY_GOALS_PREFERENCE, maxTradesPerDay: 2 });
  });

  it('fills the loss currency with your home currency, and says when a limit is in another one', async () => {
    const db = await database();
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    mount(db);
    await ready();
    expect(screen.getByLabelText('Currency of your loss limits')).toHaveValue('EUR');
    type('Most I can lose in a day', '100');
    expect(screen.queryByText(/A limit in/)).toBeNull();
    type('Currency of your loss limits', 'usdt');
    expect(screen.getByLabelText('Currency of your loss limits')).toHaveAccessibleDescription('Your totals are in EUR. A limit in USDT counts only trades with results in USDT.');
  });
});
