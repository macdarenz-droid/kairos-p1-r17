import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { projectDisciplineScore } from '../src/application/discipline/disciplineScore';
import { EMPTY_GOALS_PREFERENCE, loadGoalsProgress, projectGoalsProgress, saveGoalsPreference } from '../src/application/goals';
import type { JournalHistoryEntry } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-goals-v2-progress-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const now = '2026-10-01T12:00:00.000Z';
const record = (tradeId: string, full: boolean, reviewed: boolean): TradeDisciplineRecord => ({
  id: `discipline-${tradeId}`, tradeId, createdAt: now, updatedAt: now, note: '', mistakes: [],
  preTradeChecklist: [{ itemId: 'a', label: 'A', answer: 'yes' }, { itemId: 'b', label: 'B', answer: full ? 'yes' : 'no' }], checklistCompletedAt: now,
  postTradeReview: reviewed ? [{ itemId: 'r', label: 'R', answer: 'yes' }] : [], reviewedAt: reviewed ? now : null,
} as unknown as TradeDisciplineRecord);
const habits = { ...EMPTY_GOALS_PREFERENCE, reviewEveryTrade: true, tickEveryStep: true };
const ready = (value: ReturnType<typeof projectGoalsProgress>) => { if (value.kind !== 'ready') throw new Error('not ready'); return value; };

describe('T-058b the habit goals and the fills', () => {
  it('counts reviews and fully ticked checklists over the month\'s closed trades; a trade logged after it closed is not ticked', () => {
    // Four closed trades: two reviewed, one fully ticked, one with no checklist at all (logged after it closed).
    const records = new Map([['t1', record('t1', true, true)], ['t2', record('t2', false, true)], ['t3', record('t3', false, false)]]);
    const score = projectDisciplineScore({ closedTradeIds: ['t1', 't2', 't3', 't4'], records });
    const progress = ready(projectGoalsProgress({ preference: habits, entries: [], timeZone: 'UTC', now, discipline: { score, checklistSteps: 2 } }));
    expect(progress.reviewEveryTrade).toEqual({ kind: 'progress', reviewed: 2, closed: 4, fill: 50, reached: false });
    expect(progress.tickEveryStep).toEqual({ kind: 'progress', ticked: 1, closed: 4, fill: 25, reached: false });
    const all = projectDisciplineScore({ closedTradeIds: ['t1'], records });
    expect(ready(projectGoalsProgress({ preference: habits, entries: [], timeZone: 'UTC', now, discipline: { score: all, checklistSteps: 2 } })).reviewEveryTrade).toMatchObject({ reached: true, fill: 100 });
  });

  it('a month with no closed trade is not reached; no steps and an unread score say so', () => {
    const none = projectDisciplineScore({ closedTradeIds: [], records: new Map() });
    const empty = ready(projectGoalsProgress({ preference: habits, entries: [], timeZone: 'UTC', now, discipline: { score: none, checklistSteps: 2 } }));
    expect(empty.reviewEveryTrade).toEqual({ kind: 'progress', reviewed: 0, closed: 0, fill: 0, reached: false });
    expect(ready(projectGoalsProgress({ preference: habits, entries: [], timeZone: 'UTC', now, discipline: { score: none, checklistSteps: 0 } })).tickEveryStep).toEqual({ kind: 'no-steps' });
    const unread = ready(projectGoalsProgress({ preference: habits, entries: [], timeZone: 'UTC', now }));
    expect(unread.reviewEveryTrade).toEqual({ kind: 'unavailable' });
    expect(unread.tickEveryStep).toEqual({ kind: 'unavailable' });
  });
});

describe('T-058b the goals read', () => {
  const closedTrade = (closedAt: string, exit: string) => ({
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: closedAt, closedAt,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: closedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
  } as const);

  it("reads last month's days of this week, and the discipline records only when a habit is on", async () => {
    const db = await database();
    const { metadata } = createKairosRepositories(db);
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', now);
    // Tuesday 29 September is in this week (from Monday 28 September) but last month.
    const saved = await saveManualTrade(db, closedTrade('2026-09-29T10:00:00.000Z', '40'));
    if (!saved.ok) throw new Error('fixture');
    expect((await saveGoalsPreference(db, { lossLimitPerDay: '100', lossLimitPerWeek: '100', lossLimitCurrency: 'USDT' }, { now: () => now })).ok).toBe(true);
    let reads = 0;
    db.tradeDiscipline.hook('reading', value => { reads += 1; return value; });
    const off = await loadGoalsProgress(db, now);
    if (off.kind !== 'ready' || off.progress.kind !== 'ready') throw new Error('not ready');
    expect(off.progress.weeklyLoss).toMatchObject({ kind: 'counted', lost: '60', left: '40', state: 'within' });
    expect(off.progress.dailyLoss).toMatchObject({ kind: 'counted', lost: '0', closedTrades: 0 });
    expect(reads).toBe(0);

    const october = await saveManualTrade(db, closedTrade('2026-10-01T09:00:00.000Z', '110'));
    if (!october.ok) throw new Error('fixture');
    expect((await saveTradeDiscipline(db, { tradeId: october.tradeId as TradeId, scope: 'real', half: 'review', answers: [], mistakeIds: [], note: 'calm' })).ok).toBe(true);
    expect((await saveGoalsPreference(db, { reviewEveryTrade: true }, { now: () => now })).ok).toBe(true);
    const on = await loadGoalsProgress(db, now);
    if (on.kind !== 'ready' || on.progress.kind !== 'ready') throw new Error('not ready');
    // September's trade is not this month's: one closed trade, reviewed.
    expect(on.progress.reviewEveryTrade).toEqual({ kind: 'progress', reviewed: 1, closed: 1, fill: 100, reached: true });
    expect(reads).toBeGreaterThan(0);
  });
});
