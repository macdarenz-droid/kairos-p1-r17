import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDisciplineScore, projectDisciplineScore, saveTradeDiscipline } from '../src/application/discipline';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type DisciplineMistakeMark, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-discipline-score-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-10T10:00:00.000Z';
const steps = (ticked: number, asked: number) => Array.from({ length: asked }, (_, index) => ({ itemId: `step-${index}`, label: `Step ${index}`, answer: index < ticked ? 'yes' as const : 'no' as const }));
const mark = (itemId: string, label = itemId): DisciplineMistakeMark => ({ itemId, label });
function record(tradeId: string, options: { checklist?: [number, number]; reviewed?: boolean; mistakes?: DisciplineMistakeMark[]; updatedAt?: string } = {}): TradeDisciplineRecord {
  return {
    id: `d-${tradeId}` as TradeDisciplineId, tradeId: tradeId as TradeId,
    preTradeChecklist: options.checklist ? steps(...options.checklist) : [], postTradeReview: [],
    mistakes: options.mistakes ?? [], note: '',
    checklistCompletedAt: options.checklist ? at : null, reviewedAt: options.reviewed ? at : null,
    createdAt: at, updatedAt: options.updatedAt ?? at,
  };
}
const recordsOf = (...list: TradeDisciplineRecord[]) => new Map(list.map((item) => [item.tradeId as string, item]));
const reference = recordsOf(
  record('A', { checklist: [5, 5], reviewed: true, mistakes: [mark('moved-stop', 'Moved my stop')] }),
  record('B', { checklist: [3, 5], reviewed: true, mistakes: [mark('moved-stop', 'Moved my stop'), mark('early-exit', 'Closed too early')] }),
);

describe('P22.4 projectDisciplineScore', () => {
  it('scores the reference case from the checklist and the reviews', () => {
    expect(projectDisciplineScore({ closedTradeIds: ['A', 'B', 'C'], records: reference })).toEqual({
      available: true,
      score: 73,
      basis: 'checklist-and-reviews',
      checklist: { tradeCount: 2, fullTradeCount: 1, tickedCount: 8, askedCount: 10, percent: 80 },
      review: { reviewedCount: 2, closedCount: 3, percent: 67 },
      topMistakes: [{ itemId: 'moved-stop', label: 'Moved my stop', count: 2 }, { itemId: 'early-exit', label: 'Closed too early', count: 1 }],
    });
  });

  it('gives the same score for the same ratios over more trades', () => {
    const doubled = new Map([...reference, ...[...reference].map(([id, item]) => [`${id}2`, { ...item, tradeId: `${id}2` as TradeId }] as const)]);
    const result = projectDisciplineScore({ closedTradeIds: ['A', 'B', 'C', 'A2', 'B2', 'C2'], records: doubled });
    expect(result.available && result.score).toBe(73);
  });

  it('uses the reviews alone when no trade had a checklist', () => {
    expect(projectDisciplineScore({ closedTradeIds: ['A', 'B'], records: recordsOf(record('A', { reviewed: true })) })).toMatchObject({ checklist: null, basis: 'reviews-only', score: 50 });
  });

  it('gives a real zero when trades closed and nothing was answered, and no score without closed trades', () => {
    expect(projectDisciplineScore({ closedTradeIds: ['A', 'B'], records: new Map() })).toMatchObject({ available: true, score: 0, review: { percent: 0 } });
    expect(projectDisciplineScore({ closedTradeIds: [], records: reference })).toEqual({ available: false, reason: 'no-closed-trades' });
  });

  it('rounds half up in whole numbers', () => {
    const eighth = projectDisciplineScore({ closedTradeIds: ['A'], records: recordsOf(record('A', { checklist: [1, 8] })) });
    expect(eighth).toMatchObject({ checklist: { percent: 13 }, score: 6 });
    const quarter = projectDisciplineScore({ closedTradeIds: ['A'], records: recordsOf(record('A', { checklist: [1, 4] })) });
    expect(quarter).toMatchObject({ score: 13 });
  });

  it('ignores an unfinished checklist, records of other trades and repeated ids', () => {
    const unfinished = { ...record('A', { checklist: [5, 5] }), checklistCompletedAt: null };
    expect(projectDisciplineScore({ closedTradeIds: ['A'], records: recordsOf(unfinished) })).toMatchObject({ checklist: null, score: 0 });
    expect(projectDisciplineScore({ closedTradeIds: ['A'], records: recordsOf(record('Z', { reviewed: true })) })).toMatchObject({ review: { reviewedCount: 0, closedCount: 1 } });
    expect(projectDisciplineScore({ closedTradeIds: ['A', 'A'], records: recordsOf(record('A', { reviewed: true })) })).toMatchObject({ review: { reviewedCount: 1, closedCount: 1 }, score: 100 });
  });

  it('labels a mistake with its newest words and keeps the three most frequent', () => {
    const labels = projectDisciplineScore({ closedTradeIds: ['A', 'B'], records: recordsOf(
      record('A', { reviewed: true, mistakes: [mark('x', 'Old words')], updatedAt: '2026-09-10T10:00:00.000Z' }),
      record('B', { reviewed: true, mistakes: [mark('x', 'New words')], updatedAt: '2026-09-12T10:00:00.000Z' }),
    ) });
    expect(labels.available && labels.topMistakes).toEqual([{ itemId: 'x', label: 'New words', count: 2 }]);
    const five = projectDisciplineScore({ closedTradeIds: ['A'], records: recordsOf(record('A', { reviewed: true, mistakes: ['e', 'c', 'a', 'd', 'b'].map((id) => mark(id, `Label ${id}`)) })) });
    expect(five.available && five.topMistakes.map((item) => item.label)).toEqual(['Label a', 'Label b', 'Label c']);
  });
});

