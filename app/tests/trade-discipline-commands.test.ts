import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTradeDiscipline, saveDisciplineLists, saveTradeDiscipline } from '../src/application/discipline';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord, TradeSource, TradeStatus } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-discipline-commands-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const T1 = '2026-09-24T10:00:00.000Z';
const T2 = '2026-09-24T11:00:00.000Z';
let ids = 0;
const deps = (at = T1) => ({ now: () => at, createId: () => `discipline-${++ids}` as TradeDisciplineId });

function trade(id: string, status: TradeStatus, source: TradeSource = 'manual'): TradeRecord {
  return {
    id: id as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status, source, grossPnlCurrency: 'USDT',
    openedAt: status === 'draft' ? null : '2026-09-24T08:00:00.000Z', closedAt: status === 'closed' ? '2026-09-24T09:00:00.000Z' : null,
    createdAt: '2026-09-24T08:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z',
  } as TradeRecord;
}
async function seed(db: KairosDatabase, ...records: TradeRecord[]) {
  await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { for (const record of records) await repositories.trades.put(record); });
}
const checklist = (tradeId: string, scope: 'real' | 'practice' = 'real') => ({ tradeId: tradeId as TradeId, scope, half: 'checklist' as const, answers: [{ itemId: 'plan-written', answer: 'yes' as const }, { itemId: 'stop-placed', answer: 'no' as const }] });

