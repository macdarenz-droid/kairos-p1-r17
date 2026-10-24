import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBeforeYouSave, loadRecentSizes, previewBeforeYouSave, projectBeforeYouSave, projectUsualSize, type BeforeYouSaveFacts, type BeforeYouSaveInput } from '../src/application/discipline/beforeYouSave';
import { saveGoalsPreference } from '../src/application/goals/goalsPreference';
import { savePracticeTrade } from '../src/application/practice';
import { createEmptyManualTradeDraft, saveManualTrade, type ManualTradeDraft, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosRepositories } from '../src/data/repositories';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-before-you-save-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const d = (value: string) => value as DecimalString;
const now = '2026-10-24T14:00:00.000Z';
const minutesFromNow = (minutes: number) => new Date(Date.parse(now) + minutes * 60_000).toISOString();
const noFacts: BeforeYouSaveFacts = { tradeLimit: null, lastClosed: null, upcomingNews: [] };
const input = (overrides: Partial<BeforeYouSaveInput> = {}): BeforeYouSaveInput => ({
  status: 'draft', symbol: 'BTCUSDT', openedAt: null, stop: '95', size: d('1'), brokenRules: 0, now, facts: noFacts, recentSizes: null, ...overrides,
});
const kinds = (value: BeforeYouSaveInput) => projectBeforeYouSave(value).map(note => note.kind);
const texts = (value: BeforeYouSaveInput) => projectBeforeYouSave(value).map(note => note.text);

describe('T-057c what "Before you save" names', () => {
  it('names everything that applies, in its order, with its words', () => {
    const facts: BeforeYouSaveFacts = {
      tradeLimit: { today: 3, limit: 3, timeZone: 'UTC' },
      lastClosed: { closedAt: minutesFromNow(-12), outcome: 'loss' },
      upcomingNews: [{ name: 'US CPI', startsAt: minutesFromNow(12) }, { name: 'Fed speech', startsAt: minutesFromNow(20) }, { name: 'ECB', startsAt: minutesFromNow(25) }],
    };
    expect(texts(input({ stop: '', size: d('3'), brokenRules: 1, facts, recentSizes: [d('1'), d('1'), d('1'), d('2'), d('1')] }))).toEqual([
      'This would be trade 4 today. Your most is 3.',
      'Your last trade was a loss 12 minutes ago.',
      'No stop is written for this trade.',
      'Big news in 12 minutes: US CPI and 2 more.',
      'This size is more than twice your usual 1 for BTCUSDT.',
      "1 of your strategy's rules is broken.",
    ]);
    expect(texts(input({ brokenRules: 2 }))).toEqual(["2 of your strategy's rules are broken."]);
  });

  it('asks only a draft or open trade, never one logged after it closed', () => {
    for (const status of ['closed', 'cancelled', ''] as const) expect(kinds(input({ status, stop: '' }))).toEqual([]);
    expect(kinds(input({ status: 'open', openedAt: now, stop: '' }))).toEqual(['no-stop']);
  });

  it('counts the daily limit for a planned trade, and for an open trade only when it opened today', () => {
    const facts = { ...noFacts, tradeLimit: { today: 2, limit: 3, timeZone: 'Europe/London' } };
    expect(kinds(input({ facts }))).toEqual([]);
    const full = { ...noFacts, tradeLimit: { today: 3, limit: 3, timeZone: 'Europe/London' } };
    expect(kinds(input({ facts: full }))).toEqual(['trade-limit']);
    expect(kinds(input({ status: 'open', openedAt: now, facts: full }))).toEqual(['trade-limit']);
    expect(kinds(input({ status: 'open', openedAt: '2026-10-22T09:00:00.000Z', facts: full }))).toEqual([]);
  });

  it('a loss in the last 30 minutes only; a win or an older loss is not named', () => {
    const loss = (minutesAgo: number, outcome: 'loss' | 'profit' = 'loss') => texts(input({ facts: { ...noFacts, lastClosed: { closedAt: minutesFromNow(-minutesAgo), outcome } } }));
    expect(loss(0)).toEqual(['Your last trade was a loss just now.']);
    expect(loss(1)).toEqual(['Your last trade was a loss 1 minute ago.']);
    expect(loss(30)).toEqual(['Your last trade was a loss 30 minutes ago.']);
    expect(loss(31)).toEqual([]);
    expect(loss(5, 'profit')).toEqual([]);
  });

  it('big news from now to 30 minutes ahead; "now" within the first minute', () => {
    const news = (minutes: number) => texts(input({ facts: { ...noFacts, upcomingNews: [{ name: 'US CPI', startsAt: minutesFromNow(minutes) }] } }));
    expect(news(0)).toEqual(['Big news now: US CPI.']);
    expect(news(1.5)).toEqual(['Big news now: US CPI.']);
    expect(news(2)).toEqual(['Big news in 2 minutes: US CPI.']);
    expect(news(30)).toEqual(['Big news in 30 minutes: US CPI.']);
    expect(news(31)).toEqual([]);
    expect(news(-1)).toEqual([]);
  });

  it('the usual size is the median of the last 20 closes of the symbol, from 5; more than twice it is named', () => {
    expect(projectUsualSize([d('1'), d('2'), d('3'), d('4')])).toBeNull();
    expect(projectUsualSize([d('1'), d('5'), d('2'), d('4'), d('3')])).toBe('3');
    expect(projectUsualSize([d('1'), d('2'), d('3'), d('4'), d('5'), d('6')])).toBe('3.5');
    // Only the newest 20 count.
    expect(projectUsualSize([...Array(20).fill(d('1')), ...Array(30).fill(d('100'))])).toBe('1');
    const recentSizes = [d('0.5'), d('0.5'), d('0.5'), d('0.5'), d('0.5')];
    expect(kinds(input({ size: d('1'), recentSizes }))).toEqual([]);
    expect(kinds(input({ size: d('1.01'), recentSizes }))).toEqual(['bigger-size']);
    expect(kinds(input({ size: d('9'), recentSizes: null }))).toEqual([]);
  });

  it('when the reads failed, names only what the form knows', () => {
    expect(kinds(input({ stop: '', brokenRules: 1, facts: null }))).toEqual(['no-stop', 'rule-broken']);
  });
});

