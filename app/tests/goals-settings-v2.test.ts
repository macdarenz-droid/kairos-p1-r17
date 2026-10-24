import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import {
  EMPTY_GOALS_PREFERENCE, GOALS_PERIODS_MAX, goalsInForceOn, goalsPreferenceInputOf, goalsPreferenceMetadataKey, parseGoalsPreferenceInput, readGoalsPreference, readGoalsSettings,
  saveGoalsPreference, type GoalsPreference,
} from '../src/application/goals';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { KAIROS_BACKUP_FORMAT_NAME } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-goals-v2-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const d = (value: string) => value as DecimalString;
const v1 = JSON.stringify({ version: 1, tradesPerMonthTarget: 20, maxTradesPerDay: 3, monthlyResultTarget: null });
const goals = (overrides: Partial<GoalsPreference>): GoalsPreference => ({ ...EMPTY_GOALS_PREFERENCE, ...overrides });
const stored = async (db: KairosDatabase) => JSON.parse((await createKairosRepositories(db).metadata.get(goalsPreferenceMetadataKey))!.value);
const save = (db: KairosDatabase, input: Parameters<typeof saveGoalsPreference>[1], at: string) => saveGoalsPreference(db, input, { now: () => at });

describe('T-058a goals settings version 2', () => {
  it('parses the new goals: loss limits in one currency (a week never below a day) and the two habits', () => {
    expect(parseGoalsPreferenceInput({ lossLimitPerDay: ' 100 ', lossLimitPerWeek: '250.50', lossLimitCurrency: ' usdt ', reviewEveryTrade: true, tickEveryStep: true })).toEqual({
      ok: true, preference: goals({ lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: d('250.50') }, reviewEveryTrade: true, tickEveryStep: true }),
    });
    expect(parseGoalsPreferenceInput({ lossLimitPerWeek: '250', lossLimitCurrency: 'USD' })).toMatchObject({ ok: true, preference: { lossLimits: { currency: 'USD', perDay: null, perWeek: '250' } } });
    // The currency alone is no limit: the form fills it in.
    expect(parseGoalsPreferenceInput({ lossLimitCurrency: 'USDT' })).toEqual({ ok: true, preference: EMPTY_GOALS_PREFERENCE });
    expect(parseGoalsPreferenceInput({ lossLimitPerDay: '0', lossLimitCurrency: 'USDT' })).toEqual({ ok: false, reason: 'loss-limit-per-day-invalid' });
    expect(parseGoalsPreferenceInput({ lossLimitPerDay: '100', lossLimitPerWeek: '-5', lossLimitCurrency: 'x' })).toEqual({ ok: false, reason: 'loss-limit-per-week-invalid' });
    expect(parseGoalsPreferenceInput({ lossLimitPerDay: '100', lossLimitCurrency: 'us' })).toEqual({ ok: false, reason: 'loss-limit-currency-invalid' });
    expect(parseGoalsPreferenceInput({ lossLimitPerDay: '100', lossLimitPerWeek: '99.99', lossLimitCurrency: 'USDT' })).toEqual({ ok: false, reason: 'loss-limit-week-below-day' });
    expect(goalsPreferenceInputOf(goals({ maxTradesPerDay: 3, lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: null }, tickEveryStep: true }))).toEqual({
      tradesPerMonthTarget: '', maxTradesPerDay: '3', monthlyResultTargetAmount: '', monthlyResultTargetCurrency: '',
      lossLimitPerDay: '100', lossLimitPerWeek: '', lossLimitCurrency: 'USDT', reviewEveryTrade: false, tickEveryStep: true,
    });
  });

  it('reads version 1 as one period from the day it was saved, in the saved time zone or else UTC', async () => {
    const db = await database();
    const { metadata } = createKairosRepositories(db);
    await metadata.put({ key: goalsPreferenceMetadataKey, value: v1, updatedAt: '2026-09-18T22:30:00.000Z' });
    expect(await readGoalsSettings(metadata)).toEqual({ periods: [{ from: '2026-09-18', goals: goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }) }] });
    await writeVisualPnlTimeZonePreference(metadata, 'Asia/Manila', '2026-09-18T22:30:00.000Z');
    expect(await readGoalsSettings(metadata)).toEqual({ periods: [{ from: '2026-09-19', goals: goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }) }] });
    expect(await readGoalsPreference(metadata)).toEqual(goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }));
    // Reading never rewrites it.
    expect((await stored(db)).version).toBe(1);
  });

  it('keeps a history: a same-day save replaces, a new day adds a period, equal goals add nothing, and changing back merges', async () => {
    const db = await database();
    const { metadata } = createKairosRepositories(db);
    await metadata.put({ key: goalsPreferenceMetadataKey, value: v1, updatedAt: '2026-09-18T10:00:00.000Z' });
    expect((await save(db, { maxTradesPerDay: '2' }, '2026-10-01T09:00:00.000Z')).ok).toBe(true);
    expect(await stored(db)).toEqual({ version: 2, periods: [
      { from: '2026-09-18', goals: goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }) },
      { from: '2026-10-01', goals: goals({ maxTradesPerDay: 2 }) },
    ] });
    await save(db, { maxTradesPerDay: '4', reviewEveryTrade: true }, '2026-10-01T18:00:00.000Z');
    expect((await stored(db)).periods.map((period: { from: string }) => period.from)).toEqual(['2026-09-18', '2026-10-01']);
    expect((await stored(db)).periods[1].goals).toEqual(goals({ maxTradesPerDay: 4, reviewEveryTrade: true }));
    await save(db, { maxTradesPerDay: '4', reviewEveryTrade: true }, '2026-10-05T09:00:00.000Z');
    expect((await stored(db)).periods).toHaveLength(2);
    // Back to the goals before today's period: today's period goes.
    await save(db, { tradesPerMonthTarget: '20', maxTradesPerDay: '3' }, '2026-10-01T20:00:00.000Z');
    expect((await stored(db)).periods).toEqual([{ from: '2026-09-18', goals: goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }) }]);
    // Clearing every goal is a period too, so the days before keep their goals.
    await save(db, {}, '2026-10-10T09:00:00.000Z');
    expect(await readGoalsPreference(metadata)).toEqual(EMPTY_GOALS_PREFERENCE);
    expect((await stored(db)).periods).toHaveLength(2);
  });

  it(`keeps at most ${GOALS_PERIODS_MAX} periods, dropping the oldest`, async () => {
    const db = await database();
    for (let day = 0; day <= GOALS_PERIODS_MAX; day += 1) {
      await save(db, { maxTradesPerDay: String(day + 1) }, new Date(Date.UTC(2026, 0, 1 + day, 12)).toISOString());
    }
    const periods = (await stored(db)).periods;
    expect(periods).toHaveLength(GOALS_PERIODS_MAX);
    expect(periods[0]).toMatchObject({ from: '2026-01-02', goals: { maxTradesPerDay: 2 } });
  });

  it('knows the goals in force on a day: none before the first period or in an all-off period', () => {
    const settings = { periods: [
      { from: '2026-09-18', goals: goals({ maxTradesPerDay: 3 }) },
      { from: '2026-10-01', goals: EMPTY_GOALS_PREFERENCE },
      { from: '2026-10-10', goals: goals({ lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: null } }) },
    ] };
    expect(goalsInForceOn(settings, '2026-09-17')).toBeNull();
    expect(goalsInForceOn(settings, '2026-09-18')).toEqual(goals({ maxTradesPerDay: 3 }));
    expect(goalsInForceOn(settings, '2026-09-30')).toEqual(goals({ maxTradesPerDay: 3 }));
    expect(goalsInForceOn(settings, '2026-10-05')).toBeNull();
    expect(goalsInForceOn(settings, '2026-12-31')).toMatchObject({ lossLimits: { perDay: '100' } });
    expect(goalsInForceOn(null, '2026-10-05')).toBeNull();
  });

  it('reads a version 2 record that breaks its shape as no goals', async () => {
    const db = await database();
    const { metadata } = createKairosRepositories(db);
    const good = { tradesPerMonthTarget: null, maxTradesPerDay: 3, monthlyResultTarget: null, lossLimits: { currency: 'USDT', perDay: '100', perWeek: '250' }, reviewEveryTrade: false, tickEveryStep: false };
    const record = (periods: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ version: 2, periods, ...extra });
    await metadata.put({ key: goalsPreferenceMetadataKey, value: record([{ from: '2026-09-18', goals: good }]), updatedAt: '2026-09-18T10:00:00.000Z' });
    expect(await readGoalsPreference(metadata)).toMatchObject({ maxTradesPerDay: 3, lossLimits: { perWeek: '250' } });
    for (const bad of [
      record([{ from: '2026-09-18', goals: good }], { note: 'x' }),
      record([]),
      record([{ from: '2026-09-18', goals: { ...good, extra: 1 } }]),
      record([{ from: '2026-10-01', goals: good }, { from: '2026-09-18', goals: good }]),
      record([{ from: '2026-09-31', goals: good }]),
      record([{ from: '2026-09-18', goals: { ...good, lossLimits: { currency: 'USDT', perDay: ' 100', perWeek: null } } }]),
      record([{ from: '2026-09-18', goals: { ...good, lossLimits: { currency: 'USDT', perDay: '100', perWeek: '50' } } }]),
      record([{ from: '2026-09-18', goals: { ...good, lossLimits: { currency: 'usdt', perDay: '100', perWeek: null } } }]),
      record([{ from: '2026-09-18', goals: { ...good, lossLimits: { currency: 'USDT', perDay: null, perWeek: null } } }]),
      record([{ from: '2026-09-18', goals: { ...good, reviewEveryTrade: 'yes' } }]),
    ]) {
      await metadata.put({ key: goalsPreferenceMetadataKey, value: bad, updatedAt: '2026-09-18T10:00:00.000Z' });
      expect(await readGoalsPreference(metadata), bad).toEqual(EMPTY_GOALS_PREFERENCE);
    }
  });

  it('rides in backups: format 12 carries version 2, and a format 11 backup with version 1 restores and reads as version 1', async () => {
    const source = await database();
    await save(source, { lossLimitPerDay: '100', lossLimitCurrency: 'USDT', tickEveryStep: true }, '2026-10-01T09:00:00.000Z');
    const exported = await exportKairosBackup(source, new Date('2026-10-02T00:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    const target = await database();
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await readGoalsPreference(createKairosRepositories(target).metadata)).toEqual(goals({ lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: null }, tickEveryStep: true }));

    const at = '2026-09-18T10:00:00.000Z';
    const format11 = JSON.stringify({
      formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 11, appVersion: 'old', buildId: 'old', exportedAt: at, databaseSchemaVersion: 13,
      recordCounts: { metadata: 1, trades: 0, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 0, exchangeRates: 0, economicEvents: 0, total: 1 },
      payload: { metadata: [{ key: goalsPreferenceMetadataKey, value: v1, updatedAt: at }], trades: [], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [], exchangeRates: [], economicEvents: [] },
    });
    const old = await database();
    const restored = await prepareBackupRestore(old, format11);
    if (!restored.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(old, restored.restore)).ok).toBe(true);
    expect(await readGoalsSettings(createKairosRepositories(old).metadata)).toEqual({ periods: [{ from: '2026-09-18', goals: goals({ tradesPerMonthTarget: 20, maxTradesPerDay: 3 }) }] });
  });
});