describe('P22.2 saveTradeDiscipline and loadTradeDiscipline', () => {
  it('saves a first checklist with labels from the lists and reads it back', async () => {
    const db = await database();
    await seed(db, trade('open-1', 'open'));
    const saved = await saveTradeDiscipline(db, checklist('open-1'), deps());
    if (!saved.ok) throw new Error(saved.reason);
    expect(saved.created).toBe(true);
    expect(saved.record).toMatchObject({
      tradeId: 'open-1',
      preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }, { itemId: 'stop-placed', label: 'I set my stop', answer: 'no' }],
      postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: T1, reviewedAt: null, createdAt: T1, updatedAt: T1,
    });
    const loaded = await loadTradeDiscipline(db, ['open-1' as TradeId]);
    expect(loaded).toEqual({ ok: true, records: new Map([['open-1', saved.record]]), damaged: 0 });
  });

  it('keeps the label as written, and takes the new label on the next save', async () => {
    const db = await database();
    await seed(db, trade('open-1', 'open'));
    const first = await saveTradeDiscipline(db, checklist('open-1'), deps(T1));
    if (!first.ok) throw new Error(first.reason);
    const renamed = { ...KAIROS_DEFAULT_DISCIPLINE_LISTS, checklist: KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.map((item) => (item.id === 'plan-written' ? { ...item, label: 'My plan is on paper' } : item)) };
    expect((await saveDisciplineLists(db, renamed)).ok).toBe(true);
    const before = await loadTradeDiscipline(db, ['open-1' as TradeId]);
    expect(before.ok && before.records.get('open-1' as TradeId)?.preTradeChecklist[0].label).toBe('I wrote down my plan');
    const second = await saveTradeDiscipline(db, checklist('open-1'), deps(T2));
    if (!second.ok) throw new Error(second.reason);
    expect(second.created).toBe(false);
    expect(second.record).toMatchObject({ id: first.record.id, createdAt: T1, updatedAt: T2 });
    expect(second.record.preTradeChecklist[0].label).toBe('My plan is on paper');
    expect(await db.tradeDiscipline.count()).toBe(1);
  });

  it('saves a review with mistakes and a trimmed note, keeping the checklist half', async () => {
    const db = await database();
    await seed(db, trade('t-1', 'open'));
    const first = await saveTradeDiscipline(db, checklist('t-1'), deps(T1));
    if (!first.ok) throw new Error(first.reason);
    await db.trades.update('t-1' as TradeId, { status: 'closed', closedAt: '2026-09-24T09:00:00.000Z' });
    const review = await saveTradeDiscipline(db, { tradeId: 't-1' as TradeId, scope: 'real', half: 'review', answers: [{ itemId: 'followed-plan', answer: 'no' }], mistakeIds: ['moved-stop', 'early-exit'], note: '  Moved the stop.  ' }, deps(T2));
    if (!review.ok) throw new Error(review.reason);
    expect(review.record).toMatchObject({
      preTradeChecklist: first.record.preTradeChecklist,
      postTradeReview: [{ itemId: 'followed-plan', label: 'I followed my plan', answer: 'no' }],
      mistakes: [{ itemId: 'moved-stop', label: 'Moved my stop' }, { itemId: 'early-exit', label: 'Closed too early' }],
      note: 'Moved the stop.', checklistCompletedAt: T1, reviewedAt: T2,
    });
  });

  it('allows the checklist only before close and the review only after', async () => {
    const db = await database();
    await seed(db, trade('closed-1', 'closed'), trade('open-1', 'open'), trade('cancelled-1', 'cancelled'));
    const review = (tradeId: string) => ({ tradeId: tradeId as TradeId, scope: 'real' as const, half: 'review' as const, answers: [], mistakeIds: ['oversized'], note: '' });
    const refused = { ok: false, type: 'not-allowed', reason: 'trade-status-not-allowed' };
    expect(await saveTradeDiscipline(db, checklist('closed-1'), deps())).toEqual(refused);
    expect(await saveTradeDiscipline(db, review('open-1'), deps())).toEqual(refused);
    expect(await saveTradeDiscipline(db, checklist('cancelled-1'), deps())).toEqual(refused);
    expect(await saveTradeDiscipline(db, review('cancelled-1'), deps())).toEqual(refused);
    expect(await db.tradeDiscipline.count()).toBe(0);
  });

  it('keeps real and practice apart', async () => {
    const db = await database();
    await seed(db, trade('paper-1', 'open', 'paper'), trade('manual-1', 'open', 'manual'));
    expect((await saveTradeDiscipline(db, checklist('paper-1', 'practice'), deps())).ok).toBe(true);
    const refused = { ok: false, type: 'not-allowed', reason: 'trade-not-in-scope' };
    expect(await saveTradeDiscipline(db, checklist('paper-1', 'real'), deps())).toEqual(refused);
    expect(await saveTradeDiscipline(db, checklist('manual-1', 'practice'), deps())).toEqual(refused);
    expect(await db.tradeDiscipline.count()).toBe(1);
  });

  it('refuses bad input and writes nothing', async () => {
    const db = await database();
    await seed(db, trade('open-1', 'open'), trade('closed-1', 'closed'));
    const cases: [Parameters<typeof saveTradeDiscipline>[1], unknown][] = [
      [{ ...checklist('open-1'), answers: [{ itemId: 'no-such-item', answer: 'yes' }] }, { ok: false, type: 'validation-error', reason: 'unknown-item' }],
      [{ ...checklist('open-1'), answers: [{ itemId: 'plan-written', answer: 'yes' }, { itemId: 'plan-written', answer: 'no' }] }, { ok: false, type: 'validation-error', reason: 'duplicate-item' }],
      [{ ...checklist('open-1'), answers: [] }, { ok: false, type: 'validation-error', reason: 'nothing-to-save' }],
      [{ tradeId: 'closed-1' as TradeId, scope: 'real', half: 'review', answers: [], mistakeIds: [], note: '   ' }, { ok: false, type: 'validation-error', reason: 'nothing-to-save' }],
      [{ tradeId: 'closed-1' as TradeId, scope: 'real', half: 'review', answers: [], mistakeIds: ['oversized'], note: 'x'.repeat(501) }, { ok: false, type: 'validation-error', reason: 'note-too-long' }],
      [checklist('missing'), { ok: false, type: 'not-found', reason: 'trade-not-found' }],
    ];
    for (const [input, expected] of cases) expect(await saveTradeDiscipline(db, input, deps())).toEqual(expected);
    expect(await db.tradeDiscipline.count()).toBe(0);
  });

  it('never writes the trade record', async () => {
    const db = await database();
    await seed(db, trade('open-1', 'open'));
    const before = await db.trades.get('open-1' as TradeId);
    expect((await saveTradeDiscipline(db, checklist('open-1'), deps())).ok).toBe(true);
    expect(await db.trades.get('open-1' as TradeId)).toEqual(before);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('reads only the trades asked for and leaves damaged records out', async () => {
    const db = await database();
    await seed(db, trade('open-1', 'open'), trade('open-2', 'open'), trade('open-3', 'open'));
    expect(await loadTradeDiscipline(db, [])).toEqual({ ok: true, records: new Map(), damaged: 0 });
    const saved = await saveTradeDiscipline(db, checklist('open-1'), deps());
    if (!saved.ok) throw new Error(saved.reason);
    const both = await loadTradeDiscipline(db, ['open-1' as TradeId, 'open-2' as TradeId, 'open-1' as TradeId]);
    expect(both).toEqual({ ok: true, records: new Map([['open-1', saved.record]]), damaged: 0 });
    const damaged: TradeDisciplineRecord = { ...saved.record, id: 'damaged' as TradeDisciplineId, tradeId: 'open-3' as TradeId, preTradeChecklist: [{ itemId: 'plan-written', label: '', answer: 'yes' }] };
    await db.tradeDiscipline.put(damaged);
    const withDamaged = await loadTradeDiscipline(db, ['open-1' as TradeId, 'open-3' as TradeId]);
    expect(withDamaged).toEqual({ ok: true, records: new Map([['open-1', saved.record]]), damaged: 1 });
  });
});