describe('T-057c the form draft as the box reads it', () => {
  const sizes = [d('1'), d('1'), d('1'), d('1'), d('1')];
  const facts = (tradeLimit: BeforeYouSaveFacts['tradeLimit'] = null): BeforeYouSaveFacts => ({ ...noFacts, tradeLimit });
  const draft = (overrides: Partial<ManualTradeDraft> & { quantity?: string } = {}): ManualTradeDraft => {
    const empty = createEmptyManualTradeDraft();
    return { ...empty, symbol: 'BTCUSDT', status: 'draft', ...overrides, plan: { ...empty.plan, plannedStopPrice: '95', plannedQuantity: overrides.quantity ?? '' } };
  };
  const kindsOf = (value: ManualTradeDraft, rows: { type: 'entry' | 'exit'; quantity: string }[] = [], limit: BeforeYouSaveFacts['tradeLimit'] = null) =>
    previewBeforeYouSave(value, rows, 0, now, facts(limit), sizes).map(note => note.text);

  it('a draft is sized by its planned quantity, with the symbol as a save writes it', () => {
    // The words leave the typed size out, so they are not read out again on every digit.
    expect(kindsOf(draft({ symbol: ' btcusdt ', quantity: '3' }))).toEqual(['This size is more than twice your usual 1 for BTCUSDT.']);
    expect(kindsOf(draft({ quantity: '2' }))).toEqual([]);
    expect(kindsOf(draft({ quantity: 'two' }))).toEqual([]);
  });

  it('an open trade is sized by its entry rows, and counts today by its open time', () => {
    const open = draft({ status: 'open', openedAt: new Date(now).toISOString().slice(0, 16), quantity: '9' });
    // Both entries count (1 + 1.5 is more than twice 1); exits never do (1 + 0.5 stays under, whatever the exit).
    expect(kindsOf(open, [{ type: 'entry', quantity: '1' }, { type: 'entry', quantity: '1.5' }, { type: 'exit', quantity: '9' }])).toEqual(['This size is more than twice your usual 1 for BTCUSDT.']);
    expect(kindsOf(open, [{ type: 'entry', quantity: '1' }, { type: 'entry', quantity: '0.5' }, { type: 'exit', quantity: '9' }])).toEqual([]);
    expect(kindsOf(open, [{ type: 'entry', quantity: '1' }, { type: 'entry', quantity: '' }])).toEqual([]);
    expect(kindsOf({ ...open, openedAt: '' }, [], { today: 1, limit: 1, timeZone: 'UTC' })).toEqual(['This size is more than twice your usual 1 for BTCUSDT.']);
  });
});

