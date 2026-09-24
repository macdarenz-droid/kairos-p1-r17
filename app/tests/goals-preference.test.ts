import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_GOALS_PREFERENCE, GOALS_COUNT_TARGET_MAX, clearGoalsPreference, goalsPreferenceMetadataKey, parseGoalsPreferenceInput, readGoalsPreference, writeGoalsPreference } from '../src/application/goals';
import { createKairosDatabaseSnapshot } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p26-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

describe('P26.1 goals preference foundation', () => {
  it('parses typed targets: blank fields are unset goals, counts are positive integers within the cap, the result target needs a positive decimal and an upper-case currency', () => {
    expect(parseGoalsPreferenceInput({})).toEqual({ ok: true, preference: EMPTY_GOALS_PREFERENCE });
    expect(parseGoalsPreferenceInput({ tradesPerMonthTarget: ' 20 ', maxTradesPerDay: '3', monthlyResultTargetAmount: ' 500.50 ', monthlyResultTargetCurrency: ' usdt ' })).toEqual({ ok: true, preference: { tradesPerMonthTarget: 20, maxTradesPerDay: 3, monthlyResultTarget: { amount: '500.50', currency: 'USDT' } } });
    expect(parseGoalsPreferenceInput({ tradesPerMonthTarget: '0' })).toEqual({ ok: false, reason: 'trades-per-month-invalid' });
    expect(parseGoalsPreferenceInput({ tradesPerMonthTarget: '2.5' })).toEqual({ ok: false, reason: 'trades-per-month-invalid' });
    expect(parseGoalsPreferenceInput({ tradesPerMonthTarget: String(GOALS_COUNT_TARGET_MAX + 1) })).toEqual({ ok: false, reason: 'trades-per-month-invalid' });
    expect(parseGoalsPreferenceInput({ maxTradesPerDay: '-1' })).toEqual({ ok: false, reason: 'max-trades-per-day-invalid' });
    expect(parseGoalsPreferenceInput({ monthlyResultTargetAmount: '0', monthlyResultTargetCurrency: 'USDT' })).toEqual({ ok: false, reason: 'monthly-result-target-amount-invalid' });
    expect(parseGoalsPreferenceInput({ monthlyResultTargetAmount: '100' })).toEqual({ ok: false, reason: 'monthly-result-target-currency-invalid' });
    expect(parseGoalsPreferenceInput({ monthlyResultTargetCurrency: 'USDT' })).toEqual({ ok: false, reason: 'monthly-result-target-amount-invalid' });
    expect(parseGoalsPreferenceInput({ monthlyResultTargetAmount: '100', monthlyResultTargetCurrency: 'us' })).toEqual({ ok: false, reason: 'monthly-result-target-currency-invalid' });
  });

  it('round-trips the preference through the metadata repository under the reserved key and clears it', async () => {
    const db = createKairosDatabase(dbName('round-trip'));
    await openKairosDatabase(db);
    const { metadata } = createKairosRepositories(db);
    expect(await readGoalsPreference(metadata)).toEqual(EMPTY_GOALS_PREFERENCE);
    const written = await writeGoalsPreference(metadata, { tradesPerMonthTarget: '20', maxTradesPerDay: '3', monthlyResultTargetAmount: '500.50', monthlyResultTargetCurrency: 'usdt' }, '2026-09-18T14:00:00.000Z');
    expect(written.ok).toBe(true);
    const stored = await metadata.get(goalsPreferenceMetadataKey);
    expect(stored).toMatchObject({ key: 'preferences.goals.v1', updatedAt: '2026-09-18T14:00:00.000Z' });
    expect(JSON.parse(stored!.value)).toEqual({ version: 1, tradesPerMonthTarget: 20, maxTradesPerDay: 3, monthlyResultTarget: { amount: '500.50', currency: 'USDT' } });
    expect(await readGoalsPreference(metadata)).toEqual({ tradesPerMonthTarget: 20, maxTradesPerDay: 3, monthlyResultTarget: { amount: '500.50', currency: 'USDT' } });
    expect(await writeGoalsPreference(metadata, { tradesPerMonthTarget: 'x' }, '2026-09-18T14:01:00.000Z')).toEqual({ ok: false, reason: 'trades-per-month-invalid' });
    expect(await readGoalsPreference(metadata)).toMatchObject({ tradesPerMonthTarget: 20 });
    await writeGoalsPreference(metadata, { maxTradesPerDay: '5' }, '2026-09-18T14:02:00.000Z');
    expect(await readGoalsPreference(metadata)).toEqual({ tradesPerMonthTarget: null, maxTradesPerDay: 5, monthlyResultTarget: null });
    await clearGoalsPreference(metadata);
    expect(await metadata.get(goalsPreferenceMetadataKey)).toBeUndefined();
    expect(await readGoalsPreference(metadata)).toEqual(EMPTY_GOALS_PREFERENCE);
    db.close();
  });

  it('treats missing, malformed or foreign-version evidence as no goals set', async () => {
    const db = createKairosDatabase(dbName('malformed'));
    await openKairosDatabase(db);
    const { metadata } = createKairosRepositories(db);
    for (const value of ['not json', '{"version":2,"tradesPerMonthTarget":1,"maxTradesPerDay":null,"monthlyResultTarget":null}', '{"version":1,"tradesPerMonthTarget":0,"maxTradesPerDay":null,"monthlyResultTarget":null}', '{"version":1,"tradesPerMonthTarget":null,"maxTradesPerDay":null,"monthlyResultTarget":{"amount":"-1","currency":"USDT"}}', '{"version":1,"tradesPerMonthTarget":null,"maxTradesPerDay":null,"monthlyResultTarget":{"amount":"1","currency":"usdt"}}']) {
      await metadata.put({ key: goalsPreferenceMetadataKey, value, updatedAt: '2026-09-18T14:00:00.000Z' });
      expect(await readGoalsPreference(metadata)).toEqual(EMPTY_GOALS_PREFERENCE);
    }
    db.close();
  });

  it('is user data: the stored goals travel in the backup snapshot with the other preferences', async () => {
    const db = createKairosDatabase(dbName('backup'));
    await openKairosDatabase(db);
    const { metadata } = createKairosRepositories(db);
    await writeGoalsPreference(metadata, { tradesPerMonthTarget: '12' }, '2026-09-18T14:00:00.000Z');
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot.payload.metadata.map(record => record.key)).toEqual([goalsPreferenceMetadataKey]);
    db.close();
  });
});