const closedAt = (closeAt: string, exit = '110') => ({ symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-08-01T00:00:00.000Z', closedAt: closeAt, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-08-01T00:00:00.000Z' }, { type: 'exit', price: exit, quantity: '1', executedAt: closeAt }] } as const);
const review = (tradeId: TradeId) => ({ tradeId, scope: 'real' as const, half: 'review' as const, answers: [{ itemId: KAIROS_DEFAULT_DISCIPLINE_LISTS.review[0].id, answer: 'yes' as const }], mistakeIds: [], note: '' });
const now = '2026-09-18T12:00:00.000Z';
async function withZone(db: KairosDatabase, zone: string) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, now); }
async function closed(db: KairosDatabase, closeAt: string, exit = '110'): Promise<TradeId> {
  const saved = await saveManualTrade(db, closedAt(closeAt, exit));
  if (!saved.ok) throw new Error('fixture');
  return saved.tradeId as TradeId;
}
const scoreOf = async (db: KairosDatabase, monthKey?: string) => {
  const result = await loadDisciplineScore(db, { now, ...(monthKey ? { monthKey } : {}) });
  if (result.kind !== 'ready' || !result.score.available) throw new Error(`not ready: ${JSON.stringify(result)}`);
  return result.score;
};

describe('P22.4 loadDisciplineScore', () => {
  it('reads the month in the saved time zone', async () => {
    const db = await database();
    const august = await closed(db, '2026-08-31T23:30:00.000Z');
    await closed(db, '2026-09-10T10:00:00.000Z');
    expect((await saveTradeDiscipline(db, review(august))).ok).toBe(true);
    await withZone(db, 'UTC');
    expect((await scoreOf(db)).review).toEqual({ reviewedCount: 0, closedCount: 1, percent: 0 });
    expect((await scoreOf(db, '2026-08')).review).toEqual({ reviewedCount: 1, closedCount: 1, percent: 100 });
    await withZone(db, 'Australia/Sydney');
    expect((await scoreOf(db)).review).toEqual({ reviewedCount: 1, closedCount: 2, percent: 50 });
    const result = await loadDisciplineScore(db, { now });
    expect(result).toMatchObject({ kind: 'ready', timeZone: 'Australia/Sydney', monthKey: '2026-09' });
  });

  it('never counts practice trades', async () => {
    const db = await database();
    await withZone(db, 'UTC');
    await closed(db, '2026-09-10T10:00:00.000Z');
    const practice = await savePracticeTrade(db, closedAt('2026-09-11T10:00:00.000Z'));
    if (!practice.ok) throw new Error('fixture');
    expect((await saveTradeDiscipline(db, { ...review(practice.tradeId), scope: 'practice' })).ok).toBe(true);
    expect((await scoreOf(db)).review).toEqual({ reviewedCount: 0, closedCount: 1, percent: 0 });
  });

  it('gives the same projection whether the trade was a profit or a loss', async () => {
    const projections = [];
    for (const exit of ['150', '50']) {
      const db = await database();
      await withZone(db, 'UTC');
      const first = await closed(db, '2026-09-10T10:00:00.000Z', exit);
      await closed(db, '2026-09-11T10:00:00.000Z');
      expect((await saveTradeDiscipline(db, { ...review(first), mistakeIds: ['moved-stop'] })).ok).toBe(true);
      projections.push(await scoreOf(db));
    }
    expect(projections[0]).toEqual(projections[1]);
  });

  it('refuses without a time zone, with a bad month or a bad clock', async () => {
    const db = await database();
    expect(await loadDisciplineScore(db, { now })).toEqual({ kind: 'time-zone-unconfigured' });
    await withZone(db, 'UTC');
    expect(await loadDisciplineScore(db, { now, monthKey: '2026-13' })).toEqual({ kind: 'unavailable', reason: 'invalid-month' });
    expect(await loadDisciplineScore(db, { now: 'not a time' })).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
  });
});