describe('T-057c the reads', () => {
  const closedTrade = (symbol: string, closedAt: string, exit: string, quantity = '1'): SaveManualTradeInput => ({
    symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT',
    openedAt: minutesFromNow(-120), closedAt,
    executions: [{ type: 'entry', price: '100', quantity, executedAt: minutesFromNow(-120) }, { type: 'exit', price: exit, quantity, executedAt: closedAt }],
  });

  it("reads the daily limit, the last close, saved big news and the symbol's recent sizes, in the scope asked", async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now);
    expect((await saveGoalsPreference(db, { maxTradesPerDay: '2' })).ok).toBe(true);
    for (const [index, size] of ['1', '2', '3', '4', '5'].entries()) await saveManualTrade(db, closedTrade('BTCUSDT', minutesFromNow(-60 + index), '101', size));
    await saveManualTrade(db, closedTrade('ETHUSDT', minutesFromNow(-10), '90'));
    await savePracticeTrade(db, closedTrade('SOLUSDT', minutesFromNow(-2), '120'));
    const big: EconomicEventRecord = { id: economicEventId('typed', 'cpi'), source: 'typed', title: 'US CPI', currency: 'USD', startsAt: minutesFromNow(12), impact: 'high', expected: null, previous: null, actual: null, savedAt: now, fetchedAt: null };
    const small: EconomicEventRecord = { ...big, id: economicEventId('typed', 'small'), title: 'Small one', impact: 'low' };
    const later: EconomicEventRecord = { ...big, id: economicEventId('typed', 'fed'), title: 'Fed speech', startsAt: minutesFromNow(360) };
    const tomorrow: EconomicEventRecord = { ...big, id: economicEventId('typed', 'next'), title: 'Next day', startsAt: minutesFromNow(24 * 60 + 1) };
    await db.economicEvents.bulkPut([big, small, later, tomorrow]);

    const real = await loadBeforeYouSave(db, { scope: 'real', now });
    if (!real.ok) throw new Error('read failed');
    expect(real.facts.tradeLimit).toEqual({ today: 6, limit: 2, timeZone: 'UTC' });
    expect(real.facts.lastClosed).toEqual({ closedAt: minutesFromNow(-10), outcome: 'loss' });
    // Read a day ahead: a form left open names news as it comes within 30 minutes.
    expect(real.facts.upcomingNews).toEqual([{ name: 'US CPI', startsAt: minutesFromNow(12) }, { name: 'Fed speech', startsAt: minutesFromNow(360) }]);
    expect(texts(input({ now: minutesFromNow(340), facts: real.facts }))).toContain('Big news in 20 minutes: Fed speech.');
    expect(await loadRecentSizes(db, { scope: 'real', symbol: ' btcusdt' })).toEqual({ ok: true, symbol: 'BTCUSDT', sizes: ['5', '4', '3', '2', '1'] });
    expect(await loadRecentSizes(db, { scope: 'real', symbol: 'SOLUSDT' })).toEqual({ ok: true, symbol: 'SOLUSDT', sizes: [] });
    expect(await loadRecentSizes(db, { scope: 'practice', symbol: 'SOLUSDT' })).toEqual({ ok: true, symbol: 'SOLUSDT', sizes: ['1'] });

    // Only a symbol's newest 20 closes are read, newest first.
    for (let index = 0; index < 22; index += 1) await saveManualTrade(db, closedTrade('XRPUSDT', minutesFromNow(-100 + index), '101', String(index + 1)));
    const xrp = await loadRecentSizes(db, { scope: 'real', symbol: 'XRPUSDT' });
    expect(xrp.ok && xrp.sizes).toEqual(Array.from({ length: 20 }, (_, index) => String(22 - index)));

    // Only a close of the last 30 minutes is read: an older one is never named, so it is not looked for.
    const afterWindow = await loadBeforeYouSave(db, { scope: 'real', now: minutesFromNow(41) });
    expect(afterWindow.ok && afterWindow.facts.lastClosed).toBeNull();

    const practice = await loadBeforeYouSave(db, { scope: 'practice', now });
    if (!practice.ok) throw new Error('read failed');
    expect(practice.facts.tradeLimit).toBeNull();
    expect(practice.facts.lastClosed).toEqual({ closedAt: minutesFromNow(-2), outcome: 'profit' });
  });
});

describe("T-057c one symbol's latest closes, read either way", () => {
  it('a busy symbol (over 500 trades) is walked from the newest close and gives the same answer, in scope', async () => {
    const db = await database();
    const trade = (index: number, overrides: Partial<TradeRecord> = {}): TradeRecord => {
      const at = new Date(Date.parse(now) - (1000 - index) * 60_000).toISOString();
      return { id: `busy-${index}` as TradeId, symbol: 'BUSY', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: at, closedAt: at, createdAt: at, updatedAt: at, ...overrides };
    };
    const rows = Array.from({ length: 520 }, (_, index) => trade(index, index % 7 === 0 ? { source: 'paper' } : index % 11 === 0 ? { status: 'open', closedAt: null } : {}));
    await db.trades.bulkPut([...rows, trade(999, { id: 'other' as TradeId, symbol: 'OTHER' })]);
    const expected = rows.filter(row => row.source === 'manual' && row.status === 'closed').reverse().slice(0, 20).map(row => row.id);
    const read = await createKairosRepositories(db).trades.scopedBySource(['manual']).listRecentClosedBySymbol('BUSY', 20);
    expect(read.map(row => row.id)).toEqual(expected);
    // The same rows read whole once the symbol has 500 or fewer trades.
    await db.trades.bulkDelete(rows.slice(0, 30).map(row => row.id));
    const whole = await createKairosRepositories(db).trades.scopedBySource(['manual']).listRecentClosedBySymbol('BUSY', 20);
    expect(whole.map(row => row.id)).toEqual(expected);
    expect(await createKairosRepositories(db).trades.scopedBySource(['manual']).listRecentClosedBySymbol('NONE', 20)).toEqual([]);
  });
});
