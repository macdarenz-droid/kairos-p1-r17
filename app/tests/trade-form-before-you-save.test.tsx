import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { saveStrategy } from '../src/application/discipline/strategies';
import { saveGoalsPreference } from '../src/application/goals/goalsPreference';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosRepositories } from '../src/data/repositories';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import { TradeForm, TRADE_FORM_MODE_STORAGE_KEY, type TradeFormKind } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-before-you-save-form-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
afterEach(async () => { cleanup(); localStorage.clear(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = new Date('2026-10-24T14:00:00.000Z');
const pad = (value: number) => String(value).padStart(2, '0');
/** The fixed clock in the form's `datetime-local` format, in the device's time. */
const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal') => {
  localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, 'full');
  return render(<TradeForm db={db} kind={kind} now={() => now} onSaved={async () => undefined} />);
};
function planned(status: 'draft' | 'open' = 'draft', stop = '95'): void {
  type(/^Symbol/, 'BTCUSDT'); type(/^Market/, 'crypto'); type(/^Direction/, 'long'); type(/^Status/, status);
  if (status === 'open') type(/^Opened/, localNow);
  type('Currency code', 'USDT'); type('Planned entry', '100'); type('Planned stop', stop);
}
const box = () => screen.queryByRole('region', { name: 'Before you save' });
const save = (kind: TradeFormKind = 'journal') => fireEvent.click(screen.getByRole('button', { name: kind === 'practice' ? 'Save practice trade' : 'Save trade' }));
/** The reads settle, then the trade limit (or its absence) is known. */
const settled = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

describe('T-057c "Before you save" in the form', () => {
  it('appears when something applies, follows what is typed, and goes when nothing does', async () => {
    const db = await database();
    const steps = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist;
    const saved = await saveStrategy(db, { id: null, name: 'Careful', rules: [{ id: 'check', kind: 'checklist-complete' }] });
    if (!saved.ok) throw new Error('fixture');
    mount(db);
    planned();
    await settled();
    expect(box()).toBeNull();
    type('Planned stop', '');
    expect(within(box()!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['No stop is written for this trade.']);
    // A missed checklist step breaks the strategy's rule: the box names it too.
    fireEvent.change(await screen.findByLabelText(/^Strategy/), { target: { value: saved.strategy.id } });
    fireEvent.click(await within(await screen.findByRole('group', { name: /Before you trade/ })).findByRole('checkbox', { name: steps[0]!.label }));
    expect(within(box()!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['No stop is written for this trade.', "1 of your strategy's rules is broken."]);
    type('Planned stop', '95');
    fireEvent.change(screen.getByLabelText(/^Strategy/), { target: { value: '' } });
    expect(box()).toBeNull();
    // A trade logged after it closed is not asked.
    type('Planned stop', '');
    type(/^Status/, 'closed');
    expect(box()).toBeNull();
  });

  it('reads the daily limit again after a save: the next planned trade shows the limit line, and practice never does', async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now.toISOString());
    expect((await saveGoalsPreference(db, { maxTradesPerDay: '1' })).ok).toBe(true);
    mount(db);
    planned('open');
    await settled();
    expect(box()).toBeNull();
    save();
    await screen.findByRole('status');
    planned();
    await waitFor(() => expect(within(box()!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['This would be trade 2 today. Your most is 1.']));
    cleanup();
    mount(db, 'practice');
    planned();
    await settled();
    expect(box()).toBeNull();
  });

  it("names a size more than twice the symbol's usual, read for the symbol typed", async () => {
    const db = await database();
    for (const minutes of [50, 40, 30, 20, 10]) {
      const at = new Date(now.getTime() - minutes * 60_000).toISOString();
      await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: at, closedAt: at,
        executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: at }, { type: 'exit', price: '101', quantity: '1', executedAt: at }] });
    }
    mount(db);
    planned();
    type('Planned quantity', '3');
    await waitFor(() => expect(within(box()!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['This size is more than twice your usual 1 for BTCUSDT.']));
    type(/^Symbol/, 'ETHUSDT');
    await waitFor(() => expect(box()).toBeNull());
    type('Planned quantity', '2');
    type(/^Symbol/, 'BTCUSDT');
    // Past the pause before the symbol's read: 2 is not more than twice 1.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
    expect(box()).toBeNull();
  });

  it('T-058c: names a loss limit reached today, and keeps it with the reason in the same write', async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now.toISOString());
    expect((await saveGoalsPreference(db, { lossLimitPerDay: '100', lossLimitCurrency: 'USDT' })).ok).toBe(true);
    const at = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect((await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: at, closedAt: at,
      executions: [{ type: 'entry', price: '200', quantity: '1', executedAt: at }, { type: 'exit', price: '80', quantity: '1', executedAt: at }] })).ok).toBe(true);
    mount(db);
    planned();
    await waitFor(() => expect(within(box()!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['You have lost 120 USDT today. Your most for a day is 100 USDT.']));
    fireEvent.change(screen.getByLabelText(/Why save anyway\?/), { target: { value: 'Small size, clear plan.' } });
    save();
    await screen.findByRole('status');
    const records = await db.tradeDiscipline.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]!.beforeSave).toMatchObject({ notes: ['loss-limit'], reason: 'Small size, clear plan.' });
  });

  it('Save stays one tap, and keeps what the box named with the reason in the same write', async () => {
    const db = await database();
    const { container } = mount(db);
    planned('draft', '');
    await settled();
    expect(box()).not.toBeNull();
    const reason = screen.getByLabelText(/Why save anyway\?/);
    expect(reason).toHaveAttribute('maxlength', '200');
    fireEvent.change(reason, { target: { value: '  A clean setup.  ' } });
    expect(await axeViolations(container)).toEqual([]);
    save();
    await screen.findByRole('status');
    const [trade] = await db.trades.toArray();
    const [record] = await db.tradeDiscipline.toArray();
    expect(record).toMatchObject({ tradeId: trade!.id, beforeSave: { notes: ['no-stop'], reason: 'A clean setup.', at: trade!.createdAt } });
    // The form empties, the reason with it.
    planned('draft', '');
    expect(screen.getByLabelText(/Why save anyway\?/)).toHaveValue('');
  });

  it('keeps nothing when the box named nothing, and no reason when none was typed', async () => {
    const db = await database();
    mount(db, 'practice');
    planned();
    await settled();
    save('practice');
    await screen.findByRole('status');
    expect(await db.trades.count()).toBe(1);
    expect(await db.tradeDiscipline.toArray()).toEqual([]);
    planned('draft', '');
    save('practice');
    await waitFor(async () => expect(await db.trades.count()).toBe(2));
    const [record] = await db.tradeDiscipline.toArray();
    expect(record!.beforeSave).toMatchObject({ notes: ['no-stop'], reason: null });
  });

  it('when the reads fail, names what the form knows and offers "Try again", which keeps focus off the page', async () => {
    const db = await database();
    db.close();
    const { container } = mount(db);
    planned('draft', '');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(box()).toHaveTextContent('No stop is written for this trade.');
    expect(box()).toHaveTextContent('Kairos could not check your limits and news.');
    expect(await axeViolations(container)).toEqual([]);
    // It fails again: focus waits on the box while it reads (a busy button is disabled), then stays on "Try again".
    act(() => { retry.focus(); });
    fireEvent.click(retry);
    expect(box()).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
    // It works: the failure line goes and focus moves to the reason.
    await db.open();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText(/Why save anyway\?/)).toHaveFocus());
    expect(box()).not.toHaveTextContent('Kairos could not check');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('reads nothing until the box can show: Quick log and a closed trade read no limits or news', async () => {
    const db = await database();
    let reads = 0;
    db.economicEvents.hook('reading', record => { reads += 1; return record; });
    const big = { id: 'typed:cpi', source: 'typed', title: 'US CPI', currency: 'USD', startsAt: new Date(now.getTime() + 12 * 60_000).toISOString(), impact: 'high', expected: null, previous: null, actual: null, savedAt: now.toISOString(), fetchedAt: null };
    await db.economicEvents.put(big as never);
    localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, 'quick');
    render(<TradeForm db={db} kind="journal" now={() => now} onSaved={async () => undefined} />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    type(/^Status/, 'closed');
    await settled();
    expect(reads).toBe(0);
    type(/^Status/, 'draft');
    await waitFor(() => expect(box()).toHaveTextContent('Big news in 12 minutes: US CPI.'));
    expect(reads).toBeGreaterThan(0);
  });

  it('when "Try again" works and nothing applies, the box closes and focus goes to Save', async () => {
    const db = await database();
    db.close();
    mount(db);
    planned();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(within(box()!).queryAllByRole('listitem')).toEqual([]);
    await db.open();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save trade' })).toHaveFocus());
    expect(box()).toBeNull();
  });
});
