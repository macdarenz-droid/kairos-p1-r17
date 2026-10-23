import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveDisciplineLists } from '../src/application/discipline/disciplineListsPreference';
import { saveGoalsPreference } from '../src/application/goals/goalsPreference';
import { savePracticeTrade } from '../src/application/practice';
import { loadGettingStarted } from '../src/application/setup/gettingStarted';
import { hideGettingStarted } from '../src/application/setup/setupState';
import { saveTradedMarkets } from '../src/application/setup/tradedMarkets';
import { saveManualTrade } from '../src/application/trades';
import { saveVisualPnlTimeZone } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline/disciplineLists';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-getting-started-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';
const trade = { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' } as const;
const doneOf = async (db: KairosDatabase) => Object.fromEntries((await loadGettingStarted(db)).steps.map(step => [step.key, step.done]));

describe('T-053e Getting started', () => {
  it('lists six steps in order, none done on a fresh journal, each linked to where it is done', async () => {
    const started = await loadGettingStarted(await database());
    expect(started.steps.map(step => [step.label, step.done, step.setupStep])).toEqual([
      ['Your time zone', false, 1], ['Your home currency', false, 2], ['What you trade', false, 3],
      ['Your checklist', false, 4], ['Your first goal', false, 5], ['Your first trade', false, null],
    ]);
    expect(started).toMatchObject({ doneCount: 0, allDone: false, hidden: false });
  });

  it('ticks each step from its own saved value', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    expect(await doneOf(db)).toMatchObject({ 'time-zone': true, 'home-currency': false });
    await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now });
    await saveTradedMarkets(db, ['forex'], { now });
    expect(await doneOf(db)).toMatchObject({ 'home-currency': true, 'traded-markets': true, checklist: false });
    // The default lists, saved as they are, still count: the trader looked at them and kept them.
    await saveDisciplineLists(db, KAIROS_DEFAULT_DISCIPLINE_LISTS, { now });
    await saveGoalsPreference(db, { maxTradesPerDay: '3' }, { now });
    expect(await doneOf(db)).toMatchObject({ checklist: true, 'first-goal': true, 'first-trade': false });
    await saveManualTrade(db, trade, { now });
    const started = await loadGettingStarted(db);
    expect(started.steps.every(step => step.done)).toBe(true);
    expect(started).toMatchObject({ doneCount: 6, allDone: true });
  });

  it('does not count a practice trade as the first trade', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, trade, { now })).ok).toBe(true);
    expect(await doneOf(db)).toMatchObject({ 'first-trade': false });
  });

  it('a goal cleared again is not a goal set', async () => {
    const db = await database();
    await saveGoalsPreference(db, { tradesPerMonthTarget: '20' }, { now });
    await saveGoalsPreference(db, {}, { now });
    expect(await doneOf(db)).toMatchObject({ 'first-goal': false });
  });

  it('remembers that the trader hid the card', async () => {
    const db = await database();
    await hideGettingStarted(db, { now });
    expect(await loadGettingStarted(db)).toMatchObject({ hidden: true, allDone: false });
  });
});
